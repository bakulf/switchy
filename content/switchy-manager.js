Components.utils.import("resource://gre/modules/XPCOMUtils.jsm");

// Initializer
function switchy_manager_initialize() {
    Services.obs.addObserver(switchy_sendPong, "Switchy-manager-ping", false);
    switchy_managerLoad();

    gSwitchyManager.initialize();
}

// Shutdown
function switchy_manager_shutdown() {
    Services.obs.removeObserver(switchy_sendPong, "Switchy-manager-ping");
    gSwitchyManager.shutdown();
}

// Send a ping to inform when the UI is ready:
function switchy_sendPong(aSubject, aTopic, aData) {
    Services.obs.notifyObservers(window, "Switchy-manager-pong", "");
}

// functions useful for the views
function addURL(obj) {
    gSwitchyManager.addURL(obj);
}

function pageAbout() {
    gSwitchyManager.pageAbout();
}

function pageProfiles() {
    gSwitchyManager.pageProfiles();
}

// Objects -------------------------------------------------------------------

// Object for the 'add URL' view:
var gSwitchyManagerAddUrl = {
    _data: null,
    _browser: null,
    _timer: null,

    initialize: function() {
        this._browser = document.getElementById('add-browser');
        this._browser.addProgressListener(this, Components.interfaces.nsIWebProgress.NOTIFY_ALL |
                                                Components.interfaces.nsIWebProgress.NOTIFY_STATE_ALL);
    },

    shutdown: function() {
    },

    show: function() {
        this._browser.loadURI('chrome://switchy/content/manager/add.html');
    },

    setData: function(args) {
        try {
            this._data = args[0];
        } catch(e) {
            this._data = null;
        }
    },

    createClicked: function() {
        var switchy = Components.classes['@baku.switchy/switchy;1']
                                .getService().wrappedJSObject;

        // Getting data:
        var url = this._browser.contentDocument.getElementById('add-url').value;

        var type;

        if (this._browser.contentDocument.getElementById('add-type-complete').checked)
            type = 'complete';

        if (this._browser.contentDocument.getElementById('add-type-path').checked)
            type = 'path';

        if (this._browser.contentDocument.getElementById('add-type-host').checked)
            type = 'host';

        if (this._browser.contentDocument.getElementById('add-type-domain').checked)
            type = 'domain';

        var profiles = switchy.getProfileNames();
        var listProfiles = [];
        for (var i = 0; i < profiles.length; ++i) {
            var profile = this._browser.contentDocument.getElementById('profile-' + profiles[i]);
            if (profile.checked)
                listProfiles.push(profiles[i]);
        }

        var onStartup = this._browser.contentDocument.getElementById('on-startup').checked;
        var exclusive = this._browser.contentDocument.getElementById('on-exclusive').checked;

        // Disable the alerts:
        this.disableAlerts();

        // Validation:
        try {
          url = Services.io.newURI(url, null, null);
        } catch(e) {
          url = null;
        }

        if (url == null) {
            this.showAlert('alert-url');
            return;
        }

        if (!type) {
            this.showAlert('alert-type');
            return;
        }

        if (listProfiles.length == 0) {
            this.showAlert('alert-profiles');
            return;
        }

        // Adding
        let me = this;
        switchy.addURL(null, url, type, listProfiles, onStartup, exclusive, function(state) {
            // Change Page:
            if (state == true)
                gSwitchyManager.pageProfiles('alert-url-added');
            else
                me.showAlert('alert-error');
        });
    },

    disableAlerts: function() {
        var alerts = [ 'alert-url', 'alert-type', 'alert-profiles', 'alert-error' ];
        for (var i = 0; i < alerts.length; ++i) {
            this._browser.contentDocument.getElementById(alerts[i]).hidden = true;
        }
    },

    showAlert: function(str) {
        this._browser.contentDocument.getElementById(str).hidden = false;

        if (!this._timer)
            this._timer = Components.classes["@mozilla.org/timer;1"]
                                    .createInstance(Components.interfaces.nsITimer);
        else
            this._timer.cancel();

        let me = this;
        var eventTimeout = { notify: function(timer) { me.disableAlerts(); } }
        this._timer.initWithCallback(eventTimeout, 3000, Components.interfaces.nsITimer.TYPE_ONE_SHOT);
    },

    // For progress listener
    onLocationChange: function(aWebProgress, aRequest, aLocation) { },

    onProgressChange: function() { },

    onSecurityChange: function(aWebProgress, aRequest, aState) { },

    onStateChange: function(aWebProgress, aRequest, aStateFlags, aStatus) {
        // Don't care about state but window
        if (!(aStateFlags & (Components.interfaces.nsIWebProgressListener.STATE_IS_WINDOW)))
            return;

        // Only when the operation is concluded
        if (!(aStateFlags & (Components.interfaces.nsIWebProgressListener.STATE_STOP)))
            return;

        // Disable the alerts:
        this.disableAlerts();

        // URL:
        if (this._data) {
            this._browser.contentDocument.getElementById('add-url').value = this._data.url;
        } else {
            this._browser.contentDocument.getElementById('add-url').value = '';
        }

        // Check the raccomanded value for the type:
        this._browser.contentDocument.getElementById('add-type-host').checked = true;

        // Populate the list of profiles:
        var rows = this._browser.contentDocument.getElementById('profiles-list');
        rows.innerHTML = ''; // Fastest way to remove all the content

        var switchy = Components.classes['@baku.switchy/switchy;1']
                                .getService().wrappedJSObject;
        var profiles = switchy.getProfileNames();

        for (var i = 0; i < profiles.length; ++i) {
            var li = this._browser.contentDocument.createElement('li');
            rows.appendChild(li);

            var input = this._browser.contentDocument.createElement('input');
            input.setAttribute('type', 'checkbox');
            input.setAttribute('id', 'profile-' + profiles[i]);
            li.appendChild(input);

            var label = this._browser.contentDocument.createElement('label');
            label.setAttribute('for', 'profile-' + profiles[i]);
            li.appendChild(label);

            var text = this._browser.contentDocument.createTextNode(profiles[i]);
            label.appendChild(text);
        }

        // Default value for the 'on startup'
        this._browser.contentDocument.getElementById('on-startup').checked = false;
        this._browser.contentDocument.getElementById('on-exclusive').checked = false;

        // Connect the button:
        var me = this;
        this._browser.contentDocument.getElementById("create").addEventListener("click", function() {
            me.createClicked();
        }, false);
    },

    onStatusChange: function() { },

    QueryInterface: XPCOMUtils.generateQI([Components.interfaces.nsIWebProgressListener,
                                           Components.interfaces.nsISupportsWeakReference])
}

