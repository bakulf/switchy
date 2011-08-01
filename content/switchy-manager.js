function switchy_manager_initialize() {
    Services.obs.notifyObservers(window, "Switchy-manager-loaded", "");
    switchy_managerLoad();
}

function switchy_manager_shutdown() {
}

function switchy_manager_addURL(obj) {
    gSwitchyManager.addURL(obj);
}

function switchy_manager_pageAbout() {
    gSwitchyManager.pageAbout();
}

function switchy_manager_pageProfiles() {
    gSwitchyManager.pageProfiles();
}

var gSwitchyManager = {
    addURL: function(obj) {
        // TODO
    },

   pageProfiles: function() {
       // TODO
   },

   pageAbout: function() {
       // TODO
   }
};
