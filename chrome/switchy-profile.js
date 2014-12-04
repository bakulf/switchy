Components.utils.import("chrome://switchy/content/modules/switchy.jsm");

var SwitchyProfile = {
  profileListUpdate: function() {
    var data = window.arguments[0];
    var rows = document.getElementById('switchy-list-rows');
    for (var i = 0; i < data.profiles.length; ++i) {
      let row = document.createElement('listitem');
      row.setAttribute('label', data.profiles[i]);
      row.addEventListener('click', function() { SwitchyProfile._profileListSelected(row); }, false);
      rows.appendChild(row);
    }
    rows.setAttribute('rows', obj.profiles.length);
  },

  _profileListSelected: function(obj) {
    var data = window.arguments[0];
    switchy.changeProfile(window, obj.label, data.url);
    window.close();
  }
};
