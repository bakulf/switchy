/* See license.txt for terms of usage */

Components.utils.import("chrome://switchy/content/modules/switchy-manager.jsm");

// Main object for the manager (it's just a proxy for the single page objects)
function SwitchyManager() {}

// Initializer
SwitchyManager.initialize = function() {
    Services.obs.addObserver(SwitchyManager._sendPong, "Switchy-manager-ping", false);
    SwitchyOverlay.managerLoad();

    SwitchyManagerData.node = document.getElementById("categories");
    SwitchyManagerData.document = document;

    // Initialization of any object:
    for (var i = 0; i < SwitchyManagerData.pages.length; ++i)
        SwitchyManagerData.pages[i].obj.initialize(document, window);

    // Event listener:
    SwitchyManagerData.node.addEventListener("select", function() { SwitchyManager._pageSelected(); }, false);

    // Select a view:
    SwitchyManagerData.node.selectItem(document.getElementById(SwitchyManagerData.pages[0].id));
    SwitchyManager._pageSelected();

    // Send a message about the loading completed
    Services.obs.notifyObservers(null, "Switchy-manager-loaded", "");
}

// Shutdown
SwitchyManager.shutdown = function() {
    Services.obs.removeObserver(SwitchyManager._sendPong, "Switchy-manager-ping");

    // Shutdown any object:
    for (var i = 0; i < SwitchyManagerData.pages.length; ++i)
        SwitchyManagerData.pages[i].obj.shutdown();
}

// Send a ping to inform when the UI is ready:
SwitchyManager._sendPong = function(aSubject, aTopic, aData) {
    Services.obs.notifyObservers(null, "Switchy-manager-pong", "");
}

SwitchyManager._pageSelected = function() {
    for (var i = 0; i < SwitchyManagerData.pages.length; ++i) {
        if (SwitchyManagerData.pages[i].id == SwitchyManagerData.node.selectedItem.id) {
            document.getElementById(SwitchyManagerData.pages[i].page_id).hidden = false;
            SwitchyManagerData.pages[i].obj.show();
        } else {
            document.getElementById(SwitchyManagerData.pages[i].page_id).hidden = true;
        }
    }
}

SwitchyManager.__noSuchMethod__ = function(id, args) {
    for (var i = 0; i < SwitchyManagerData.pages.length; ++i) {
        if (id == SwitchyManagerData.pages[i].funcName) {
            SwitchyManagerData.pages[i].obj.setData(args);
            SwitchyManagerData.node.selectItem(SwitchyManagerData.document.getElementById(SwitchyManagerData.pages[i].id));
            break;
        }
    }
}
