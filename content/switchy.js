/* See license.txt for terms of usage */

Components.utils.import("resource://gre/modules/Services.jsm");
Components.utils.import("chrome://switchy/content/modules/switchy.jsm");
Components.utils.import("chrome://switchy/content/modules/switchy-manager.jsm");

// Generic load for any window:
window.addEventListener("load", function() {
    var appcontent = document.getElementById("appcontent");
    if(appcontent) {
        appcontent.addEventListener("DOMContentLoaded", function(evnt) {
            var doc = evnt.originalTarget;
            var win = doc.defaultView;

            if (doc.nodeName != "#document") return;
            if (win != win.top) return;
            if (win.frameElement) return;

            switchy.checkURL(evnt, window);
        }, true);
    }

    if (switchy.firstRun()) {
        SwitchyOverlay.addIcon();
    }
}, false);

function SwitchyOverlay() {}

SwitchyOverlay.SWITCHY_PROFILES = "profiles";
SwitchyOverlay.SWITCHY_ADD      = "add";
SwitchyOverlay.SWITCHY_ABOUT    = "about";

// Add the icon to the navBar
SwitchyOverlay.addIcon = function() {
    var icon   = "switchy-toolbarbutton";
    var navBar = document.getElementById("nav-bar") || document.getElementById("addon-bar");
    var obj    = document.getElementById(icon);

    navBar.insertItem(icon, null, null, false);
    navBar.setAttribute("currentset", navBar.currentSet);
    document.persist(navBar.id, "currentset");
}

// Populate the panel:
SwitchyOverlay.panelOpen = function() {
    var rows = document.getElementById('switchy-panel-rows');
    while(rows.firstChild)
       rows.removeChild(rows.firstChild);

    var profiles = switchy.getProfileNames();
    var count = 0;

    for (var i = 0; i < profiles.length; ++i) {
        if (profiles[i] != switchy.currentProfile()) {
            ++count;

            let row = document.createElement('listitem');
            row.setAttribute('label', profiles[i]);
            row.addEventListener('click', function() { SwitchyOverlay._panelSelected(row); }, false);
            rows.appendChild(row);
        }
    }

    rows.setAttribute('rows', count);

    // Current profile:
    var title = document.getElementById('switchy-current-profile');
    title.value = switchy.currentProfile();
}

// Manage the click on a profile
SwitchyOverlay._panelSelected = function(obj) {
    switchy.changeProfile(obj.label);
    document.getElementById('switchy-panel').hidePopup();
}

// Open the manager
SwitchyOverlay.panelManager = function(page, newUrlObj) {
    if (!page)
        page = SwitchyOverlay.SWITCHY_PROFILES;

    document.getElementById('switchy-panel').hidePopup();

    var URI = Services.io.newURI('chrome://switchy/content/manager.xul', null, null);

    var isBrowserWindow = !!window.gBrowser;

    // Prioritise this window.
    if (isBrowserWindow && SwitchyOverlay._switchIfURIInWindow(window, URI)) {
        SwitchyOverlay._panelManagerPageNoWin(page, newUrlObj);
        return;
    }

    var winEnum = Services.wm.getEnumerator("navigator:browser");
    while (winEnum.hasMoreElements()) {
        var browserWin = winEnum.getNext();

        // Skip closed (but not yet destroyed) windows,
        // and the current window (which was checked earlier).
        if (browserWin.closed || browserWin == window)
            continue;

        if (SwitchyOverlay._switchIfURIInWindow(browserWin, URI)) {
            SwitchyOverlay._panelManagerPageNoWin(page, newUrlObj);
            return;
        }
    }

    if (isBrowserWindow && SwitchyOverlay._isTabEmpty(gBrowser.selectedTab))
        gBrowser.selectedBrowser.loadURI(URI.spec);
    else
        openUILinkIn(URI.spec, "tab");

    Services.obs.addObserver(function (aSubject, aTopic, aData) {
        Services.obs.removeObserver(arguments.callee, aTopic);
        SwitchyOverlay._panelManagerPage(aSubject, page, newUrlObj);
    }, "Switchy-manager-loaded", false);
}

