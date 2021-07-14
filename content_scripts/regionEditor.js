/*
* Copyright © 2018 PTC
*
* This Source Code Form is subject to the terms of the Mozilla Public
* License, v. 2.0. If a copy of the MPL was not distributed with this
* file, You can obtain one at http://mozilla.org/MPL/2.0/.
*/

createNameSpace('realityEditor.regionEditor');

/**
 * @fileOverview realityEditor.device.desktopRenderer.js
 * For remote desktop operation: renders background graphics simulating the context streamed from a connected phone.
 * e.g. a point or plane for each marker, or an entire point cloud of the background contents
 */

(function(exports) {

  let regionDropdown = null;

  let regionInfo = {};
  let selectedRegion = null;

  let regionEventCatcher = null;
  let ground = null;
  let isPointerDown = false;

  const ctx = document.createElement('canvas').getContext('2d');
  // let texture;

  let lastUV = null;

  let bitmapSize = 128;

  function initService() {
    if (!realityEditor.device.desktopAdapter.isDesktop()) { return; }

    createRegionDropdown();

    regionEventCatcher = document.createElement('div');
    regionEventCatcher.id = 'regionEventCatcher';
    document.body.appendChild(regionEventCatcher);
    regionEventCatcher.style.display = 'none';

    regionEventCatcher.addEventListener('pointerdown', onPointerDown);
    regionEventCatcher.addEventListener('pointermove', onPointerMove);
    regionEventCatcher.addEventListener('pointerup', onPointerUp);

    update(); // start update loop

    realityEditor.network.addObjectDiscoveredCallback(onObjectDiscovered);
  }

  function update() {
    try {
      if (selectedRegion) {
        // drawRandomDot();
        // texture.needsUpdate = true;
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
  function createRegionDropdown() {
    if (!regionDropdown) {

      var textStates = {
        collapsedUnselected: 'Edit Regions',
        expandedEmpty: 'No Regions',
        expandedOptions: 'Select a Region',
        selected: 'Selected: '
      };

      regionDropdown = new realityEditor.gui.dropdown.Dropdown('regionDropdown', textStates, {right: '30px', top: '30px'}, document.body, true, onRegionSelectionChanged, onRegionExpandedChanged);
    }
  }

  function onRegionSelectionChanged(selected) {
    if (selected && selected.element) {
      var selectedId = selected.element.id;
      if (selectedId) {
        // console.log(selectedId);
        console.log('selected region: ' + selectedId);
        selectedRegion = selectedId;
        renderRegions();
      }
    } else {
      // console.log('no region selected');
      selectedRegion = null;
      console.log('stop rendering regions');
      hideRegions();
    }
  }

  function onRegionExpandedChanged(isExpanded) {
    if (isExpanded) {
      console.log('render regions');
      renderRegions();
    } else {
      // if (!selectedRegion) {
      //   console.log('stop rendering regions');
      // }
    }
  }

  function renderRegions() {
    const THREE = realityEditor.gui.threejsScene.THREE;

    for (let regionId in regionInfo) {
      let thisRegion = regionInfo[regionId];

      if (!thisRegion.ctx) {
        thisRegion.ctx = document.createElement('canvas').getContext('2d');
        thisRegion.ctx.canvas.width = bitmapSize;
        thisRegion.ctx.canvas.height = bitmapSize;
        thisRegion.ctx.canvas.style.backgroundColor = 'transparent';

        // if (thisRegion.loadedImage) {
        //   thisRegion.ctx.drawImage(thisRegion.loadedImage, 0, 0);
        // }
      }

      if (!thisRegion.mesh) {
        const boxWidth = 30000;
        const boxHeight = 30000;
        const geometry = new THREE.PlaneGeometry(boxWidth, boxHeight);

        thisRegion.texture = new THREE.CanvasTexture(thisRegion.ctx.canvas);

        const material = new THREE.MeshBasicMaterial({
          map: thisRegion.texture,
          transparent: true
        });

        thisRegion.mesh = new THREE.Mesh(geometry, material);
        thisRegion.mesh.rotation.x = -Math.PI / 2;

        realityEditor.gui.threejsScene.addToScene(thisRegion.mesh, {occluded: true});
      }

      thisRegion.mesh.position.y = 100;
      thisRegion.mesh.visible = true;
    }

    if (selectedRegion && regionInfo[selectedRegion]) {
      regionInfo[selectedRegion].mesh.position.y = 200;
    }

    regionEventCatcher.style.display = '';
    regionEventCatcher.style.transform = 'translateZ(9999px)'; // buttons are at 10000
  }

  // function drawRandomDot() {
  //   ctx.fillStyle = `#${randInt(0x1000000).toString(16).padStart(6, '0')}`;
  //   ctx.beginPath();
  //
  //   const x = randInt(bitmapSize);
  //   const y = randInt(bitmapSize);
  //   const radius = randInt(10, 64);
  //   ctx.arc(x, y, radius, 0, Math.PI * 2);
  //   ctx.fill();
  // }

  function randInt(min, max) {
    if (max === undefined) {
      max = min;
      min = 0;
    }
    return Math.random() * (max - min) + min | 0;
  }

  function hideRegions() {
    for (let regionId in regionInfo) {
      let thisRegion = regionInfo[regionId];
      if (!thisRegion.mesh) { return; }
      thisRegion.mesh.visible = false;
    }

    regionEventCatcher.style.display = 'none';
  }

  function onObjectDiscovered(object, objectKey) {
    console.log('object discovered: ' + objectKey + ' (desktop)');

    if (object.type === 'region') {
      var alreadyContained = regionDropdown.selectables.map(function(selectableObj) {
        return selectableObj.id;
      }).indexOf(objectKey) > -1;

      if (!alreadyContained) {
        regionDropdown.addSelectable(objectKey, object.name);
        regionInfo[objectKey] = { name: object.name, color: `#${randInt(0x1000000).toString(16).padStart(6, '0')}` };

        // try to load bitmap for region boundary
        // http://localhost:8080/mediaFile/regionLAB_Zdzx9v4fqml/region.jpg
        let bitmapUrl = 'http://' + object.ip + ':' + realityEditor.network.getPort(object) + '/mediaFile/' + objectKey + '/region.jpg';
        let image = document.createElement('img');
        image.src = bitmapUrl;
        regionInfo[objectKey].loadedImage = image;
        // image.addEventListener('load', e => {
        //   if (regionInfo[objectKey].ctx) {
        //     regionInfo[objectKey].ctx.drawImage(image, 0, 0);
        //   }
        // });
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

    let ctx = regionInfo[selectedRegion].ctx;
    let texture = regionInfo[selectedRegion].texture;

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
      // console.log(planeIntersect.uv);

      ctx.fillStyle = regionInfo[selectedRegion].color || 'rgb(0,0,0)'; //`#${randInt(0x1000000).toString(16).padStart(6,
      // '0')}`;
      ctx.beginPath();

      const x = bitmapSize * planeIntersect.uv.x; //randInt(256);
      const y = bitmapSize * (1.0 - planeIntersect.uv.y); //randInt(256);
      const radius = Math.floor(bitmapSize/16); //randInt(10, 64);
      ctx.arc(x, y, radius, 0, Math.PI * 2);
      ctx.fill();

      texture.needsUpdate = true;

      // if (lastUV) {
      //
      // }

      lastUV = {
        x: planeIntersect.uv.x,
        y: planeIntersect.uv.y
      }
    }
  }

  function onPointerUp(event) {
    isPointerDown = false;

    // TODO: write the bitmap data to disk... store as an image on the server? or an array of values

    let object = realityEditor.getObject(selectedRegion);
    if (!object) { return; }

    let ctx = regionInfo[selectedRegion].ctx;

    var b64Image = ctx.canvas.toDataURL('image/jpeg');
    var u8Image  = b64ToUint8Array(b64Image);

    uploadTarget(object, new Blob([ u8Image ], {type: "image/jpg"}), function() {
      console.log('target upload success');
    }, function() {
      console.log('target upload error');
    });

    // var formData = new FormData();
    // // formData.append("region", new Blob([ u8Image ], {type: "image/jpg"}));
    // // formData.append('filename', 'regionMap');
    // formData.append('regionMap', new Blob([ u8Image ], {type: "image/jpg"}), 'region.jpg');
    //
    // var xhr = new XMLHttpRequest();
    //
    // // let url = 'http://' + object.ip + ':' + realityEditor.network.getPort(object) + '';
    // let postUrl = 'http://' + object.ip + ':' + realityEditor.network.getPort(object) + '/object/' + selectedRegion + '/uploadMediaFile';
    // xhr.open('POST', postUrl, true);
    //
    // // Set up a handler for when the request finishes.
    // xhr.onload = function () {
    //   if (xhr.status === 200) {
    //     // File(s) uploaded.
    //     console.log('successful upload');
    //
    //     let mediaUuid = JSON.parse(xhr.responseText).mediaUuid;
    //
    //     // let extension = isVideo ? '.mov' : '.jpg';
    //     // let filepath = 'http://' + spatialObject.serverIp + ':' + spatialObject.serverPort + '/mediaFile/' + spatialObject.object + '/' + mediaUuid + extension;
    //     console.log('uploaded mediaUuid = ' + mediaUuid);
    //
    //     // }, 1000);
    //
    //   } else {
    //     console.log('error uploading');
    //   }
    // };
    //
    // xhr.send(formData);
  }

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
})(realityEditor.regionEditor);
