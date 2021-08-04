/*
* Copyright © 2018 PTC
*
* This Source Code Form is subject to the terms of the Mozilla Public
* License, v. 2.0. If a copy of the MPL was not distributed with this
* file, You can obtain one at http://mozilla.org/MPL/2.0/.
*/

createNameSpace('realityEditor.zoneEditor');

(function(_exports) {

  const DEBUG_DRAW_SVG_HULLS = false;
  let dropdown = null;
  let selectedZoneId = null;
  let zoneEventCatcher = null;
  let isPointerDown = false;
  let bitmapSize = 128;
  const planeWidth = 50000;
  const planeHeight = 50000;
  const COLORS = Object.freeze({
    Pencil: '#ffffff',
    Eraser: '#000000'
  });
  let currentColor = COLORS.Pencil;

  function initService() {
    if (!realityEditor.device.desktopAdapter.isDesktop()) { return; }

    createDropdown();

    zoneEventCatcher = document.createElement('div');
    zoneEventCatcher.id = 'zoneEventCatcher';
    document.body.appendChild(zoneEventCatcher);
    zoneEventCatcher.style.display = 'none';

    zoneEventCatcher.addEventListener('pointerdown', onPointerDown);
    zoneEventCatcher.addEventListener('pointermove', onPointerMove);
    zoneEventCatcher.addEventListener('pointerup', onPointerUp);

    realityEditor.network.addObjectDiscoveredCallback(onObjectDiscovered);

    realityEditor.gui.zones.onZoneVisibilityToggled(function(areZonesVisible) {
      if (areZonesVisible) {
        showZones(true);
      } else {
        hideZones(true);
        dropdown.resetSelection();
      }
    });
  }

  function onResourcesLoaded(_resourceList) {
    // resources = resourceList;
    let pencilButton = createButton('pencilButton', '/addons/vuforia-spatial-remote-operator-addon/pencil-icon.svg', 40, {right: '340px', top: '30px'});
    let eraserButton = createButton('eraserButton', '/addons/vuforia-spatial-remote-operator-addon/eraser-icon.svg', 40, {right: '290px', top: '30px'});

    pencilButton.addEventListener('pointerup', function() {
      currentColor = COLORS.Pencil;
    });
    eraserButton.addEventListener('pointerup', function() {
      currentColor = COLORS.Eraser;
    });
  }

  /**
   * Creates a switch that, when activated, begins broadcasting UDP messages
   * to discover any Reality Zones in the network for volumetric rendering
   */
  function createDropdown() {
    if (!dropdown) {

      var textStates = {
        collapsedUnselected: 'Edit Zones',
        expandedEmpty: 'No Zones...',
        expandedOptions: 'Select a Zone',
        selected: 'Selected: '
      };

      dropdown = new realityEditor.gui.dropdown.Dropdown('zoneEditorDropdown', textStates, {right: '30px', top: '30px'}, document.body, true, onZoneSelectionChanged, onZoneExpandedChanged);
    }
  }

  function onZoneSelectionChanged(selected) {
    if (selected && selected.element) {
      var selectedId = selected.element.id;
      if (selectedId) {
        console.log('selected zone: ' + selectedId);
        selectedZoneId = selectedId;
        showZones();
      }
    } else {
      selectedZoneId = null;
      console.log('stop rendering zones');
      hideZones();
    }
  }

  function onZoneExpandedChanged(isExpanded) {
    if (isExpanded) {
      console.log('render zones');
      showZones();
    } else {
      // if (!selectedZone) {
      //   console.log('stop rendering zones');
      // }
    }
  }

  function createButton(id, src, size, style) {
    let thisButton = document.createElement('div');
    thisButton.id = id;
    thisButton.classList.add('remoteOperatorButton');

    // size and position are determined programmatically rather than in CSS
    let buttonWidth = size;
    let buttonHeight = size;
    thisButton.style.width = buttonWidth + 'px';
    thisButton.style.height = buttonHeight + 'px';
    document.body.appendChild(thisButton);

    if (typeof style !== 'undefined') {
      for (let prop in style) {
        thisButton.style[prop] = style[prop];
      }
    }

    let thisButtonIcon = document.createElement('img');
    // thisButtonIcon.src = 'svg/bw-pencil.svg';
    thisButtonIcon.src = src;
    thisButton.appendChild(thisButtonIcon);

    thisButtonIcon.width = buttonWidth + 'px';
    thisButtonIcon.height = buttonHeight + 'px';
    thisButtonIcon.style.width = buttonWidth + 'px';
    thisButtonIcon.style.height = buttonHeight + 'px';

    // pencilButton.addEventListener('pointerup', onPencilButtonPressed);

    // setupButtonVisualFeedback(pencilButton);

    return thisButton;
  }

  function showZones(triggeredFromCallback) {
    // TODO: highlight selected zone
    // if (selectedZoneId && zoneInfo[selectedZoneId]) {
    //   zoneInfo[selectedZoneId].mesh.position.y = 300;
    // }

    zoneEventCatcher.style.display = '';
    zoneEventCatcher.style.transform = 'translateZ(9980px)'; // buttons are at 10000, settings at 9990

    if (!triggeredFromCallback) {
      realityEditor.gui.zones.showZones();
    }
  }

  function hideZones(triggeredFromCallback) {
    zoneEventCatcher.style.display = 'none';

    if (!triggeredFromCallback) {
      realityEditor.gui.zones.hideZones();
    }
  }

  function onObjectDiscovered(object, objectKey) {
    if (object.type === 'zone') {
      var alreadyContained = dropdown.selectables.map(function(selectableObj) {
        return selectableObj.id;
      }).indexOf(objectKey) > -1;

      if (!alreadyContained) {
        dropdown.addSelectable(objectKey, object.name);
      }
    }
  }

  function onPointerDown(event) {
    if (event.button === 2) { return; }
    isPointerDown = true;
  }

  function onPointerMove(event) {
    if (!isPointerDown) { return }
    if (event.button === 2) { return; }

    let zoneInfo = realityEditor.gui.zones.getZoneInfo();
    let thisZone = zoneInfo[selectedZoneId];

    let ctx = thisZone.ctx;
    let texture = thisZone.texture;

    // calculate objects intersecting the picking ray
    const intersects = realityEditor.gui.threejsScene.getRaycastIntersects(event.clientX, event.clientY);

    let planeIntersect = null;

    intersects.forEach(function(intersect) {
      if (planeIntersect) { return; }

      if (intersect.object.geometry.type === 'PlaneGeometry') { // TODO: check object.uuid instead
        planeIntersect = intersect;
      }
    });

    if (planeIntersect) {
      // ctx.fillStyle = thisZone.color;
      ctx.fillStyle = currentColor;
      ctx.beginPath();
      const x = bitmapSize * planeIntersect.uv.x; //randInt(256);
      const y = bitmapSize * (1.0 - planeIntersect.uv.y); //randInt(256);
      const radius = Math.floor(bitmapSize/32); //randInt(10, 64);
      ctx.arc(x, y, radius, 0, Math.PI * 2);
      ctx.fill();
      texture.needsUpdate = true;
      realityEditor.gui.zones.renderUpdates(thisZone);
    }
  }

  function onPointerUp(event) {
    isPointerDown = false;
    if (event.button === 2) { return; }

    // write the bitmap data to disk... store as the target image on the server

    let object = realityEditor.getObject(selectedZoneId);
    if (!object) { return; }

    let zoneInfo = realityEditor.gui.zones.getZoneInfo();
    let ctx = zoneInfo[selectedZoneId].ctx;
    var b64Image = ctx.canvas.toDataURL('image/jpeg');
    var u8Image  = b64ToUint8Array(b64Image);

    uploadTarget(object, new Blob([ u8Image ], {type: "image/jpg"}), function() {
      console.log('target upload success');
    }, function() {
      console.log('target upload error');
    });
  }

  // helper function used to convert canvas image data into a Blob part
  function b64ToUint8Array(b64Image) {
    var img = atob(b64Image.split(',')[1]);
    var img_buffer = [];
    var i = 0;
    while (i < img.length) {
      img_buffer.push(img.charCodeAt(i));
      i++;
    }
    return new Uint8Array(img_buffer);
  }

  function uploadTarget(object, imageBlob, onSuccess, onError) {
    let ip = object.ip;
    let port = realityEditor.network.getPort(object);
    let objectName = object.name;

    // Set up the request.
    var xhr = new XMLHttpRequest();

    var postUrl = 'http://' + ip + ':' + port + '/content/' + objectName; // set to target upload endpoint on server

    // Open the connection.
    xhr.open('POST', postUrl, true);

    // Set up a handler for when the request finishes.
    xhr.onload = function () {
      if (xhr.status === 200) {
        // File(s) uploaded.
        onSuccess();
      } else {
        console.log('error uploading');
        onError();
      }
    };

    xhr.setRequestHeader('type', 'targetUpload');

    // Send the Data.
    var formData = new FormData();
    formData.append('target', imageBlob, 'target.jpg');

    xhr.send(formData);
  }

  realityEditor.addons.addCallback('init', initService);
  realityEditor.addons.addCallback('resourcesLoaded', onResourcesLoaded);
})(realityEditor.zoneEditor);
