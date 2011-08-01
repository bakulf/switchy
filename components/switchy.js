/* See license.txt for terms of usage */

Components.utils.import("resource://gre/modules/XPCOMUtils.jsm");
Components.utils.import("resource://gre/modules/FileUtils.jsm");
Components.utils.import("resource://gre/modules/Services.jsm");

// Gecko 1.9.0/1.9.1 compatibility - add XPCOMUtils.defineLazyServiceGetter
if (!("defineLazyServiceGetter" in XPCOMUtils)) {
    XPCOMUtils.defineLazyServiceGetter = function XPCU_defineLazyServiceGetter(obj, prop, contract, iface) {
        obj.__defineGetter__(prop, function XPCU_serviceGetter() {
            delete obj[prop];
            return obj[prop] = Components.classes[contract]
                                         .getService(Components.interfaces[iface]);
        });
    };
}

// Load dependences:
XPCOMUtils.defineLazyServiceGetter(this, "loader", "@mozilla.org/moz/jssubscript-loader;1", "mozIJSSubScriptLoader");

/**
 * Application startup/shutdown observer, triggers init()/shutdown() methods in 'switchy' object.
 * @constructor
 */
function SwitchyInitializer() {}
SwitchyInitializer.prototype = {
    classDescription: "Switchy initializer",
    contractID: "@baku.switchy/switchyStartup;1",
    classID: Components.ID("{5db0fd9e-3184-4451-b668-744349ab1e9d}"),
    _xpcom_categories: [{ category: "app-startup", service: true }],

    QueryInterface: XPCOMUtils.generateQI([Components.interfaces.nsIObserver, Components.interfaces.nsISupportsWeakReference]),

    observe: function(subject, topic, data) {
        switch(topic) {
            case "app-startup":
                let observerService = Components.classes["@mozilla.org/observer-service;1"]
                                                .getService(Components.interfaces.nsIObserverService);
                observerService.addObserver(this, "profile-after-change", true);
                observerService.addObserver(this, "quit-application", true);
                break;
            case "profile-after-change":
                // delayed init for Fennec
                let appInfo = Components.classes["@mozilla.org/xre/app-info;1"]
                                        .getService(Components.interfaces.nsIXULAppInfo);
                if (appInfo.ID != "{1810dfbe-8d2e-4ce4-bd51-ffd3a5a6da67}")
                    Switchy.init();
                break;
            case "quit-application":
                Switchy.shutdown();
                break;
        }
    }
};

