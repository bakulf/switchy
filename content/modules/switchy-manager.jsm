/* See license.txt for terms of usage */

Components.utils.import("resource://gre/modules/Services.jsm");
Components.utils.import("resource://gre/modules/XPCOMUtils.jsm");
Components.utils.import("chrome://switchy/content/modules/switchy.jsm");
Components.utils.import("chrome://switchy/content/modules/switchy-utils.jsm");

var EXPORTED_SYMBOLS = ["SwitchyManagerData"];

// Objects -------------------------------------------------------------------

// Object for the 'add URL' view:
function SwitchyManagerAddUrl(window, document) {
    this.initialize(window, document);
}
SwitchyManagerAddUrl.prototype = {
    _data: null,
    _browser: null,
    _timer: null,

    _document: null,
    _window: null,

    initialize: function(window, document) {
        this._window = window;
        this._document = document;

        this._browser = this._document.getElementById('add-browser');
        this._browser.addProgressListener(this, Components.interfaces.nsIWebProgress.NOTIFY_ALL |
                                                Components.interfaces.nsIWebProgress.NOTIFY_STATE_ALL);
    },

    shutdown: function() {
        this._data = null;
        this._browser = null;
        this._timer = null;

        this._document = null;
        this._window = null;
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
            if (state == true && me._window.switchyManagerData)
                me._window.switchyManagerData.pageProfiles('alert-url-added');
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

        // Translate
        SwitchyUtils.translate(this._document.getElementById("switchystrings"), this._browser);

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
        var table = this._browser.contentDocument.getElementById('profiles-list');
        table.innerHTML = ''; // Fastest way to remove all the content

        var profiles = switchy.getProfileNames();

        var tr;

        for (var i = 0; i < profiles.length; ++i) {
            if (i == 0 || !(i % 3)) {
              tr = this._browser.contentDocument.createElement('tr');
              table.appendChild(tr);
            }

            var td = this._browser.contentDocument.createElement('td');
            tr.appendChild(td);

            var input = this._browser.contentDocument.createElement('input');
            input.setAttribute('type', 'checkbox');
            input.setAttribute('id', 'profile-' + profiles[i]);
            td.appendChild(input);

            var label = this._browser.contentDocument.createElement('label');
            label.setAttribute('for', 'profile-' + profiles[i]);
            td.appendChild(label);

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
};

// Object for the 'profiles list' view:
function SwitchyManagerProfiles(window, document) {
    this.initialize(window, document);
}
SwitchyManagerProfiles.prototype = {
    _browser: null,
    _alert: null,
    _timer: null,
    _prompt: null,

    _document: null,
    _window: null,

    initialize: function(window, document) {
        this._window = window;
        this._document = document;

        this._browser = this._document.getElementById('profiles-browser');
        this._browser.addProgressListener(this, Components.interfaces.nsIWebProgress.NOTIFY_ALL |
                                                Components.interfaces.nsIWebProgress.NOTIFY_STATE_ALL);
    },

    shutdown: function() {
        this._browser = null;
        this._alert = null;
        this._timer = null;
        this._prompt = null;

        this._document = null;
        this._window = null;
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

    createElementProfile: function(dom, profile) {

        let me = this;

        var strbundle = this._document.getElementById("switchystrings");

        // Title:
        var title = this._browser.contentDocument.createElement('h2');
        title.appendChild(this._browser.contentDocument.createTextNode(profile));
        dom.appendChild(title);

        // No 'delete' for the current profile:
        if (switchy.currentProfile() != profile)
        {
            var button = this._browser.contentDocument.createElement('input');
            button.setAttribute('class', 'right');
            button.setAttribute('type', 'button');
            button.setAttribute('value', strbundle.getString("Manager.profiles.delete"));
            title.appendChild(button);

            button.addEventListener('click', function() {
                me.deleteProfile(profile);
            }, false);
        }

        {
            var button = this._browser.contentDocument.createElement('input');
            button.setAttribute('class', 'right');
            button.setAttribute('type', 'button');
            button.setAttribute('value', strbundle.getString("Manager.profiles.rename"));
            title.appendChild(button);

            button.addEventListener('click', function() {
                me.renameProfile(profile);
            }, false);
        }

        {
            var button = this._browser.contentDocument.createElement('input');
            button.setAttribute('class', 'right');
            button.setAttribute('type', 'button');
            button.setAttribute('value', strbundle.getString("Manager.profiles.open"));
            title.appendChild(button);

            button.addEventListener('click', function() {
                me.openProfile(profile);
            }, false);
        }

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
            info.appendChild(this._browser.contentDocument.createTextNode(strbundle.getString("Manager.profiles.url")));
            h3.appendChild(info);

            let urlInput = this._browser.contentDocument.createElement('input');
            urlInput.setAttribute('type', 'text');
            urlInput.setAttribute('value', data[i].url().spec);
            h3.appendChild(urlInput);

            var button = this._browser.contentDocument.createElement('input');
            button.setAttribute('class', 'right');
            button.setAttribute('type', 'button');
            button.setAttribute('value', strbundle.getString("Manager.profiles.deleteUrl"));
            h3.appendChild(button);

            var table = this._browser.contentDocument.createElement('table');
            table.setAttribute('class', 'description');
            li.appendChild(table);

            var tr = this._browser.contentDocument.createElement('tr');
            table.appendChild(tr);

            var td;
            td = this._browser.contentDocument.createElement('td');
            tr.appendChild(td);

            info = this._browser.contentDocument.createElement('strong');
            info.appendChild(this._browser.contentDocument.createTextNode(strbundle.getString("Manager.profiles.type")));
            td.appendChild(info);

            let select = this._browser.contentDocument.createElement('select');
            td.appendChild(select);

            var option;
            option = this._browser.contentDocument.createElement('option');
            option.appendChild(this._browser.contentDocument.createTextNode(strbundle.getString('Manager.profiles.typeComplete')));
            if (data[i].typeString() == 'complete') option.setAttribute('selected', 'true');
            option.setAttribute('value', 'complete');
            select.appendChild(option);

            option = this._browser.contentDocument.createElement('option');
            if (data[i].typeString() == 'path') option.setAttribute('selected', 'true');
            option.setAttribute('value', 'path');
            option.appendChild(this._browser.contentDocument.createTextNode(strbundle.getString('Manager.profiles.typePath')));
            select.appendChild(option);

            option = this._browser.contentDocument.createElement('option');
            if (data[i].typeString() == 'host') option.setAttribute('selected', 'true');
            option.setAttribute('value', 'host');
            option.appendChild(this._browser.contentDocument.createTextNode(strbundle.getString('Manager.profiles.typeHost')));
            select.appendChild(option);

            option = this._browser.contentDocument.createElement('option');
            if (data[i].typeString() == 'domain') option.setAttribute('selected', 'true');
            option.setAttribute('value', 'domain');
            option.appendChild(this._browser.contentDocument.createTextNode(strbundle.getString('Manager.profiles.typeDomain')));
            select.appendChild(option);

            td = this._browser.contentDocument.createElement('td');
            tr.appendChild(td);

            info = this._browser.contentDocument.createElement('strong');
            info.appendChild(this._browser.contentDocument.createTextNode(strbundle.getString('Manager.profiles.onStartup')));
            td.appendChild(info);

            let startup = this._browser.contentDocument.createElement('input');
            startup.setAttribute('type', 'checkbox');
            if (data[i].startup()) startup.setAttribute('checked', 'true');
            td.appendChild(startup);

            td = this._browser.contentDocument.createElement('td');
            tr.appendChild(td);

            info = this._browser.contentDocument.createElement('strong');
            info.appendChild(this._browser.contentDocument.createTextNode(strbundle.getString('Manager.profiles.exclusive')));
            td.appendChild(info);

            let exclusive = this._browser.contentDocument.createElement('input');
            exclusive.setAttribute('type', 'checkbox');
            if (data[i].exclusive()) exclusive.setAttribute('checked', 'true');
            td.appendChild(exclusive);

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

    needPrompt: function() {
        if (!this._prompt) {
            this._prompt = Components.classes["@mozilla.org/embedcomp/prompt-service;1"]
                                     .getService(Components.interfaces.nsIPromptService);
        }
    },

    deleteProfile: function(profile) {
        var deleteFiles = false;

        var strbundle = this._document.getElementById("switchystrings");

        var selectedProfile = switchy.profileService().selectedProfile;
        if (selectedProfile.rootDir.exists()) {
            var msg = strbundle.getFormattedString('Manager.profiles.deleteProfileConfirm', [selectedProfile.rootDir.path]);

            this.needPrompt();

            var buttonPressed = this._prompt.confirmEx(this._window, strbundle.getString('Manager.profiles.deleteProfileTitle'), msg,
                          (this._prompt.BUTTON_TITLE_IS_STRING * this._prompt.BUTTON_POS_0) +
                          (this._prompt.BUTTON_TITLE_CANCEL    * this._prompt.BUTTON_POS_1) +
                          (this._prompt.BUTTON_TITLE_IS_STRING * this._prompt.BUTTON_POS_2),
                          strbundle.getString('Manager.profiles.deleteProfileDoNot'),
                          null,
                          strbundle.getString('Manager.profiles.deleteProfileDo'),
                          null, {value:0});
            if (buttonPressed == 1)
                return false;

            if (buttonPressed == 2)
                deleteFiles = true;
        }

        switchy.deleteProfile(profile, deleteFiles);
        this.show();
    },

    openProfile: function(profile) {
        switchy.changeProfile(this._window, profile);
    },

    renameProfile: function(profile) {
        this.needPrompt();

        var strbundle = this._document.getElementById("switchystrings");

        var newName = {value: profile};
        var msg = strbundle.getFormattedString('Manager.profiles.renameProfile', [profile]);

        if (this._prompt.prompt(this._window, strbundle.getString('Manager.profiles.renameProfileTitle'), msg, newName, null, {value:0})) {
            newName = newName.value;

            // User hasn't changed the profile name. Treat as if cancel was pressed.
            if (newName == profile)
                return false;

            switchy.renameProfile(profile, newName);
            this.show();
        }
    },

    deleteURL: function(profile, url) {
        // Wait...
        this.showAlert('alert-wait');

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

        // Translate
        SwitchyUtils.translate(this._document.getElementById("switchystrings"), this._browser);

        // Alert:
        this.disableAlerts();
        if (this._alert) {
            this.showAlert(this._alert);
            this._alert = null;
        }

        // At the click, let's open the profile manager:
        var me = this;
        this._browser.contentDocument.getElementById('create').addEventListener('click', function() {

            if (!me._window.CreateProfile) {
                me._window.CreateProfile = function(profile) {
                    // Called by the profile wizard. Nothing to do.
                };
            }

            var win = me._window.openDialog('chrome://mozapps/content/profile/createProfileWizard.xul',
                                            '', 'centerscreen,chrome,modal,titlebar',
                                            switchy.profileService());
            me.show();

            switchy.syncProfiles();
            switchy.checkNewProfiles();
        }, false);

        var dom = this._browser.contentDocument.getElementById('profiles-list');
        dom.innerHTML = ''; // Fastest way to remove all the content

        var profiles = switchy.getProfileNames();
        for (var i = 0; i < profiles.length; ++i) {
            this.createElementProfile(dom, profiles[i]);
        }
    },

    onStatusChange: function() { },

    QueryInterface: XPCOMUtils.generateQI([Components.interfaces.nsIWebProgressListener,
                                           Components.interfaces.nsISupportsWeakReference])
};

// Object for the 'settings' view:
function SwitchyManagerSettings(window, document) {
    this.initialize(window, document);
}
SwitchyManagerSettings.prototype = {
    _browser: null,

    _document: null,
    _window: null,

    initialize: function(window, document) {
        this._window = window;
        this._document = document;

        this._browser = this._document.getElementById('settings-browser');
        this._browser.addProgressListener(this, Components.interfaces.nsIWebProgress.NOTIFY_ALL |
                                                Components.interfaces.nsIWebProgress.NOTIFY_STATE_ALL);
    },

    shutdown: function() {
        this._browser = null;

        this._document = null;
        this._window = null;
    },

    show: function() {
        this._browser.loadURIWithFlags('chrome://switchy/content/manager/settings.html',
                                       Components.interfaces.nsIWebNavigation.LOAD_FLAGS_REPLACE_HISTORY);
    },

    setData: function(args) {
        // No data for the settings
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

        // Translate
        SwitchyUtils.translate(this._document.getElementById("switchystrings"), this._browser);

        switch (switchy.getPrefs('closeCurrentProfile')) {
            case 'yes':
                 this._browser.contentDocument.getElementById('cc_yes').checked = true;
                 break;

            case 'no':
                 this._browser.contentDocument.getElementById('cc_no').checked = true;
                 break;

            case 'ask':
                 this._browser.contentDocument.getElementById('cc_ask').checked = true;
                 break;
        }

        var me = this;
        this._browser.contentDocument.getElementById('save').addEventListener('click', function() {
             me.saved();
        }, false);

        this._browser.contentDocument.getElementById('fp').value = switchy.getPrefs('firefoxPath');
        this._browser.contentDocument.getElementById('qt').value = switchy.getPrefs('timeoutQuit');


        // alerts:
        this.disableAlert();
    },

    onStatusChange: function() { },

    saved: function() {
        if (this._browser.contentDocument.getElementById('cc_yes').checked)
          switchy.setPrefs('closeCurrentProfile', 'yes');
        else if (this._browser.contentDocument.getElementById('cc_no').checked)
          switchy.setPrefs('closeCurrentProfile', 'no');
        else
          switchy.setPrefs('closeCurrentProfile', 'ask');

        switchy.setPrefs('firefoxPath', this._browser.contentDocument.getElementById('fp').value);

        var qt = parseInt(this._browser.contentDocument.getElementById('qt').value);
        if (!qt || qt < 0) qt = 0;
        this._browser.contentDocument.getElementById('qt').value = qt;
        switchy.setPrefs('timeoutQuit', qt);

        this.showAlert();
    },

    disableAlert: function() {
        this._browser.contentDocument.getElementById('alert').hidden = true;
    },

    showAlert: function() {
        this._browser.contentDocument.getElementById('alert').hidden = false;

        if (!this._timer)
            this._timer = Components.classes["@mozilla.org/timer;1"]
                                    .createInstance(Components.interfaces.nsITimer);
        else
            this._timer.cancel();

        let me = this;
        var eventTimeout = { notify: function(timer) { me.disableAlert(); } }
        this._timer.initWithCallback(eventTimeout, 3000, Components.interfaces.nsITimer.TYPE_ONE_SHOT);
    },

    QueryInterface: XPCOMUtils.generateQI([Components.interfaces.nsIWebProgressListener,
                                           Components.interfaces.nsISupportsWeakReference])
};

// Object for the 'about' view:
function SwitchyManagerAbout(window, document) {
    this.initialize(window, document);
}
SwitchyManagerAbout.prototype = {
    _browser: null,

    _document: null,
    _window: null,

    initialize: function(window, document) {
        this._window = window;
        this._document = document;

        this._browser = this._document.getElementById('about-browser');
    },

    shutdown: function() {
        this._browser = null;

        this._document = null;
        this._window = null;
    },

    show: function() {
        this._browser.loadURIWithFlags('chrome://switchy/content/manager/about.html',
                                       Components.interfaces.nsIWebNavigation.LOAD_FLAGS_REPLACE_HISTORY);
    },

    setData: function(args) {
        // No data for the about
    }
};

// Object data
function SwitchyManagerData(window, document) {
    this.initialize(window, document);
}
SwitchyManagerData.prototype = {
    document : null,

    node : null,
    pages : null,

    initialize : function(window, document) {
        this.document = document;

        this.node = document.getElementById("categories");
        this.pages = [
            { funcName: 'addURL',       id: 'category-add',      page_id: 'add-view',      obj: new SwitchyManagerAddUrl(window, document)   },
            { funcName: 'pageProfiles', id: 'category-profiles', page_id: 'profiles-view', obj: new SwitchyManagerProfiles(window, document) },
            { funcName: 'pageSettings', id: 'category-settings', page_id: 'settings-view', obj: new SwitchyManagerSettings(window, document) },
            { funcName: 'pageAbout',    id: 'category-about',    page_id: 'about-view',    obj: new SwitchyManagerAbout(window, document)    }
        ];

        // Event listener:
        var me = this;
        this.node.addEventListener("select", function() { me._pageSelected(); }, false);

        // Select a view:
        this.node.selectItem(document.getElementById(this.pages[0].id));
        this._pageSelected();
    },

    shutdown : function() {
        // Shutdown any object:
        for (var i = 0; i < this.pages.length; ++i) {
            this.pages[i].obj.shutdown();
        }

        this.document = null;
    },

    _pageSelected : function() {
        for (var i = 0; i < this.pages.length; ++i) {
            if (this.pages[i].id == this.node.selectedItem.id) {
                this.document.getElementById(this.pages[i].page_id).hidden = false;
                this.pages[i].obj.show();
            } else {
                this.document.getElementById(this.pages[i].page_id).hidden = true;
            }
        }
    },

    __noSuchMethod__ : function(id, args) {
        for (var i = 0; i < this.pages.length; ++i) {
            if (id == this.pages[i].funcName) {
                this.pages[i].obj.setData(args);
                this.node.selectItem(this.document.getElementById(this.pages[i].id));
                break;
            }
        }
    }
};
