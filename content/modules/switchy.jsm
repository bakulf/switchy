Components.utils.import("resource://gre/modules/XPCOMUtils.jsm");
Components.utils.import("resource://gre/modules/FileUtils.jsm");
Components.utils.import("resource://gre/modules/Services.jsm");

Components.utils.import("chrome://switchy/content/modules/switchy-utils.jsm");

var EXPORTED_SYMBOLS = ["switchy", "SwitchyUrl"];

// Const for the type of URL supported
const SWITCHY_TYPE_COMPLETE = 1
const SWITCHY_TYPE_PATH     = 2
const SWITCHY_TYPE_HOST     = 3
const SWITCHY_TYPE_DOMAIN   = 4
const SWITCHY_TYPE_UNKNOWN = -1

// Object for the URL assigned to any profile
function SwitchyUrl(url, type, startup, exclusive) {
    this.initialize(url, type, startup, exclusive);
}
SwitchyUrl.prototype = {
    _url: null,
    _type: null,
    _startup: false,
    _exclusive: false,

    _matchFunction: null,

    _tldService: null,
    _baseDomain: null,

    _types: [ { type: SWITCHY_TYPE_COMPLETE, match: 'matchComplete' },
              { type: SWITCHY_TYPE_PATH,     match: 'matchPath'     },
              { type: SWITCHY_TYPE_HOST,     match: 'matchHost'     },
              { type: SWITCHY_TYPE_DOMAIN,   match: 'matchDomain'   } ],

    // Initialize, just store the URI + the right match function:
    initialize: function(url, type, startup, exclusive) {
        this._url = Services.io.newURI(url, null, null);

        for (var i = 0; i < this._types.length; ++i) {
            if (this._types[i].type == type) {
                this._matchFunction = this[this._types[i].match];
                this._type = type;
                break;
            }
        }

        // No type == no match:
        if (!this._type) {
            this._type = SWITCHY_TYPE_UNKNOWN;
            this._matchFunction = function(url) { return false; }
        }

        this._startup = startup;
        this._exclusive = exclusive;
    },

    url: function() {
        return this._url;
    },

    type: function() {
        return this._type;
    },

    typeString: function() {
        switch(this._type) {
        case SWITCHY_TYPE_COMPLETE:
            return "complete";

        case SWITCHY_TYPE_PATH:
            return "path";

        case SWITCHY_TYPE_HOST:
            return "host";

        case SWITCHY_TYPE_DOMAIN:
            return "domain";

        default:
            return "unknown";
        }
    },

    startup: function() {
        return this._startup;
    },

    exclusive: function() {
        return this._exclusive;
    },

    // Match this URL?
    match: function(url) {
        if (!this._url || !url)
            return false;

        return this._matchFunction(url);
    },

    // The URL must match completelly:
    matchComplete: function(url) {
        return this._url.equals(url);
    },

    // Anything but the query string:
    matchPath: function(url) {
        return (this._url.host == url.host &&
                this._url.port == url.port &&
                this._url.path == url.path);
    },

    // Anything but the path + query:
    matchHost: function(url) {
        return (this._url.host == url.host &&
                this._url.port == url.port);
    },

    // Just the domain:
    matchDomain: function(url) {
        if (!this._tldService) {
            this._tldService = Components.classes["@mozilla.org/network/effective-tld-service;1"]
                                         .getService(Components.interfaces.nsIEffectiveTLDService);
            try {
                this._baseDomain = this._tldService.getBaseDomainFromHost(this._url.host);
            } catch(e) {
                return false;
            }
        }

        try {
            var baseDomain = this._tldService.getBaseDomainFromHost(url.host);
            return (baseDomain == this._baseDomain);
        } catch(e) {
            return false;
        }
    },
};

