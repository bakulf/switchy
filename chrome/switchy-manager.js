/* See license.txt for terms of usage */

const {classes: Cc, interfaces: Ci, utils: Cu, results: Cr} = Components;

Cu.import("chrome://switchy/content/modules/switchy-manager.jsm");

// Main object for the manager (it's just a proxy for the single page objects)
function SwitchyManager() {}

// Initializer
SwitchyManager.initialize = function() {
    Services.obs.addObserver(SwitchyManager._sendPong, "Switchy-manager-ping", false);

    let win = window.QueryInterface(Ci.nsIInterfaceRequestor)
                    .getInterface(Ci.nsIWebNavigation)
                    .QueryInterface(Ci.nsIDocShellTreeItem)
                    .rootTreeItem
                    .QueryInterface(Ci.nsIInterfaceRequestor)
                    .getInterface(Ci.nsIDOMWindow);

    try {
      win.document.documentElement.setAttribute("disablechrome", "true");
      document.documentElement.setAttribute("disablechrome", "true");
    } catch(e) {}

    // Emm... I want to be in the white-list :)
    try {
      win.top.XULBrowserWindow.inContentWhitelist.push('chrome://switchy/content/manager.xul');
    } catch(e) {}

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
