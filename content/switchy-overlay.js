var myId      = "switchy-toolbarbutton";
var navBar    = document.getElementById("nav-bar");
var curSet    = navBar.currentSet.split(",");
    
if (curSet.indexOf(myId) == -1) {
    var set = curSet.slice(0, curSet.length).concat(myId).concat(curSet.slice(curSet.length));

    navBar.setAttribute("currentset", set.join(","));
    navBar.currentSet = set.join(",");
    document.persist(navBar.id, "currentset");
    try {
        BrowserToolboxCustomizeDone(true);
    }
    catch (e) {}
}