// Switchy Component
const Switchy = {
    // properties required for XPCOM registration:
    classDescription: "Switchy Javascript XPCOM Component",
    classID:          Components.ID("{1810dfbe-8d2e-4ce4-bd51-ffd3a5a6da67}"),
    contractID:       "@baku.switchy/switchy;1",

    _xpcom_categories: [{ category: "app-startup", service: true }],

    QueryInterface: XPCOMUtils.generateQI([Components.interfaces.nsIProfile]),

    // ...component implementation...
    _initialized: false,
    _profileService: null,
    _ww: null,
    _db: null,
    _cache: {},
    _timer: null,

    // Queries:
    _createTableSQL: '' +
        'CREATE TABLE IF NOT EXISTS websites (' +
        '  website char(255),                 ' +
        '  profile char(255)                  ' +
        ')',
    _selectQuerySQL: 'SELECT * FROM websites',

    init: function() {
        if (this._initialized)
            return;
        this._initialized = true;

        // Profile Service:
        this._profileService = Components.classes["@mozilla.org/toolkit/profile-service;1"]
                                         .createInstance(Components.interfaces.nsIToolkitProfileService);

        // Database for the global config:
        var file = FileUtils.getFile("DefProfRt", ["switchy.sqlite3"]);

        var storageService = Components.classes['@mozilla.org/storage/service;1']
                                       .getService(Components.interfaces.mozIStorageService);
        this._db = storageService.openDatabase(file);

        // Table creation:
        this._db.executeSimpleSQL(this._createTable);
        this.populateCache();
    },

    shutdown: function() {
        if (this._db)
            this._db.close();
    },

    currentProfile: function() {
        return this._profileService.selectedProfile.name;
    },

    getProfileNames: function() {
        var names = [];

        var itr = this._profileService.profiles;
        while(itr.hasMoreElements()) {
            var profile = itr.getNext().QueryInterface(Components.interfaces.nsIToolkitProfile);
            names.push(profile.name);
        }

        return names;
    },

    changeProfiles: function (profileArray, win) {
        if (profileArray.length == 1)
            return this.changeProfile(profileArray[0]);

        win.openDialog('chrome://switchy/content/profiles.xul', 'Choose a profile',
                       'chrome,dialog,centerscreen', profileArray);
    },

    changeProfile: function(profileName) {
        var env = Components.classes["@mozilla.org/process/environment;1"]
                            .getService(Components.interfaces.nsIEnvironment);

        var profile;
        try {
            profile = this._profileService.getProfileByName(profileName);
        } catch(e) { return false; }

        if (!profile)
            return false;

        env.set('MOZ_NO_REMOTE', '1');
        env.set('XRE_PROFILE_PATH', profile.rootDir.path);
        env.set('XRE_PROFILE_LOCAL_PATH', profile.localDir.path);

        var _appStartup = Components.classes['@mozilla.org/toolkit/app-startup;1']
                                    .getService(Components.interfaces.nsIAppStartup);
        _appStartup.quit(Components.interfaces.nsIAppStartup.eRestart |
                         Components.interfaces.nsIAppStartup.eAttemptQuit);
        return true;
    },

    populateCache: function() {
        var stmt = this._db.createStatement(this._selectQuerySQL);

        var me = this;
        stmt.executeAsync({
            handleResult: function(aResultSet) {
                for (let row = aResultSet.getNextRow();
                     row;
                     row = aResultSet.getNextRow()) {
                    var profile = row.getResultByName('profile');
                    var website = row.getResultByName('website');

                    if (!(profile in me._cache))
                        me._cache[profile] = [];

                    me._cache[profile].push(website);
                }
            },

            handleCompletion: function(st) {
                // nothing here
            }
        });
    },

    checkWebsite: function(evnt, win) {
        var page = evnt.originalTarget;
        if (!page)
            return;

        try {
            var URI = page.location.href;
        } catch(e) { return; }

        // Just http and https:
        if (URI.indexOf('http://') == -1 &&
            URI.indexOf('https://') == -1)
            return;

        // List of profile matching this URI:
        var profiles = this.matchProfiles(URI);

        // Unknown website:
        if (profiles.length == 0)
            return;

        // This website is supported by the current profile:
        if (profiles.indexOf(this._profileService.selectedProfile.name) != -1)
            return;

        // Show notification:
        this.showNotification(URI, profiles, win);
    },

    matchProfiles: function(URI) {
        var profiles = [];
        var pAvailable = this.getProfileNames();

        for (key in this._cache) {
            for (var i = 0; i < this._cache[key].length; ++i) {
                try {
                    // Applying the regexp:
                    var re = new RegExp(this._cache[key][i]);
                    var output = re.exec(URI);

                    if (output != null) {
                        if (pAvailable.indexOf(key) != -1)
                            profiles.push(key);
                        break;
                    }
                 } catch(e) {}
            }
        }

        return profiles;
    },

    showNotification: function(URI, profiles, win) {
        var nBox = win.getBrowser().getNotificationBox();
        if (!nBox)
            return;

        var me = this;
        var buttons = [
            {
                label:     "Change profile",
                accessKey: "C",
                popup:     null,
                callback:  function(notificationBar, button) {
                    me.changeProfiles(profiles, win);
                }
            }
        ];

        var oldBar = nBox.getNotificationWithValue("switchy_bar");
        var bar = nBox.appendNotification(this.getNotificationMessage(profiles),
                                          "switchy_bar",
                                          null,
                                          nBox.PRIORITY_INFO_MEDIUM, buttons);
        bar.type = 'info';
        ++bar.persistence;

        if (oldBar)
            nBox.removeNotification(oldBar);

        var eventTimeout = { notify: function(timer) {
            var bar = nBox.getNotificationWithValue("switchy_bar");
            if (bar)
                nBox.removeNotification(bar);
        } }

        this._timer = Components.classes["@mozilla.org/timer;1"]
                                .createInstance(Components.interfaces.nsITimer);
        this._timer.initWithCallback(eventTimeout, 15000, Components.interfaces.nsITimer.TYPE_ONE_SHOT);
    },

    getNotificationMessage: function(profiles) {
        if (profiles.length > 1)
            return 'This website is configured to run in other profiles you want to switch?';

        return 'This website is configured to run in the profile "' + profiles[0] + '". Do you want to switch?';
    }
};
Switchy.wrappedJSObject = Switchy;

/* Module declaration */
function SwitchyComponent() {}
SwitchyComponent.prototype = Switchy;

if (XPCOMUtils.generateNSGetFactory)
    var NSGetFactory = XPCOMUtils.generateNSGetFactory([SwitchyInitializer, SwitchyComponent]);
else
    var NSGetModule = XPCOMUtils.generateNSGetModule([SwitchyInitializer, SwitchyComponent]);
