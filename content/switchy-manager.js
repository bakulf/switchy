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

    show: function() {
        dump('URL: ' + this._data.url + '\n');
        // TODO
    },

    setData: function(args) {
        try {
            this._data = args[0];
        } catch(e) {
            this._data = null;
        }
    }
}

// Object for the 'profiles list' view:
var gSwitchyManagerProfiles = {
    show: function() {
        dump('p\n');
        // TODO
    },

    setData: function(args) {
        // No data for the profiles list
    }
}

// Object for the 'about' view:
var gSwitchyManagerAbout = {
    show: function() {
        dump('aa\n');
        // TODO
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

        var me = this;
        this._node.addEventListener("select", function() {
            for (var i = 0; i < me._pages.length; ++i) {
                if (me._pages[i].id == me._node.selectedItem.id) {
                    document.getElementById(me._pages[i].page_id).hidden = false;
                    me._pages[i].obj.show();
                } else {
                    document.getElementById(me._pages[i].page_id).hidden = true;
                }
            }
        }, false);

        Services.obs.notifyObservers(window, "Switchy-manager-loaded", "");
    },

    shutdown: function() {
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
