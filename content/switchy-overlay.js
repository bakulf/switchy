var myId      = "switchy-toolbarbutton";
var navBar    = document.getElementById("nav-bar");
var curSet    = navBar.currentSet.split(",");
    
if (curSet.indexOf(myId) == -1) {
    var pos = curSet.length;
    var set = curSet.slice(0, pos).concat(myId).concat(curSet.slice(pos));
    
    navBar.setAttribute("currentset", set.join(","));
    navBar.currentSet = set.join(",");
    document.persist(navBar.id, "currentset");
    try {
        BrowserToolboxCustomizeDone(true);
    } catch (e) { }
}
