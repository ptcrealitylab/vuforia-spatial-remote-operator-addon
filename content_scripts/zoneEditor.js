/*
* Copyright © 2018 PTC
*
* This Source Code Form is subject to the terms of the Mozilla Public
* License, v. 2.0. If a copy of the MPL was not distributed with this
* file, You can obtain one at http://mozilla.org/MPL/2.0/.
*/

createNameSpace('realityEditor.zoneEditor');

(function(_exports) {

  const LOAD_PREVIOUS_ZONES = true;
  const DEBUG_SHOW_CANVAS = false;
  const DEBUG_DRAW_SVG_HULLS = false;
  let dropdown = null;
  let zoneInfo = {};
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

    update(); // start update loop

    realityEditor.network.addObjectDiscoveredCallback(onObjectDiscovered);
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

  function update() {
    try {
      let cameraPosition = realityEditor.sceneGraph.getWorldPosition('CAMERA');

      for (let zoneId in zoneInfo) {
        let thisZone = zoneInfo[zoneId];
        if (!thisZone.hull) { continue; }
        let camCoords = worldToHullCoordinates(cameraPosition.x, cameraPosition.z, bitmapSize, planeWidth);
        let isInsideZone = realityEditor.zoneHulls.checkPointConcave(camCoords.x, camCoords.y, thisZone.hull);
        if (isInsideZone) {
          console.log('INSIDE ZONE: ' + thisZone.name);
          if (thisZone.hullGroup) {
            // cube.material.color.setHex( 0xffffff );
            thisZone.hullGroup.children[0].children[1].material.color.setHex(0xffffff);
          }
        } else {
          if (thisZone.hullGroup) {
            thisZone.hullGroup.children[0].children[1].material.color.setHex(0x01fffc);
          }
        }
      }
    } catch (e) {
      console.warn(e);
    }

    requestAnimationFrame(update);
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
        renderZones();
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
      renderZones();
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

  function renderZones() {
    const THREE = realityEditor.gui.threejsScene.THREE;

    for (let zoneId in zoneInfo) {
      let thisZone = zoneInfo[zoneId];

      if (!thisZone.ctx) {
        thisZone.ctx = document.createElement('canvas').getContext('2d');
        thisZone.ctx.canvas.width = bitmapSize;
        thisZone.ctx.canvas.height = bitmapSize;
        thisZone.ctx.canvas.style.backgroundColor = 'transparent';

        if (LOAD_PREVIOUS_ZONES) {
          if (thisZone.loadedImage && thisZone.loadedImage.complete) {
            let img = new Image();

            img.onload = function() {
              console.log('img loaded... draw', img);

              let width = img.width;
              let height = img.height;

              thisZone.ctx.drawImage(thisZone.loadedImage, 0, 0);

              if (DEBUG_SHOW_CANVAS) { // adjust transparency for better visual effect only if it will be seen
                let image1 = thisZone.ctx.getImageData(0, 0, width, height);
                let imageData1 = image1.data;

                let stride = 4;
                let tolerance = 20;
                for (let i = 0; i < imageData1.length; i += stride) {
                  if (imageData1[i] < tolerance && imageData1[i + 1] < tolerance && imageData1[i + 2] < tolerance) {
                    imageData1[i + 3] = 0; // set black to transparent
                  }
                }
                image1.data = imageData1;
                thisZone.ctx.putImageData(image1, 0, 0);
              }

              renderUpdates(thisZone);
            }
            img.src = thisZone.loadedImage.src;
          }
        }
      }

      if (!thisZone.mesh) {
        const geometry = new THREE.PlaneGeometry(planeWidth, planeHeight);

        thisZone.texture = new THREE.CanvasTexture(thisZone.ctx.canvas);

        const material = new THREE.MeshBasicMaterial({
          map: thisZone.texture,
          transparent: true
        });

        thisZone.mesh = new THREE.Mesh(geometry, material);
        thisZone.mesh.rotation.x = -Math.PI / 2;

        // realityEditor.gui.threejsScene.addToScene(thisZone.mesh, {occluded: true});
        realityEditor.gui.threejsScene.addToScene(thisZone.mesh);
      }

      thisZone.mesh.position.y = 200;
      thisZone.mesh.visible = DEBUG_SHOW_CANVAS; // true
    }

    if (selectedZoneId && zoneInfo[selectedZoneId]) {
      zoneInfo[selectedZoneId].mesh.position.y = 300;
    }

    zoneEventCatcher.style.display = '';
    zoneEventCatcher.style.transform = 'translateZ(9999px)'; // buttons are at 10000
  }

  function hideZones() {
    for (let zoneId in zoneInfo) {
      let thisZone = zoneInfo[zoneId];
      if (!thisZone.mesh) { return; }
      thisZone.mesh.visible = false;
    }

    zoneEventCatcher.style.display = 'none';
  }

  function onObjectDiscovered(object, objectKey) {
    console.log('object discovered: ' + objectKey + ' (desktop)');

    if (object.type === 'zone') {
      var alreadyContained = dropdown.selectables.map(function(selectableObj) {
        return selectableObj.id;
      }).indexOf(objectKey) > -1;

      if (!alreadyContained) {
        dropdown.addSelectable(objectKey, object.name);
        zoneInfo[objectKey] = { name: object.name, color: COLORS.Pencil }; // pencil color is interpreted as the zone when forming convex hull

        // try to load bitmap for zone territory map - it is stored in the target.jpg for this object
        let bitmapUrl = 'http://' + object.ip + ':' + realityEditor.network.getPort(object) + '/obj/' + object.name + '/target/target.jpg';

        var xhr = new XMLHttpRequest();
        xhr.open("GET", bitmapUrl);
        xhr.responseType = "blob";
        xhr.onload = function() {
          var urlCreator = window.URL || window.webkitURL;
          var imageUrl = urlCreator.createObjectURL(this.response);
          let image = document.createElement('img');
          image.src = imageUrl;
          zoneInfo[objectKey].loadedImage = image;
          console.log('created image from loaded target');
          console.log(imageUrl);
        };
        xhr.send();

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
      renderUpdates(thisZone);
    }
  }

  function renderUpdates(thisZone) {
    const THREE = realityEditor.gui.threejsScene.THREE;
    let ctx = thisZone.ctx;

    let imageData = ctx.getImageData(0, 0, bitmapSize, bitmapSize).data;
    let hull = realityEditor.zoneHulls.calculateConvexHull(imageData, bitmapSize, thisZone.color, 10);

    if (DEBUG_DRAW_SVG_HULLS) {
      realityEditor.zoneHulls.drawHull(hull, bitmapSize);
    }

    thisZone.hull = hull;

    let worldCoordinates = hullToWorldCoordinates(hull, bitmapSize, planeWidth);
    console.log(worldCoordinates);

    if (!thisZone.hullGroup) {
      thisZone.hullGroup = new THREE.Group();
      realityEditor.gui.threejsScene.addToScene(thisZone.hullGroup);
    }

    // clear the group
    while (thisZone.hullGroup.children.length) {
      thisZone.hullGroup.remove(thisZone.hullGroup.children[0]);
    }

    let mesh = realityEditor.zoneHulls.pathToMesh(worldCoordinates);
    thisZone.hullGroup.add(mesh);
  }

  function hullToWorldCoordinates(hull, bitmapSize, planeSize) {
    const THREE = realityEditor.gui.threejsScene.THREE;

    return hull.map(function(pt) {
      return new THREE.Vector3((pt[0] / bitmapSize - 0.5) * planeSize, 0, (pt[1] / bitmapSize - 0.5) * planeSize);
    });
  }

  function worldToHullCoordinates(x, y, bitmapSize, planeSize) {
    return {
      x: (x / planeSize + 0.5) * bitmapSize,
      y: (y / planeSize + 0.5) * bitmapSize
    };
  }

  function onPointerUp(event) {
    isPointerDown = false;
    if (event.button === 2) { return; }

    // write the bitmap data to disk... store as the target image on the server

    let object = realityEditor.getObject(selectedZoneId);
    if (!object) { return; }

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