// Object for the 'profiles list' view:
var gSwitchyManagerProfiles = {
    _browser: null,
    _alert: null,
    _timer: null,

    initialize: function() {
        this._browser = document.getElementById('profiles-browser');
        this._browser.addProgressListener(this, Components.interfaces.nsIWebProgress.NOTIFY_ALL |
                                                Components.interfaces.nsIWebProgress.NOTIFY_STATE_ALL);
    },

    shutdown: function() {
    },

    show: function() {
        this._browser.loadURIWithFlags('chrome://switchy/content/manager/profiles.html',
                                       Components.interfaces.nsIWebNavigation.LOAD_FLAGS_REPLACE_HISTORY);
    },

    setData: function(args) {
        try {
            this._alert = args[0];
        } catch(e) { }
    },

    createElementProfile: function(switchy, dom, profile) {

        // Title:
        var title = this._browser.contentDocument.createElement('h2');
        title.appendChild(this._browser.contentDocument.createTextNode(profile));
        dom.appendChild(title);

        var obj = this._browser.contentDocument.createElement('ul');
        dom.appendChild(obj);

        // List of URLs:
        var data = switchy.getUrlsForProfile(profile);
        for (var i = 0; i<data.length; ++i) {
            var li = this._browser.contentDocument.createElement('li');
            obj.appendChild(li);

            var h3 = this._browser.contentDocument.createElement('h3');
            li.appendChild(h3);

            var info;
            info = this._browser.contentDocument.createElement('strong');
            info.appendChild(this._browser.contentDocument.createTextNode('URL'));
            h3.appendChild(info);

            let urlInput = this._browser.contentDocument.createElement('input');
            urlInput.setAttribute('type', 'text');
            urlInput.setAttribute('value', data[i].url().spec);
            h3.appendChild(urlInput);

            var button = this._browser.contentDocument.createElement('input');
            button.setAttribute('type', 'button');
            button.setAttribute('value', 'delete');
            h3.appendChild(button);

            var desc = this._browser.contentDocument.createElement('div');
            desc.setAttribute('class', 'description');
            li.appendChild(desc);

            var div = this._browser.contentDocument.createElement('div');
            desc.appendChild(div);

            info = this._browser.contentDocument.createElement('strong');
            info.appendChild(this._browser.contentDocument.createTextNode('Type'));
            div.appendChild(info);

            let select = this._browser.contentDocument.createElement('select');
            div.appendChild(select);

            var option;
            option = this._browser.contentDocument.createElement('option');
            option.appendChild(this._browser.contentDocument.createTextNode('Complete'));
            if (data[i].typeString() == 'complete') option.setAttribute('selected', 'true');
            option.setAttribute('value', 'complete');
            select.appendChild(option);

            option = this._browser.contentDocument.createElement('option');
            if (data[i].typeString() == 'path') option.setAttribute('selected', 'true');
            option.setAttribute('value', 'path');
            option.appendChild(this._browser.contentDocument.createTextNode('Path'));
            select.appendChild(option);

            option = this._browser.contentDocument.createElement('option');
            if (data[i].typeString() == 'host') option.setAttribute('selected', 'true');
            option.setAttribute('value', 'host');
            option.appendChild(this._browser.contentDocument.createTextNode('Host'));
            select.appendChild(option);

            option = this._browser.contentDocument.createElement('option');
            if (data[i].typeString() == 'domain') option.setAttribute('selected', 'true');
            option.setAttribute('value', 'domain');
            option.appendChild(this._browser.contentDocument.createTextNode('Domain'));
            select.appendChild(option);

            var div = this._browser.contentDocument.createElement('div');
            desc.appendChild(div);

            info = this._browser.contentDocument.createElement('strong');
            info.appendChild(this._browser.contentDocument.createTextNode('On Startup'));
            div.appendChild(info);

            let startup = this._browser.contentDocument.createElement('input');
            startup.setAttribute('type', 'checkbox');
            if (data[i].startup()) startup.setAttribute('checked', 'true');
            div.appendChild(startup);

            var div = this._browser.contentDocument.createElement('div');
            desc.appendChild(div);

            info = this._browser.contentDocument.createElement('strong');
            info.appendChild(this._browser.contentDocument.createTextNode('Exclusive'));
            div.appendChild(info);

            let exclusive = this._browser.contentDocument.createElement('input');
            exclusive.setAttribute('type', 'checkbox');
            if (data[i].exclusive()) exclusive.setAttribute('checked', 'true');
            div.appendChild(exclusive);

            let me = this;
            let url = data[i].url().spec;
            let item = data[i];

            button.addEventListener('click', function() {
                me.deleteURL(profile, url);
            }, false);

            select.addEventListener('change', function() {
                me.valueChanged(profile, item, urlInput, select, startup, exclusive);
            }, false);

            startup.addEventListener('change', function() {
                me.valueChanged(profile, item, urlInput, select, startup, exclusive);
            }, false);

            exclusive.addEventListener('change', function() {
                me.valueChanged(profile, item, urlInput, select, startup, exclusive);
            }, false);

            urlInput.addEventListener('change', function() {
                me.valueChanged(profile, item, urlInput, select, startup, exclusive);
            }, false);
        }
    },

    deleteURL: function(profile, url) {
        // Wait...
        this.showAlert('alert-wait');

        var switchy = Components.classes['@baku.switchy/switchy;1']
                                .getService().wrappedJSObject;
        var me = this;
        switchy.deleteURL(profile, url, function(state) {
            me._alert = (state == true ? 'alert-url-saved' : 'alert-url-error');
            me.show();
        });
    },

    valueChanged: function(profile, item, url, select, startup, exclusive) {
        try {
            url = Services.io.newURI(url.value, null, null);
        } catch(e) {
            this.showAlert('alert-url-error');
            return;
        }

        // Wait...
        this.showAlert('alert-wait');

        var switchy = Components.classes['@baku.switchy/switchy;1']
                                .getService().wrappedJSObject;
        var me = this;
        switchy.addURL(item.url(), url, select.value, [profile], startup.checked, exclusive.checked, function(state) {
            me._alert = (state == true ? 'alert-url-saved' : 'alert-url-error');
            me.show();
        });
    },

    disableAlerts: function() {
        var alerts = [ 'alert-wait', 'alert-url-added', 'alert-url-saved', 'alert-url-error' ];
        for (var i = 0; i < alerts.length; ++i)
            this._browser.contentDocument.getElementById(alerts[i]).hidden = true;
    },

    showAlert: function(str) {
        this._browser.contentDocument.getElementById(str).hidden = false;

        if (!this._timer)
            this._timer = Components.classes["@mozilla.org/timer;1"]
                                    .createInstance(Components.interfaces.nsITimer);
        else
            this._timer.cancel();

        let me = this;
        var eventTimeout = { notify: function(timer) { me.disableAlerts(); } }
        this._timer.initWithCallback(eventTimeout, 3000, Components.interfaces.nsITimer.TYPE_ONE_SHOT);
    },

    // For progress listener
    onLocationChange: function(aWebProgress, aRequest, aLocation) { },

    onProgressChange: function() { },

    onSecurityChange: function(aWebProgress, aRequest, aState) { },

    onStateChange: function(aWebProgress, aRequest, aStateFlags, aStatus) {
        // Don't care about state but window
        if (!(aStateFlags & (Components.interfaces.nsIWebProgressListener.STATE_IS_WINDOW)))
            return;

        // Only when the operation is concluded
        if (!(aStateFlags & (Components.interfaces.nsIWebProgressListener.STATE_STOP)))
            return;

        // Alert:
        this.disableAlerts();
        if (this._alert) {
            this.showAlert(this._alert);
            this._alert = null;
        }

        // At the click, let's open the profile manager:
        var me = this;
        this._browser.contentDocument.getElementById('create').addEventListener('click', function() {
            var params = Components.classes["@mozilla.org/embedcomp/dialogparam;1"]
                                   .createInstance(Components.interfaces.nsIDialogParamBlock);
            params.objects = Components.classes["@mozilla.org/array;1"]
                                       .createInstance(Components.interfaces.nsIMutableArray);

            var win = window.openDialog('chrome://mozapps/content/profile/profileSelection.xul','profile',
                                    'chrome,dialog,centerscreen,modal', params);
            me.show();

            var switchy = Components.classes['@baku.switchy/switchy;1']
                                    .getService().wrappedJSObject;
            switchy.syncProfiles();
            switchy.checkNewProfiles();

            var profile = params.GetString(0);
            if (params.GetInt(0)) {
                if (confirm('Are you sure you want open the profile "' + profile + '"?')) {
                    switchy.changeProfile(profile);
                }
            }
        }, false);

        var dom = this._browser.contentDocument.getElementById('profiles-list');
        dom.innerHTML = ''; // Fastest way to remove all the content

        var switchy = Components.classes['@baku.switchy/switchy;1']
                                .getService().wrappedJSObject;

        var profiles = switchy.getProfileNames();
        for (var i = 0; i < profiles.length; ++i) {
            this.createElementProfile(switchy, dom, profiles[i]);
        }
    },

    onStatusChange: function() { },

    QueryInterface: XPCOMUtils.generateQI([Components.interfaces.nsIWebProgressListener,
                                           Components.interfaces.nsISupportsWeakReference])
}