// Switchy Component
const switchy = {
    QueryInterface: XPCOMUtils.generateQI([Components.interfaces.nsIProfile,Components.interfaces.nsIObserver]),

    // ...component implementation...
    _initialized: false,
    _preferences: null,
    _profileService: null,
    _ww: null,
    _db: null,
    _cache: {},
    _timer: null,

    _firstRun: true,

    // Queries:
    _createTableSQL: '' +
        'CREATE TABLE IF NOT EXISTS data (' +
        '  url       char(255),           ' +
        '  type      integer,             ' +
        '  profile   char(255),           ' +
        '  startup   boolean,             ' +
        '  exclusive boolean,             ' +
        '  PRIMARY KEY(url, profile)      ' +
        ')',
    _insertQuerySQL: 'INSERT INTO data(url, type, profile, startup, exclusive) VALUES(:url, :type, :profile, :startup, :exclusive)',
    _updateQuerySQL: 'UPDATE data SET url = :url, type = :type, startup = :startup, exclusive = :exclusive WHERE url = :prevUrl AND profile = :profile',
    _deleteQuerySQL: 'DELETE FROM data WHERE profile = :profile AND url = :url',
    _selectQuerySQL: 'SELECT * FROM data',

    init: function() {
        if (this._initialized)
            return;
        this._initialized = true;

        // Preferences:
        var prefSvc = Components.classes['@mozilla.org/preferences-service;1']
                                .getService(Components.interfaces.nsIPrefService);
        this._preferences = prefSvc.getBranch('extensions.switchy.');

        this._firstRun = this._preferences.getBoolPref('firstRun');
        if (this._firstRun == true)
            this._preferences.setBoolPref('firstRun', false);

        // Profile Service:
        this._profileService = Components.classes["@mozilla.org/toolkit/profile-service;1"]
                                         .createInstance(Components.interfaces.nsIToolkitProfileService);

        // Database for the global config:
        var file = FileUtils.getFile("DefProfRt", ["switchy.sqlite3"]);

        var storageService = Components.classes['@mozilla.org/storage/service;1']
                                       .getService(Components.interfaces.mozIStorageService);
        this._db = storageService.openDatabase(file);

        // Table creation:
        this._db.executeSimpleSQL(this._createTableSQL);
        this.populateCache();

        // List of observer
        let os = Services.obs;
        os.addObserver(this, "sessionstore-windows-restored", false);
    },

    shutdown: function() {
        if (this._db)
            this._db.close();

        let os = Services.obs;
        os.removeObserver(this, "sessionstore-windows-restored");
    },

    firstRun: function() {
        return this._firstRun;
    },

    browserReady: function() {
        var win = this.getMostRecentBrowserWindow();
        if (!win)
            return;

        // Default URL for this profile:
        if (this._cache[this.currentProfile()]) {
            for (var i = 0; i < this._cache[this.currentProfile()].length; ++i) {
                SwitchyUtils.openUrl(win, this._cache[this.currentProfile()][i].url());
            }
        }

        // Url from the environment:
        var env = Components.classes["@mozilla.org/process/environment;1"]
                            .getService(Components.interfaces.nsIEnvironment);
        var url = env.get('SWITCHY_URL');

        if (url && url != "") {
            env.set('SWITCHY_URL', '');

            try {
                url = Services.io.newURI(url, null, null);
            } catch(e) {
                url = null;
            }

            if (url)
                SwitchyUtils.openUrl(win, url);
        }
    },

    getMostRecentBrowserWindow: function() {
        var win = Services.wm.getMostRecentWindow("navigator:browser");
        if (!win)
            return null;
        if (!win.closed)
            return win;

        win = null;
        var windowsEnum = Services.wm.getEnumerator("navigator:browser");
        while (windowsEnum.hasMoreElements()) {
            let nextWin = windowsEnum.getNext();
            if (!nextWin.closed)
                win = nextWin;
        }
        return win;
    },

    profileService: function() {
        return this._profileService;
    },

    currentProfile: function() {
        return this._profileService.selectedProfile.name;
    },

    getUrlsForProfile: function(profile) {
        if (this._cache[profile])
            return this._cache[profile];

        return [];
    },

    syncProfiles: function() {
        this._profileService.flush();
    },

    checkNewProfiles: function() {
        var itr = this._profileService.profiles;
        while(itr.hasMoreElements()) {
            var profile = itr.getNext().QueryInterface(Components.interfaces.nsIToolkitProfile);
            this.checkNewProfile(profile.rootDir);
        }
    },

    checkNewProfile: function(file) {
        // I force a 'template' prefs.js so I can open a custom homepage when this profile will
        // be activated for the first time

        file = file.clone();
        file.append('prefs.js');
        if (file.exists())
            return;

        file.create(0x00, 0644);

        var downloader = Components.classes["@mozilla.org/embedding/browser/nsWebBrowserPersist;1"]
                                   .createInstance(Components.interfaces.nsIWebBrowserPersist);

        const nsIWBP = Components.interfaces.nsIWebBrowserPersist;
        const flags = nsIWBP.PERSIST_FLAGS_REPLACE_EXISTING_FILES;
        downloader.persistFlags = flags | nsIWBP.PERSIST_FLAGS_FROM_CACHE;

        url = Services.io.newURI('chrome://switchy/content/prefs.template', null, null);
        downloader.saveURI(url, null, null, null, null, file);
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

    renameProfile: function(oldName, newName) {
        var itr = this._profileService.profiles;
        while(itr.hasMoreElements()) {
            var profile = itr.getNext().QueryInterface(Components.interfaces.nsIToolkitProfile);
            if (profile.name == oldName) {
                try {
                    profile.name = newName;
                    this._profileService.flush();
                } catch(e) {
                    dump(e);
                }

                break;
            }
        }
    },

    deleteProfile: function(name, deleteFiles) {
        var itr = this._profileService.profiles;
        while(itr.hasMoreElements()) {
            var profile = itr.getNext().QueryInterface(Components.interfaces.nsIToolkitProfile);
            if (profile.name == name) {
                try {
                    profile.remove(deleteFiles);
                    this._profileService.flush();
                } catch(e) {
                    dump(e);
                }

                break;
            }
        }
    },

    changeProfiles: function (url, profileArray, win) {
        if (profileArray.length == 1)
            return this.changeProfile(profileArray[0], url);

        win.openDialog('chrome://switchy/content/profiles.xul', 'Choose a profile',
                       'chrome,dialog,centerscreen', { profiles: profileArray, url: url } );
    },

    changeProfile: function(profileName, url) {
        var env = Components.classes["@mozilla.org/process/environment;1"]
                            .getService(Components.interfaces.nsIEnvironment);

        var profile;
        try {
            profile = this._profileService.getProfileByName(profileName);
        } catch(e) { return false; }

        if (!profile)
            return false;

        this._profileService.selectedProfile = profile;
        this._profileService.flush();

        env.set('MOZ_NO_REMOTE', '1');
        env.set('XRE_PROFILE_PATH', profile.rootDir.path);
        env.set('XRE_PROFILE_LOCAL_PATH', profile.localDir.path);

        if (url) {
            env.set('SWITCHY_URL', url);
        }

        var _appStartup = Components.classes['@mozilla.org/toolkit/app-startup;1']
                                    .getService(Components.interfaces.nsIAppStartup);
        _appStartup.quit(Components.interfaces.nsIAppStartup.eRestart |
                         Components.interfaces.nsIAppStartup.eAttemptQuit);
        return true;
    },

    populateCache: function(cb) {
        var stmt = this._db.createStatement(this._selectQuerySQL);

        // Refresh the cache:
        this._cache = {};

        var me = this;
        stmt.executeAsync({
            handleResult: function(aResultSet) {
                for (let row = aResultSet.getNextRow();
                     row;
                     row = aResultSet.getNextRow()) {
                    var profile = row.getResultByName('profile');

                    // Security check:
                    try {
                        Services.io.newURI(row.getResultByName('url'), null, null);
                    } catch(e) {
                        continue;
                    }

                    var url = new SwitchyUrl(row.getResultByName('url'),
                                             row.getResultByName('type'),
                                             row.getResultByName('startup'),
                                             row.getResultByName('exclusive'));

                    if (!(profile in me._cache))
                        me._cache[profile] = [];

                    me._cache[profile].push(url);
                }
            },

            handleCompletion: function(st) {
                if (cb) cb();
            }
        });
    },

    checkURL: function(evnt, win) {
        var page = evnt.originalTarget;

        try {
            var url = page.location.href;
        } catch(e) { return; }

        // Just http and https:
        if (url.indexOf('http://') == -1 &&
            url.indexOf('https://') == -1)
            return;

        // List of profile matching this URL:
        var profiles = this.matchProfiles(url);

        // Unknown URL:
        if (profiles.length == 0)
            return;

        // This URL is supported by the current profile:
        if (profiles.indexOf(this._profileService.selectedProfile.name) != -1)
            return;

        // Show notification:
        this.showNotification(url, profiles, win);
    },

    matchProfiles: function(url) {
        url = Services.io.newURI(url, null, null);

        var profiles = [];
        var pAvailable = this.getProfileNames();

        for (key in this._cache) {
            for (var i = 0; i < this._cache[key].length; ++i) {
                try {
                    if (this._cache[key][i].exclusive() && this._cache[key][i].match(url)) {
                        if (pAvailable.indexOf(key) != -1)
                            profiles.push(key);
                        break;
                    }
                 } catch(e) {}
            }
        }

        return profiles;
    },

    showNotification: function(url, profiles, win) {
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
                    me.changeProfiles(url, profiles, win);
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
    },

    addURL: function(prevUrl, url, type, profiles, onStartup, exclusive, cb) {
        if (prevUrl)
          this.updateURL(prevUrl, url, type, profiles, onStartup, exclusive, cb);
        else
          this.insertURL(url, type, profiles, onStartup, exclusive, cb);
    },

    insertURL: function(url, type, profiles, onStartup, exclusive, cb) {
        var stmt = this._db.createStatement(this._insertQuerySQL);
        var params = stmt.newBindingParamsArray();

        for (var i = 0; i < profiles.length; ++i) {
            var bp = params.newBindingParams();
            bp.bindByName('url',       url.spec);
            bp.bindByName('type',      this.typeFromString(type));
            bp.bindByName('profile',   profiles[i]);
            bp.bindByName('startup',   onStartup);
            bp.bindByName('exclusive', exclusive);
            params.addParams(bp);
        }

        stmt.bindParameters(params);

        let me = this;
        stmt.executeAsync({
            error: false,

            handleCompletion: function(st) {
                let obj = this;
                me.populateCache(function() { cb(!obj.error); });
            },

            handleError: function(error) {
                dump('insertURL: ' + error.message + "\n");
                this.error = true;
            }
        });
    },

    updateURL: function(prevUrl, url, type, profiles, onStartup, exclusive, cb) {
        var stmt = this._db.createStatement(this._updateQuerySQL);
        var params = stmt.newBindingParamsArray();

        for (var i = 0; i < profiles.length; ++i) {
            var bp = params.newBindingParams();
            bp.bindByName('prevUrl',   prevUrl.spec);
            bp.bindByName('url',       url.spec);
            bp.bindByName('type',      this.typeFromString(type));
            bp.bindByName('profile',   profiles[i]);
            bp.bindByName('startup',   onStartup);
            bp.bindByName('exclusive', exclusive);
            params.addParams(bp);
        }

        stmt.bindParameters(params);

        let me = this;
        stmt.executeAsync({
            error: false,

            handleCompletion: function(st) {
                let obj = this;
                me.populateCache(function() { cb(!obj.error); });
            },

            handleError: function(error) {
                dump('updateURL: ' + error.message + "\n");
                this.error = true;
            }
        });
    },

    typeFromString: function(type) {
        switch(type) {
        case 'complete':
            return SWITCHY_TYPE_COMPLETE;

        case 'path':
            return SWITCHY_TYPE_PATH;

        case 'host':
            return SWITCHY_TYPE_HOST;

        case 'domain':
            return SWITCHY_TYPE_DOMAIN;
        }

        return SWITCHY_TYPE_UNKNOWN;
    },

    deleteURL: function(profile, url, cb) {
        var stmt = this._db.createStatement(this._deleteQuerySQL);
        var params = stmt.newBindingParamsArray();

        var bp = params.newBindingParams();
        bp.bindByName('url',     url);
        bp.bindByName('profile', profile);
        params.addParams(bp);

        stmt.bindParameters(params);

        let me = this;
        stmt.executeAsync({
            error: false,

            handleCompletion: function(st) {
                let obj = this;
                me.populateCache(function() { cb(!obj.error); });
            },

            handleError: function(error) {
                dump('deleteURL:' + error.message + "\n");
                this.error = true;
            }
        });
    },

    observe: function(subject, topic, data) {
        switch(topic) {
        case 'sessionstore-windows-restored':
            this.browserReady();
            break;
        }
    }
};
