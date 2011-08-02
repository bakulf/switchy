Components.utils.import("resource://gre/modules/Services.jsm");

const SWITCHY_PROFILES = "profiles";
const SWITCHY_ADD      = "add";
const SWITCHY_ABOUT    = "about";

// Generic load for any window:
window.addEventListener("load", function() {
    var switchy = Components.classes['@baku.switchy/switchy;1']
                            .getService().wrappedJSObject;

    var appcontent = document.getElementById("appcontent");
    if(appcontent) {
        appcontent.addEventListener("DOMContentLoaded", function(evnt) {
            switchy.checkURL(evnt, window);
        }, true);
    }
}, false);

// Populate the panel:
function switchy_panelOpen() {
    var rows = document.getElementById('switchy-panel-rows');
    while(rows.firstChild)
       rows.removeChild(rows.firstChild);

    var switchy = Components.classes['@baku.switchy/switchy;1']
                            .getService().wrappedJSObject;
    var profiles = switchy.getProfileNames();
    var count = 0;

    for (var i = 0; i < profiles.length; ++i) {
        if (profiles[i] != switchy.currentProfile()) {
            ++count;

            var row = document.createElement('listitem');
            row.setAttribute('label', profiles[i]);
            row.setAttribute('onclick', 'switchy_panelSelected(this);');
            rows.appendChild(row);
        }
    }

    rows.setAttribute('rows', count);
}

// Manage the click on a profile
function switchy_panelSelected(obj) {
    var switchy = Components.classes['@baku.switchy/switchy;1']
                            .getService().wrappedJSObject;
    switchy.changeProfile(obj.label);

    document.getElementById('switchy-panel').hidePopup();
}

// Open the manager
function switchy_panelManager(page, newUrlObj) {
    if (!page)
        page = SWITCHY_PROFILES

    document.getElementById('switchy-panel').hidePopup();

    var URI = Services.io.newURI('chrome://switchy/content/manager.xul', null, null);

    var isBrowserWindow = !!window.gBrowser;

    // Prioritise this window.
    if (isBrowserWindow && switchy_switchIfURIInWindow(window, URI)) {
        switchy_panelManagerPageNoWin(page, newUrlObj);
        return;
    }

    var winEnum = Services.wm.getEnumerator("navigator:browser");
    while (winEnum.hasMoreElements()) {
        var browserWin = winEnum.getNext();

        // Skip closed (but not yet destroyed) windows,
        // and the current window (which was checked earlier).
        if (browserWin.closed || browserWin == window)
            continue;

        if (switchy_switchIfURIInWindow(browserWin, URI)) {
            switchy_panelManagerPageNoWin(page, newUrlObj);
            return;
        }
    }

    if (isBrowserWindow && switchy_isTabEmpty(gBrowser.selectedTab))
        gBrowser.selectedBrowser.loadURI(aURI.spec);
    else
        openUILinkIn(URI.spec, "tab");

    Services.obs.addObserver(function (aSubject, aTopic, aData) {
        Services.obs.removeObserver(arguments.callee, aTopic);
        switchy_panelManagerPage(aSubject, page, newUrlObj);
    }, "Switchy-manager-loaded", false);
}

function switchy_panelManagerPageNoWin(page, newUrlObj) {
    function receivePong(aSubject, aTopic, aData) {
        switchy_panelManagerPage(aSubject, page, newUrlObj);
    }

    Services.obs.addObserver(receivePong, "Switchy-manager-pong", false);
    Services.obs.notifyObservers(null, "Switchy-manager-ping", "");
    Services.obs.removeObserver(receivePong, "Switchy-manager-pong");
}

function switchy_panelManagerPage(win, page, newUrlObj) {
    if (page == SWITCHY_ADD)
       win.addURL(newUrlObj);

    if (page == SWITCHY_ABOUT)
        win.pageAbout();

    if (page == SWITCHY_PROFILES) {
        win.pageProfiles();
}
}

// This will switch to the tab in aWindow having aURI, if present.
function switchy_switchIfURIInWindow(aWindow, aURI) {
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
function switchy_isTabEmpty(aTab) {
    var browser = aTab.linkedBrowser;
    return browser.sessionHistory.count < 2 &&
           browser.currentURI.spec == "about:blank" &&
           !browser.contentDocument.body.hasChildNodes() &&
           !aTab.hasAttribute("busy");
}

// Update the panel for the dialog:
function switchy_profileListUpdate() {
    var profiles = window.arguments[0];

    var rows = document.getElementById('switchy-list-rows');

    for (var i = 0; i < profiles.length; ++i) {
        var row = document.createElement('listitem');
        row.setAttribute('label', profiles[i]);
        row.setAttribute('onclick', 'switchy_panelSelected(this);');
        rows.appendChild(row);
    }

    rows.setAttribute('rows', profiles.length);
}

// Open the about:
function switchy_about() {
    switchy_panelManager(SWITCHY_ABOUT);
}

// Configure the manager window:
function switchy_managerLoad() {
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

// Add wizard:
function switchy_add() {
    var win = window.QueryInterface(Components.interfaces.nsIInterfaceRequestor)
                    .getInterface(Components.interfaces.nsIWebNavigation)
                    .QueryInterface(Components.interfaces.nsIDocShellTreeItem)
                    .rootTreeItem
                    .QueryInterface(Components.interfaces.nsIInterfaceRequestor)
                    .getInterface(Components.interfaces.nsIDOMWindow);

    switchy_panelManager( SWITCHY_ADD,
                          { url:   win.getBrowser().currentURI.spec,
                            title: win.getBrowser().contentTitle } );
}