// Add wizard:
SwitchyOverlay.add = function() {
    var win = window.QueryInterface(Components.interfaces.nsIInterfaceRequestor)
                    .getInterface(Components.interfaces.nsIWebNavigation)
                    .QueryInterface(Components.interfaces.nsIDocShellTreeItem)
                    .rootTreeItem
                    .QueryInterface(Components.interfaces.nsIInterfaceRequestor)
                    .getInterface(Components.interfaces.nsIDOMWindow);

    SwitchyOverlay.panelManager( SwitchyOverlay.SWITCHY_ADD,
                                 { url:   win.getBrowser().currentURI.spec,
                                   title: win.getBrowser().contentTitle } );
}

// Open the about:
SwitchyOverlay.about = function() {
    SwitchyOverlay.panelManager(SwitchyOverlay.SWITCHY_ABOUT);
}

SwitchyOverlay._panelManagerPageNoWin = function(page, newUrlObj) {
    function receivePong(aSubject, aTopic, aData) {
        SwitchyOverlay._panelManagerPage(aSubject, page, newUrlObj);
    }

    Services.obs.addObserver(receivePong, "Switchy-manager-pong", false);
    Services.obs.notifyObservers(null, "Switchy-manager-ping", "");
    Services.obs.removeObserver(receivePong, "Switchy-manager-pong");
}

SwitchyOverlay._panelManagerPage = function(win, page, newUrlObj) {
    if (!win.switchyManagerData)
        return;

    if (page == SwitchyOverlay.SWITCHY_ADD)
       win.switchyManagerData.addURL(newUrlObj);

    if (page == SwitchyOverlay.SWITCHY_ABOUT)
        win.switchyManagerData.pageAbout();

    if (page == SwitchyOverlay.SWITCHY_PROFILES)
        win.switchyManagerData.pageProfiles();
}

// This will switch to the tab in aWindow having aURI, if present.
SwitchyOverlay._switchIfURIInWindow = function(aWindow, aURI) {
    var browsers = aWindow.gBrowser.browsers;
    for (var i = 0; i < browsers.length; ++i) {
        var browser = browsers[i];
        if (browser.currentURI.equals(aURI)) {
            // Focus the matching window & tab
            aWindow.focus();
            aWindow.gBrowser.tabContainer.selectedIndex = i;
            return true;
        }
    }
    return false;
}

/*
 * Determines if a tab is "empty", usually used in the context of determining
 * if it's ok to close the tab.
 */
SwitchyOverlay._isTabEmpty = function(aTab) {
    var browser = aTab.linkedBrowser;
    return browser.sessionHistory.count < 2 &&
           browser.currentURI.spec == "about:blank" &&
           !browser.contentDocument.body.hasChildNodes() &&
           !aTab.hasAttribute("busy");
}

// Update the panel for the dialog:
SwitchyOverlay.profileListUpdate = function() {
    var data = window.arguments[0];

    var rows = document.getElementById('switchy-list-rows');

    for (var i = 0; i < data.profiles.length; ++i) {
        let row = document.createElement('listitem');
        row.setAttribute('label', data.profiles[i]);
        row.addEventListener('click', function() { SwitchyOverlay._profileListSelected(row); }, false);
        rows.appendChild(row);
    }

    rows.setAttribute('rows', obj.profiles.length);
}

// callback when a profile is chosen
SwitchyOverlay._profileListSelected = function(obj) {
    var data = window.arguments[0];
    switchy.changeProfile(obj.label, data.url);
}

// Configure the manager window:
SwitchyOverlay.managerLoad = function() {
    var win = window.QueryInterface(Components.interfaces.nsIInterfaceRequestor)
                    .getInterface(Components.interfaces.nsIWebNavigation)
                    .QueryInterface(Components.interfaces.nsIDocShellTreeItem)
                    .rootTreeItem
                    .QueryInterface(Components.interfaces.nsIInterfaceRequestor)
                    .getInterface(Components.interfaces.nsIDOMWindow);

    try {
        win.document.documentElement.setAttribute("disablechrome", "true");
        document.documentElement.setAttribute("disablechrome", "true");
    } catch(e) {}

    // Emm... I want to be in the white-list :)
    try {
        win.top.XULBrowserWindow.inContentWhitelist.push('chrome://switchy/content/manager.xul');
    } catch(e) {}
}
