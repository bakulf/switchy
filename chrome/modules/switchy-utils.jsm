/* See license.txt for terms of usage */

Components.utils.import("resource://gre/modules/Services.jsm");

var EXPORTED_SYMBOLS = ["SwitchyUtils"];

function SwitchyUtils() {}

SwitchyUtils.openUrl = function(win, url) {
    var isBrowserWindow = !!win.gBrowser;

    // Prioritise this window.
    if (isBrowserWindow && switchy_switchIfURIInWindow(win, url))
        return;

    var winEnum = Services.wm.getEnumerator("navigator:browser");
    while (winEnum.hasMoreElements()) {
        var browserWin = winEnum.getNext();

        // Skip closed (but not yet destroyed) windows,
        // and the current window (which was checked earlier).
        if (browserWin.closed || browserWin == win)
            continue;

        if (switchy_switchIfURIInWindow(browserWin, url))
            return;
    }

    if (isBrowserWindow && switchy_isTabEmpty(win.gBrowser.selectedTab))
        win.gBrowser.selectedBrowser.loadURI(url.spec);
    else
        win.openUILinkIn(url.spec, "tab");
}

// Translate a page
SwitchyUtils.translate = function(strbundle, browser) {
    var list = browser.contentDocument.getElementsByClassName('trans');
    for (var i = 0; i < list.length; ++i) {
       list[i].innerHTML = strbundle.getString(list[i].innerHTML);
    }

    list = browser.contentDocument.getElementsByClassName('transattr');
    for (var i = 0; i < list.length; ++i) {
       var attr = list[i].getAttribute('data-trans');
       list[i].setAttribute(attr, strbundle.getString(list[i].getAttribute(attr)));
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

