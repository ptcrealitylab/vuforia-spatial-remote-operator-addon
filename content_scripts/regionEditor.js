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
  let texture;

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
      console.log('no region selected');
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
    if (!ground) {
      const THREE = realityEditor.gui.threejsScene.THREE;

      // const divisions = 10 * 2 * 2;
      // const size = (1000 / (2 * 2)) * divisions;
      // const colorCenterLine = new THREE.Color(1, 0.3, 0.3);
      // const colorGrid = new THREE.Color(1, 1, 1);
      // ground = new THREE.GridHelper( size, divisions, colorCenterLine, colorGrid );
      // // threejsContainerObj.add( gridHelper );
      // realityEditor.gui.threejsScene.addToScene(ground, {occluded: true});

      const boxWidth = 30000;
      const boxHeight = 30000;
      // const boxDepth = 1000;
      const geometry = new THREE.PlaneGeometry(boxWidth, boxHeight); //, boxDepth);

      const cubes = [];  // just an array we can use to rotate the cubes
      ctx.canvas.width = bitmapSize;
      ctx.canvas.height = bitmapSize;
      ctx.canvas.style.backgroundColor = 'transparent';
      // ctx.fillStyle = '#FFF';
      // ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);
      texture = new THREE.CanvasTexture(ctx.canvas);

      const material = new THREE.MeshBasicMaterial({
        map: texture,
        transparent: true
      });
      ground = new THREE.Mesh(geometry, material);
      ground.rotation.x = -Math.PI / 2;
      ground.position.y = 100;
      // scene.add(cube);
      cubes.push(ground);  // add to our list of cubes to rotate

      realityEditor.gui.threejsScene.addToScene(ground, {occluded: true});
    }
    ground.visible = true;

    regionEventCatcher.style.display = '';
    regionEventCatcher.style.transform = 'translateZ(9999px)'; // buttons are at 10000
  }

  function drawRandomDot() {
    ctx.fillStyle = `#${randInt(0x1000000).toString(16).padStart(6, '0')}`;
    ctx.beginPath();

    const x = randInt(bitmapSize);
    const y = randInt(bitmapSize);
    const radius = randInt(10, 64);
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fill();
  }

  function randInt(min, max) {
    if (max === undefined) {
      max = min;
      min = 0;
    }
    return Math.random() * (max - min) + min | 0;
  }

  function hideRegions() {
    if (!ground) { return; }
    ground.visible = false;
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
      console.log(planeIntersect.uv);

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

    // if (intersects.length > 0) {
    //   let firstIntersect = intersects[0];
    //   // console.log('intersect', firstIntersect.uv);
    //   console.log(intersects);
    //
    //   intersects[1].object.geometry.type
    //
    // }
  }

  function onPointerUp(event) {
    isPointerDown = false;

    // TODO: write the bitmap data to disk... store as an image on the server? or an array of values
  }

  realityEditor.addons.addCallback('init', initService);
})(realityEditor.regionEditor);
