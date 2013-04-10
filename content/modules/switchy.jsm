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
                this._url.path == url.path);
    },

    // Anything but the path + query:
    matchHost: function(url) {
        return (this._url.host == url.host);
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
    QueryInterface: XPCOMUtils.generateQI([Components.interfaces.nsIObserver]),

    // ...component implementation...
    _initialized: false,
    _preferences: null,
    _profileService: null,
    _ww: null,
    _db: null,
    _cache: {},
    _timer: null,

    _firstRun: true,

    _prefs: {},
    _defaultPrefs: { 'closeCurrentProfile': 'ask' },

    _prompt: null,

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

    // Queries for Preferencies:
    _createPrefsTableSQL: '' +
        'CREATE TABLE IF NOT EXISTS prefs (' +
        '  key   char(255),                ' +
        '  value char(255),                ' +
        '  PRIMARY KEY(key)                ' +
        ')',
    _insertPrefsQuerySQL: 'INSERT OR REPLACE INTO prefs(key, value) VALUES(:key, :value)',
    _selectPrefsQuerySQL: 'SELECT * FROM prefs',

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
        this._db.executeSimpleSQL(this._createPrefsTableSQL);

        this.readPrefs();
        this.populateCache();

        // List of observer
        let os = Services.obs;
        os.addObserver(this, "sessionstore-windows-restored", false);

        // timeout quit must be set!
        if (!this.getPrefs('timeoutQuit')) {
          this.setPrefs('timeoutQuit', 1000);
        }

        // navigation bar icon shown:
        if (!this.getPrefs('navBar')) {
          this.setPrefs('navBar', '1');
        }
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
        // Let's wait a while before checking if the URL has already been opened.
        var me = this;
        var eventTimeout = { notify: function(timer) { me.browserReadyTimeout(); } }

        this._browserReadyTimer = Components.classes["@mozilla.org/timer;1"]
                                            .createInstance(Components.interfaces.nsITimer);
        this._browserReadyTimer.initWithCallback(eventTimeout, 1000 /* TODO: I hate this timer */, Components.interfaces.nsITimer.TYPE_ONE_SHOT);
   },

   browserReadyTimeout: function() {
        var win = this.getMostRecentBrowserWindow();
        if (!win)
            return;

        // Default URL for this profile:
        if (this._cache[this.currentProfileName()]) {
            for (var i = 0; i < this._cache[this.currentProfileName()].length; ++i) {
                SwitchyUtils.openUrl(win, this._cache[this.currentProfileName()][i].url());
            }
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
        var cpd = Components.classes["@mozilla.org/file/directory_service;1"]
                            .getService(Components.interfaces.nsIProperties)
                            .get("ProfD", Components.interfaces.nsIFile);

        var itr = this._profileService.profiles;
        while(itr.hasMoreElements()) {
            var profile = itr.getNext().QueryInterface(Components.interfaces.nsIToolkitProfile);
            if (profile.rootDir.path == cpd.path) {
                return profile;
            }
        }

        return this._profileService.selectedProfile;
    },

    currentProfileName: function() {
        return this.currentProfile().name;
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

    getProfile: function(name) {
        var itr = this._profileService.profiles;
        while(itr.hasMoreElements()) {
            var profile = itr.getNext().QueryInterface(Components.interfaces.nsIToolkitProfile);
            if (profile.name == name)
                return profile;
        }

        return null;
    },

    getProfileNames: function() {
        var names = [];

        var itr = this._profileService.profiles;
        while(itr.hasMoreElements()) {
            var profile = itr.getNext().QueryInterface(Components.interfaces.nsIToolkitProfile);
            names.push(profile.name);
        }

        names.sort();
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

    changeProfiles: function (win, url, profileArray) {
        if (profileArray.length == 1)
            return this.changeProfile(win, profileArray[0], url);

        win.openDialog('chrome://switchy/content/profiles.xul', 'Choose a profile',
                       'chrome,dialog,centerscreen', { profiles: profileArray, url: url } );
    },

    changeProfile: function(win, profileName, url) {
        // Here, we know that we can proceed:
        var toQuit;
        switch (this.getPrefs('closeCurrentProfile')) {
            case 'yes':
                toQuit = true;
                break;

            case 'no':
                toQuit = false;
                break;

            case 'ask':
                var ret = this.closeCurrentProfileAsk(win);
                if (ret == -1)
                    return;

                toQuit = (ret == 1);
                break;
        }

        if (this.changeProfileWithProcess(win, toQuit, profileName, url) == false) {
            // We have to ask for the firefox path:
            this.askPath(win, this.getPrefs('firefoxPath'), toQuit, profileName, url);
        }
    },

    changeProfileWithProcess: function(win, toQuit, profileName, url) {
        var firefoxes = [ { fullpath : true,  path : this.getPrefs('firefoxPath') }, // User preference
                          { fullpath : false, path : 'firefox-bin' },                // mac
                          { fullpath : false, path : 'firefox.exe' },                // windows
                          { fullpath : false, path : 'Firefox.exe' },                // windows
                          { fullpath : false, path : 'firefox' },                    // linux
                          { fullpath : true,  path : '/usr/bin/firefox' },           // linux.. full path
                          { fullpath : true,  path : '/usr/local/bin/firefox' },     // linux.. full path
                          { fullpath : true,  path : '/usr/bin/iceweasel' },         // debian :(
                          { fullpath : false, path : 'icecat' },                     // gnu :(
                          { fullpath : false, path : 'firefox.sh' },                 // linux.. script?!?
                        ];

        var execFile;
        for (var i = 0; i < firefoxes.length; ++i) {
            if (!firefoxes[i].path || !firefoxes[i].path.length) {
                continue;
            }

            if (firefoxes[i].fullpath) {
                execFile = Components.classes["@mozilla.org/file/local;1"]
                                     .createInstance(Components.interfaces.nsILocalFile);
                try {
                    execFile.initWithPath(firefoxes[i].path);
                } catch(e) {
                    execFile = null;
                    continue;
                }
            } else {
                execFile = Components.classes["@mozilla.org/file/directory_service;1"]
                                     .getService(Components.interfaces.nsIProperties)
                                     .get("CurProcD", Components.interfaces.nsIFile);
                try {
                    execFile.append(firefoxes[i].path);
                } catch(e) {
                    execFile = null;
                    continue;
                }
            }

            if (execFile.exists() && execFile.isExecutable() && execFile.isFile())
                break;

            execFile = null;
        }

        // not found:
        if (execFile == null)
            return false;

        var process = Components.classes["@mozilla.org/process/util;1"]
                                .createInstance(Components.interfaces.nsIProcess);
        process.init(execFile);

        var args = [];
        args.push("-P");
        args.push(profileName);
        args.push("-no-remote");

        if (url) {
            args.push(url);
        } else {
            var urls = this.getUrlsForProfile(profileName);
            for (var i = 0; i < urls.length; ++i) {
                if (urls[i].startup())
                    args.push(urls[i].url().spec);
            }
        }

        process.run(false,args,args.length);

        if (toQuit) {
            win.setTimeout(function() {
                var _appStartup = Components.classes['@mozilla.org/toolkit/app-startup;1']
                                            .getService(Components.interfaces.nsIAppStartup);
              _appStartup.quit(Components.interfaces.nsIAppStartup.eAttemptQuit);
            }, this.getPrefs('timeoutQuit'));
        }

        return true;
    },

    askPath: function(win, value, toQuit, profileName, url) {
        this.promptNeeded();

        var check = { value: false };
        var input = { value: value ? value : "" };

        var result = this._prompt.prompt(win,
                                         this._bundle.GetStringFromName('Switchy.askForPathTitle'),
                                         this._bundle.GetStringFromName('Switchy.askForPathMessage'),
                                         input, null, check);
        if (result == false)
            return;

        var showWarning = !input.value;
        if (!showWarning) {
            var execFile = Components.classes["@mozilla.org/file/local;1"]
                                     .createInstance(Components.interfaces.nsILocalFile);
            try {
              execFile.initWithPath(input.value);
              showWarning = !execFile.exists() || !execFile.isExecutable() || !execFile.isFile();
            } catch(e) {
              showWarning = true;
            }
        }

        if (showWarning) {
            var result = this._prompt.alert(win,
                                            this._bundle.GetStringFromName('Switchy.askForPathUnknownTitle'),
                                            this._bundle.GetStringFromName('Switchy.askForPathUnknownMessage'));
            this.askPath(win, input.value, toQuit, profileName, url);
            return;
        }

        // Let's store the path:
        this.setPrefs('firefoxPath', input.value);

        // restat the operation:
        if (!this.changeProfileWithProcess(win, toQuit, profileName, url)) {
          this.askPath(win, input.value, toQuit, profileName, url);
        }
    },

    closeCurrentProfileAsk: function(win) {
        this.promptNeeded();

        var res = this._prompt.confirmEx(win,
                                         this._bundle.GetStringFromName('Switchy.closeCurrentProfileTitle'),
                                         this._bundle.GetStringFromName('Switchy.closeCurrentProfileAsk'),
                                         (this._prompt.BUTTON_TITLE_YES *    this._prompt.BUTTON_POS_1 +
                                          this._prompt.BUTTON_TITLE_CANCEL * this._prompt.BUTTON_POS_2 +
                                          this._prompt.BUTTON_TITLE_NO *     this._prompt.BUTTON_POS_0),
                                         null, null, null, null, {});
        if (res == 1)
            return 1;

        if (res == 2)
            return -1;

        return 0;
    },

    promptNeeded: function() {
        if (!this._prompt) {
            this._prompt = Components.classes["@mozilla.org/embedcomp/prompt-service;1"]
                                      .getService(Components.interfaces.nsIPromptService);
        }

        if (!this._bundle) {
          var bundleService = Components.classes["@mozilla.org/intl/stringbundle;1"]
                                        .getService(Components.interfaces.nsIStringBundleService);
          this._bundle =  bundleService.createBundle("chrome://switchy/locale/switchy.properties");
        }

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
        if (profiles.indexOf(this.currentProfileName()) != -1)
            return;

        // Show notification:
        this.showNotification(url, profiles, win);
    },

    matchProfiles: function(url) {
        url = Services.io.newURI(url, null, null);

        var profiles = [];
        var pAvailable = this.getProfileNames();

        for (var key in this._cache) {
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
                    me.changeProfiles(win, url, profiles);
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

    readPrefs: function() {
        var stmt = this._db.createStatement(this._selectPrefsQuerySQL);

        // Refresh the cache:
        this._prefs = {};

        var me = this;
        stmt.executeAsync({
            handleResult: function(aResultSet) {
                for (let row = aResultSet.getNextRow();
                     row;
                     row = aResultSet.getNextRow()) {
                    me._prefs[row.getResultByName('key')] = row.getResultByName('value');
                }
            },

            handleCompletion: function(st) {
                // default values:
                for (var key in me._defaultPrefs) {
                  if (me._prefs[key] == undefined)
                    me._prefs[key] = me._defaultPrefs[key];
                }
            }
        });
    },

    getPrefs: function(key) {
        return this._prefs[key];
    },

    setPrefs: function(key, value) {
        this._prefs[key] = value;

        var stmt = this._db.createStatement(this._insertPrefsQuerySQL);
        var params = stmt.newBindingParamsArray();

        var bp = params.newBindingParams();
        bp.bindByName('key',   key);
        bp.bindByName('value', value);
        params.addParams(bp);

        stmt.bindParameters(params);

        let me = this;
        stmt.executeAsync({
            handleCompletion: function(st) { },

            handleError: function(error) {
                dump('insertPrefs: ' + error.message + "\n");
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
