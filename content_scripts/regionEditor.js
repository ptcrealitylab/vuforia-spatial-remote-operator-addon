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

  let bitmapSize = 128;
  const planeWidth = 50000;
  const planeHeight = 50000;

  const LOAD_PREVIOUS_ZONES = true;
  const DEBUG_SHOW_CANVAS = false;

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

    // update(); // start update loop

    realityEditor.network.addObjectDiscoveredCallback(onObjectDiscovered);
  }

  // function update() {
  //   try {
  //     if (selectedRegion) {
  //       // drawRandomDot();
  //       // texture.needsUpdate = true;
  //     }
  //   } catch (e) {
  //     console.warn(e);
  //   }
  //
  //   requestAnimationFrame(update);
  // }

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

        if (LOAD_PREVIOUS_ZONES) {
          if (thisRegion.loadedImage && thisRegion.loadedImage.complete) {
            console.log('loadedImage is complete:');
            console.log(thisRegion.loadedImage);
            // thisRegion.ctx.drawImage(thisRegion.loadedImage, 0, 0);

            let img = new Image();

            img.onload = function() {
              console.log('img loaded... draw');

              let width = img.width;
              let height = img.height;

              thisRegion.ctx.drawImage(thisRegion.loadedImage, 0, 0);

              if (DEBUG_SHOW_CANVAS) { // adjust transparency for better visual effect only if it will be seen
                var image1 = thisRegion.ctx.getImageData(0, 0, width, height);
                var imageData1 = image1.data;

                let stride = 4;
                let tolerance = 20;
                for (let i = 0; i < imageData1.length; i += stride) {
                  if (imageData1[i] < tolerance && imageData1[i + 1] < tolerance && imageData1[i + 2] < tolerance) {
                    imageData1[i + 3] = 0; // set black to transparent
                  }
                }
                image1.data = imageData1;
                thisRegion.ctx.putImageData(image1, 0, 0);
              }

              renderUpdates(thisRegion);
            }
            img.src = thisRegion.loadedImage.src;
          }
        }
      }

      if (!thisRegion.mesh) {
        const geometry = new THREE.PlaneGeometry(planeWidth, planeHeight);

        thisRegion.texture = new THREE.CanvasTexture(thisRegion.ctx.canvas);

        const material = new THREE.MeshBasicMaterial({
          map: thisRegion.texture,
          transparent: true
        });

        thisRegion.mesh = new THREE.Mesh(geometry, material);
        thisRegion.mesh.rotation.x = -Math.PI / 2;

        // realityEditor.gui.threejsScene.addToScene(thisRegion.mesh, {occluded: true});
        realityEditor.gui.threejsScene.addToScene(thisRegion.mesh);
      }

      thisRegion.mesh.position.y = 200;
      thisRegion.mesh.visible = DEBUG_SHOW_CANVAS; // true
    }

    if (selectedRegion && regionInfo[selectedRegion]) {
      regionInfo[selectedRegion].mesh.position.y = 300;
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
        // regionInfo[objectKey] = { name: object.name, color: `#${randInt(0x1000000).toString(16).padStart(6, '0')}` };
        regionInfo[objectKey] = { name: object.name, color: '#ffffff' };

        // try to load bitmap for region boundary
        // http://localhost:8080/mediaFile/regionLAB_Zdzx9v4fqml/region.jpg
        // let bitmapUrl = 'http://' + object.ip + ':' + realityEditor.network.getPort(object) + '/mediaFile/' + objectKey + '/region.jpg';
        let bitmapUrl = 'http://' + object.ip + ':' + realityEditor.network.getPort(object) + '/obj/' + object.name + '/target/target.jpg';
        // image.addEventListener('load', e => {
        //   if (regionInfo[objectKey].ctx) {
        //     regionInfo[objectKey].ctx.drawImage(image, 0, 0);
        //   }
        // });

        var xhr = new XMLHttpRequest();
        xhr.open("GET", bitmapUrl);
        xhr.responseType = "blob";
        xhr.onload = function() {
          var urlCreator = window.URL || window.webkitURL;
          var imageUrl = urlCreator.createObjectURL(this.response);
          // document.querySelector("#image").src = imageUrl;
          let image = document.createElement('img');
          // image.src = bitmapUrl;
          image.src = imageUrl;
          regionInfo[objectKey].loadedImage = image;
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



    let thisRegion = regionInfo[selectedRegion];

    let ctx = thisRegion.ctx;
    let texture = thisRegion.texture;

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
      ctx.fillStyle = thisRegion.color;
      ctx.beginPath();
      const x = bitmapSize * planeIntersect.uv.x; //randInt(256);
      const y = bitmapSize * (1.0 - planeIntersect.uv.y); //randInt(256);
      const radius = Math.floor(bitmapSize/32); //randInt(10, 64);
      ctx.arc(x, y, radius, 0, Math.PI * 2);
      ctx.fill();
      texture.needsUpdate = true;
      renderUpdates(thisRegion);
    }
  }

  function renderUpdates(thisRegion) {
    const THREE = realityEditor.gui.threejsScene.THREE;
    let ctx = thisRegion.ctx;

    let imageData = ctx.getImageData(0, 0, bitmapSize, bitmapSize).data;
    let hull = realityEditor.regionRenderer.calculateConvexHull(imageData, bitmapSize, thisRegion.color);

    realityEditor.regionRenderer.drawHull(hull, bitmapSize);

    let worldCoordinates = hullToWorldCoordinates(hull, bitmapSize, planeWidth);
    console.log(worldCoordinates);

    if (!thisRegion.hullGroup) {
      thisRegion.hullGroup = new THREE.Group();
      realityEditor.gui.threejsScene.addToScene(thisRegion.hullGroup);
    }

    // clear the group
    while (thisRegion.hullGroup.children.length) {
      thisRegion.hullGroup.remove(thisRegion.hullGroup.children[0]);
    }

    let mesh = realityEditor.regionRenderer.pathToMesh(worldCoordinates);
    thisRegion.hullGroup.add(mesh);
  }

  function hullToWorldCoordinates(hull, bitmapSize, planeSize) {
    const THREE = realityEditor.gui.threejsScene.THREE;

    return hull.map(function(pt) {
      return new THREE.Vector3((pt[0] / bitmapSize - 0.5) * planeSize, 0, (pt[1] / bitmapSize - 0.5) * planeSize);
    });
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
