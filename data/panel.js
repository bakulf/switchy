let selectElm = document.getElementById("switchy-panel-select");

let buttons = [ 'add', 'manager', 'settings', 'about' ];
for (let i = 0; i < buttons.length; ++i) {
  createButton(buttons[i]);
}

function createButton(name) {
  let button = document.getElementById('switchy-panel-' + name + '-button');
  button.onclick = function() {
    self.port.emit(name);
  }
}

self.port.on("show", function(data) {
  let elm = document.getElementById("switchy-current-profile");
  elm.innerHTML = '';
  elm.appendChild(document.createTextNode(data.currentProfile));

  selectElm.innerHTML = '';

  for (let i = 0; i < data.profileNames.length; ++i) {
    if (data.profileNames[i] == data.currentProfile) {
      continue;
    }

    let opt = document.createElement('option');
    opt.appendChild(document.createTextNode(data.profileNames[i]));
    opt.setAttribute('value', data.profileNames[i]);
    opt.onclick = function() {
      self.port.emit("changeProfile", selectElm.value);
    }
    selectElm.appendChild(opt);
  }
});
