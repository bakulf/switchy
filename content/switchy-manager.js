function switchy_manager_initialize() {
    Services.obs.addObserver(switchy_sendPong, "Switchy-manager-ping", false);
    switchy_managerLoad();

    gSwitchyManager.initialize();
}

function switchy_manager_shutdown() {
    Services.obs.removeObserver(switchy_sendPong, "Switchy-manager-ping");
    gSwitchyManager.shutdown();
}

function switchy_sendPong(aSubject, aTopic, aData) {
    Services.obs.notifyObservers(window, "Switchy-manager-pong", "");
}

function addURL(obj) {
    gSwitchyManager.addURL(obj);
}

function pageAbout() {
    gSwitchyManager.pageAbout();
}

function pageProfiles() {
    gSwitchyManager.pageProfiles();
}

var gSwitchyManager = {
    _node: null,
    _pages: [ { funcName: 'addURL',       id: 'category-add',      func: 'refreshAdd',      page_id: 'add-view'     },
              { funcName: 'pageProfiles', id: 'category-profiles', func: 'refreshProfiles', page_id: 'profile-view' },
              { funcName: 'pageAbout',    id: 'category-about',    func: 'refreshAbout',    page_id: 'about-view'   } ],

    initialize: function() {
        this._node = document.getElementById("categories");

        var me = this;
        this._node.addEventListener("select", function() {
            for (var i = 0; i < me._pages.length; ++i) {
                if (me._pages[i].id == me._node.selectedItem.id) {
                    document.getElementById(me._pages[i].page_id).hidden = false;
                    me[me._pages[i].func]();
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
                this._node.selectItem(document.getElementById(this._pages[i].id));
                break;
            }
        }
    },

    // Functions -------------------------------------------------------------

    refreshAdd: function(args) {
        // TODO
    },

    refreshAbout: function(args) {
        // TODO
    },

    refreshProfiles: function(args) {
        // TODO
    }
};