// Object for the 'about' view:
var gSwitchyManagerAbout = {
    _browser: null,

    initialize: function() {
        this._browser = document.getElementById('about-browser');
    },

    shutdown: function() {
    },

    show: function() {
        this._browser.loadURIWithFlags('chrome://switchy/content/manager/about.html',
                                       Components.interfaces.nsIWebNavigation.LOAD_FLAGS_REPLACE_HISTORY);
    },

    setData: function(args) {
        // No data for the about
    }
}

// Main object for the manager (it's just a proxy for the single page objects)
var gSwitchyManager = {
    _node: null,
    _pages: [ { funcName: 'addURL',       id: 'category-add',      page_id: 'add-view',      obj: gSwitchyManagerAddUrl   },
              { funcName: 'pageProfiles', id: 'category-profiles', page_id: 'profiles-view', obj: gSwitchyManagerProfiles },
              { funcName: 'pageAbout',    id: 'category-about',    page_id: 'about-view',    obj: gSwitchyManagerAbout    } ],

    initialize: function() {
        this._node = document.getElementById("categories");

        // Initialization of any object:
        for (var i = 0; i < this._pages.length; ++i)
            this._pages[i].obj.initialize();

        // Event listener:
        var me = this;
        this._node.addEventListener("select", function() { me.pageSelected(); }, false);

        // Select a view:
        this._node.selectItem(document.getElementById(this._pages[0].id));
        this.pageSelected();

        // Send a message about the loading completed
        Services.obs.notifyObservers(window, "Switchy-manager-loaded", "");
    },

    pageSelected: function() {
        for (var i = 0; i < this._pages.length; ++i) {
            if (this._pages[i].id == this._node.selectedItem.id) {
                document.getElementById(this._pages[i].page_id).hidden = false;
                this._pages[i].obj.show();
            } else {
                document.getElementById(this._pages[i].page_id).hidden = true;
            }
        }
    },

    shutdown: function() {
        // Shutdown any object:
        for (var i = 0; i < this._pages.length; ++i)
            this._pages[i].obj.shutdown();
    },

    __noSuchMethod__: function(id, args) {
        for (var i = 0; i < this._pages.length; ++i) {
            if (id == this._pages[i].funcName) {
                this._pages[i].obj.setData(args);
                this._node.selectItem(document.getElementById(this._pages[i].id));
                break;
            }
        }
    }
}
