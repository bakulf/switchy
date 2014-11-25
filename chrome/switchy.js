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
}, false);
