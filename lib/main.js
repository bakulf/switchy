/* See license.txt for terms of usage */

let events = require("sdk/system/events");
let file = require("sdk/io/file");
let notifications = require("sdk/notifications");
let self = require('sdk/self');
let tabsUtils = require("sdk/tabs/utils");
let url = require('sdk/url');
let wu = require('sdk/window/utils');
let { on, once, off, emit, count } = require("sdk/event/core");
let { Cc, Ci, Cu } = require('chrome');
let { viewFor } = require("sdk/view/core");

Cu.import("chrome://switchy/content/modules/switchy.jsm");
Cu.import("resource://gre/modules/Services.jsm");

// Init/Shutdown
exports.main = function(options, callbacks) {
  switchy.init();
  button.label = switchy.currentProfileName();
  button.badge = switchy.currentProfileName();
}

exports.onUnload = function(reason) {
  switchy.shutdown();
}

require("sdk/tabs").on("ready", function(tab) {
  switchy.checkURL(tab.url, viewFor(tab.window));
});

// UI button
let { ToggleButton } = require('sdk/ui/button/toggle');
let panels = require('sdk/panel');

let button = ToggleButton({
  id: 'switchy-button',
  label: "Switchy",
  icon: {
    '16': './icons/icon-16.png',
    '32': './icons/icon-32.png',
    '64': './icons/icon-64.png'
  },
  onChange: function(state) {
    if (state.checked) {
      panel.show({
        position: button
      });
    }
  }
});

let panel = panels.Panel({
  contentURL: self.data.url('panel.html'),
  contentScriptFile: self.data.url('panel.js'),
  onHide: function() {
    button.state('window', {checked: false});
  }
});

panel.on("show", function() {
  let obj = { profileNames: switchy.getProfileNames(),
              currentProfile: switchy.currentProfileName() };
  panel.port.emit("show", obj);
});

panel.port.on('changeProfile', function(profile) {
  let win = wu.getMostRecentBrowserWindow();
  switchy.changeProfile(win, profile);
});

panel.port.on('add', function() {
  let win = wu.getMostRecentBrowserWindow();
  win = win.QueryInterface(Ci.nsIInterfaceRequestor)
           .getInterface(Ci.nsIWebNavigation)
           .QueryInterface(Ci.nsIDocShellTreeItem)
           .rootTreeItem
           .QueryInterface(Ci.nsIInterfaceRequestor)
           .getInterface(Ci.nsIDOMWindow);

  SwitchyOverlay.panelManager( SwitchyOverlay.SWITCHY_ADD,
                               win.getBrowser().currentURI.spec );
  panel.hide();
});

panel.port.on('manager', function() {
  SwitchyOverlay.panelManager(SwitchyOverlay.SWITCHY_PROFILES);
  panel.hide();
});

panel.port.on('settings', function() {
  SwitchyOverlay.panelManager(SwitchyOverlay.SWITCHY_SETTINGS);
  panel.hide();
});

panel.port.on('about', function() {
  SwitchyOverlay.panelManager(SwitchyOverlay.SWITCHY_ABOUT);
  panel.hide();
});

let SwitchyOverlay = {
  SWITCHY_PROFILES: "profiles",
  SWITCHY_ADD:      "add",
  SWITCHY_SETTINGS: "settings",
  SWITCHY_ABOUT:    "about",

  // Open the manager
  panelManager: function(page, newUrlObj) {
    if (!page) {
      page = this.SWITCHY_PROFILES;
    }

    // This object maybe doesn't exist (if the navBar doesn't contain the switchy's icon)
    try {
      document.getElementById('switchy-panel').hidePopup();
    } catch(e) { }

    let self = this;
    Services.obs.addObserver(function (aSubject, aTopic, aData) {
      Services.obs.removeObserver(arguments.callee, aTopic);
      self._panelManagerPage(aSubject, page, newUrlObj);
    }, "Switchy-manager-loaded", false);

    let win = wu.getMostRecentBrowserWindow();
    tabsUtils.openTab(win, 'chrome://switchy/content/manager.xul');
  },

  // Add wizard:
  add: function() {
    let win = window.QueryInterface(Ci.nsIInterfaceRequestor)
                    .getInterface(Ci.nsIWebNavigation)
                    .QueryInterface(Ci.nsIDocShellTreeItem)
                    .rootTreeItem
                    .QueryInterface(Ci.nsIInterfaceRequestor)
                    .getInterface(Ci.nsIDOMWindow);

    this.panelManager(this.SWITCHY_ADD,
                     { url:   win.getBrowser().currentURI.spec,
                       title: win.getBrowser().contentTitle } );
  },

  // Open the settings:
  settings: function() {
    this.panelManager(this.SWITCHY_SETTINGS);
  },

  // Open the about:
  about: function() {
    this.panelManager(this.SWITCHY_ABOUT);
  },

  _panelManagerPageNoWin: function(page, newUrlObj) {
    function receivePong(aSubject, aTopic, aData) {
      this._panelManagerPage(aSubject, page, newUrlObj);
    }

    Services.obs.addObserver(receivePong, "Switchy-manager-pong", false);
    Services.obs.notifyObservers(null, "Switchy-manager-ping", "");
    Services.obs.removeObserver(receivePong, "Switchy-manager-pong");
  },

  _panelManagerPage: function(win, page, newUrlObj) {
    if (!win.switchyManagerData) {
      return;
    }

    if (page == this.SWITCHY_ADD) {
       win.switchyManagerData.addURL(newUrlObj);
    }

    if (page == this.SWITCHY_SETTINGS) {
      win.switchyManagerData.pageSettings();
    }

    if (page == this.SWITCHY_ABOUT) {
      win.switchyManagerData.pageAbout();
    }

    if (page == this.SWITCHY_PROFILES) {
      win.switchyManagerData.pageProfiles();
    }
  }
}
