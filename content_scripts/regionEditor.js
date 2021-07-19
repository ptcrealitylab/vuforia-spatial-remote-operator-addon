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
  const planeWidth = 30000;
  const planeHeight = 30000;

  const LOAD_PREVIOUS_ZONES = false;

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

        if (LOAD_PREVIOUS_ZONES) {
          if (thisRegion.loadedImage && thisRegion.loadedImage.complete) {
            console.log('loadedImage is complete:');
            console.log(thisRegion.loadedImage);
            // thisRegion.ctx.drawImage(thisRegion.loadedImage, 0, 0);

            let img = new Image();
            img.onload = function() {
              console.log('img loaded... draw');
              // thisRegion.ctx.drawImage(img, 0, 0);

              // var img1 = document.getElementById('img1');
              // var img2 = document.getElementById('img2');
              // var canvas = document.getElementById("canvas");
              // var context = canvas.getContext("2d");
              let width = img.width;
              let height = img.height;
              let pixels = 4 * width * height;

              thisRegion.ctx.drawImage(thisRegion.loadedImage, 0, 0);
              var image1 = thisRegion.ctx.getImageData(0, 0, width, height);
              var imageData1 = image1.data;

              let stride = 4;
              let tolerance = 20;
              for (let i = 0; i < imageData1.length; i += stride) {
                if (imageData1[i] < tolerance && imageData1[i+1] < tolerance && imageData1[i+2] < tolerance) {
                  imageData1[i+3] = 0; // set black to transparent
                }
              }
              image1.data = imageData1;
              thisRegion.ctx.putImageData(image1, 0, 0);
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
      const DEBUG_SHOW_CANVAS = false;
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
        regionInfo[objectKey] = { name: object.name, color: `#${randInt(0x1000000).toString(16).padStart(6, '0')}` };

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

    const THREE = realityEditor.gui.threejsScene.THREE;
    const MeshLine = realityEditor.gui.threejsScene.MeshLine;
    const MeshLineMaterial = realityEditor.gui.threejsScene.MeshLineMaterial;

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
      // console.log(planeIntersect.uv);

      ctx.fillStyle = thisRegion.color || 'rgb(0,0,0)'; //`#${randInt(0x1000000).toString(16).padStart(6,
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

      // let rgb = regionInfo[selectedRegion].color;

      let imageData = ctx.getImageData(0, 0, bitmapSize, bitmapSize).data;
      let hull = realityEditor.regionRenderer.calculateConvexHull(imageData, bitmapSize, thisRegion.color);

      realityEditor.regionRenderer.drawHull(hull, bitmapSize);

      // console.log('new convex hull', hull);

      let worldCoordinates = hullToWorldCoordinates(hull, bitmapSize, planeWidth);
      console.log(worldCoordinates);

      // realityEditor.regionRenderer.drawHull3D(worldCoordinates);

      if (!thisRegion.hullGroup) {
        thisRegion.hullGroup = new THREE.Group();
        realityEditor.gui.threejsScene.addToScene(thisRegion.hullGroup);
      }

      if (thisRegion.hullGroup) {
        // clear the group
        while (thisRegion.hullGroup.children.length) {
          thisRegion.hullGroup.remove(thisRegion.hullGroup.children[0]);
        }

//         const points = [];
//         worldCoordinates.forEach(function(coord) {
//           points.push(coord.x, coord.y, coord.z);
//         });
//         // for (let j = 0; j < Math.PI; j += (2 * Math.PI) / 100) {
//         //   points.push(Math.cos(j), Math.sin(j), 0);
//         // }
//
//         const line = new MeshLine();
//
//         var nCoordsComponents = 3; // x,y,z
//         var nColorComponents = 3;  // r,g,b
//         var nFaces = 6;            // e.g. for a pyramid
//         var nVerticesPerFace = 3;  // Triangle faces
//
// // Non-indexed arrays which have to be populated with your data.
//         var vertices = new Float32Array(nFaces*nVerticesPerFace*nCoordsComponents);
//         var colors = new Float32Array(nFaces*nVerticesPerFace*nColorComponents);
//
//         // pve Pyramid Vertices Expanded
//         var pve = new Float32Array(nFaces*nVerticesPerFace*nCoordsComponents);
//         function expandPyramidVertices()
//         {
//           for (i=0; i<nFaces; i++)
//           {
//             for (j=0; j<nVerticesPerFace; j++)
//             {
//               for (k=0; k<nCoordsComponents; k++)
//               {
//                 pve[(i*3+j)*3+k] = pv[pvi[i*3+j]*3+k];
//               }
//             }
//           }
//         }
//
//         var bufferGeometry = new THREE.BufferGeometry();
//         bufferGeometry.addAttribute('position', new THREE.Float32BufferAttribute(pve, nCoordsComponents));
//         bufferGeometry.addAttribute('color', new THREE.Float32BufferAttribute(colors, nColorComponents));
//
//         // var material = new THREE.MeshBasicMaterial ({vertexColors: THREE.VertexColors});
//         // var mesh  = new THREE.Mesh (bufferGeometry, material);
//
//         scene = new THREE.Scene();
//         scene.add(mesh);
//
//         // const geometry = new THREE.Geometry();
//         // for (let j = 0; j < Math.PI; j += 2 * Math.PI / 100) {
//         //   const v = new THREE.Vector3(coord.x, coord.y, coord.z);
//         //   geometry.vertices.push(v);
//         // }
//
//         line.setPoints(points);
//         // p is a decimal percentage of the number of points
// // ie. point 200 of 250 points, p = 0.8
// //         line.setPoints(points, p => 10); // makes width 2 * lineWidth
//
//         // line.setGeometry(geometry);
//
//         const material = new MeshLineMaterial({});
//         const mesh = new THREE.Mesh(line, material);

        let mesh = realityEditor.regionRenderer.pathToMesh(worldCoordinates);
        thisRegion.hullGroup.add(mesh);

        const DRAW_BOXES = false;
        if (DRAW_BOXES) {
          worldCoordinates.forEach(function (coord) {
            const vertexBox = new THREE.Mesh(new THREE.BoxGeometry(10, 10, 10), new THREE.MeshNormalMaterial());
            vertexBox.position.x = coord.x;
            vertexBox.position.y = coord.y + 500;
            vertexBox.position.z = coord.z;
            vertexBox.scale.set(20, 20, 20)
            thisRegion.hullGroup.add(vertexBox);
          });
        }

      }


        // worldObjectGroups[worldObjectId] = group;
        // group.matrixAutoUpdate = false; // this is needed to position it directly with matrices
        // scene.add(group);

        // // Helps visualize world object origin point for debugging
        // if (DISPLAY_ORIGIN_BOX && worldObjectId !== realityEditor.worldObjects.getLocalWorldId()) {
        //   const originBox = new THREE.Mesh(new THREE.BoxGeometry(10,10,10),new THREE.MeshNormalMaterial());
        //   const xBox = new THREE.Mesh(new THREE.BoxGeometry(5,5,5),new THREE.MeshBasicMaterial({color:0xff0000}));
        //   const yBox = new THREE.Mesh(new THREE.BoxGeometry(5,5,5),new THREE.MeshBasicMaterial({color:0x00ff00}));
        //   const zBox = new THREE.Mesh(new THREE.BoxGeometry(5,5,5),new THREE.MeshBasicMaterial({color:0x0000ff}));
        //   xBox.position.x = 15;
        //   yBox.position.y = 15;
        //   zBox.position.z = 15;
        //   group.add(originBox);
        //   originBox.scale.set(10,10,10);
        //   originBox.add(xBox);
        //   originBox.add(yBox);
        //   originBox.add(zBox);
        //
        //   // const plane =
        //
        //   // const geometry = new THREE.PlaneGeometry( 1000, 1000 );
        //   // const material = new THREE.MeshBasicMaterial( {color: 0xffff00, side: THREE.DoubleSide} );
        //   // const groundplaneMesh = new THREE.Mesh( geometry, material );
        //   // group.add(groundplaneMesh);
        //   // // realityEditor.gui.threejsScene.addToScene(groundplaneMesh, {attach: true});
        // }
        // const geometry = new THREE.Box(planeWidth, planeHeight);

        // thisRegion.texture = new THREE.CanvasTexture(thisRegion.ctx.canvas);
        //
        // const material = new THREE.MeshBasicMaterial({
        //   map: thisRegion.texture,
        //   transparent: true
        // });
        //
        // thisRegion.mesh = new THREE.Mesh(geometry, material);
        // thisRegion.mesh.rotation.x = -Math.PI / 2;
        //
        // realityEditor.gui.threejsScene.addToScene(thisRegion.mesh, {occluded: true});
      // }
    }
  }

  function hullToWorldCoordinates(hull, bitmapSize, planeSize) {
    const THREE = realityEditor.gui.threejsScene.THREE;

    return hull.map(function(pt) {
      return new THREE.Vector3((pt[0] / bitmapSize - 0.5) * planeSize, 0, (pt[1] / bitmapSize - 0.5) * planeSize);
    });

    // new THREE.Vector3(0,1,0);
    // return hull.map(function(pt) {
    //   return {
    //     x: (pt[0] / bitmapSize - 0.5) * planeSize,
    //     y: 0,
    //     z: (pt[1] / bitmapSize - 0.5) * planeSize
    //   }
    // });
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
