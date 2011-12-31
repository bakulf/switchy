/* See license.txt for terms of usage */

Components.utils.import("chrome://switchy/content/modules/switchy-manager.jsm");

// Main object for the manager (it's just a proxy for the single page objects)
function SwitchyManager() {}

// Initializer
SwitchyManager.initialize = function() {
    Services.obs.addObserver(SwitchyManager._sendPong, "Switchy-manager-ping", false);
    SwitchyOverlay.managerLoad();

    window.switchyManagerData = new SwitchyManagerData(window, document);

    // Send a message about the loading completed
    Services.obs.notifyObservers(window, "Switchy-manager-loaded", "");
}

// Shutdown
SwitchyManager.shutdown = function() {
    Services.obs.removeObserver(SwitchyManager._sendPong, "Switchy-manager-ping");

    if (!window.switchyManagerData)
        return;

    window.switchyManagerData.shutdown();
    window.switchyManagerData = null;
}

// Send a ping to inform when the UI is ready:
SwitchyManager._sendPong = function(aSubject, aTopic, aData) {
    Services.obs.notifyObservers(window, "Switchy-manager-pong", "");
}
