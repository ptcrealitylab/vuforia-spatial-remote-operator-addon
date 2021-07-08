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

  let ground = null;

  function initService() {
    if (!realityEditor.device.desktopAdapter.isDesktop()) { return; }

    createRegionDropdown();

    update(); // start update loop

    realityEditor.network.addObjectDiscoveredCallback(onObjectDiscovered);
  }

  function update() {
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
      }
    } else {
      console.log('no region selected');
      selectedRegion = null;
      console.log('stop rendering regions');
    }
  }

  function onRegionExpandedChanged(isExpanded) {
    if (isExpanded) {
      console.log('render regions');
    } else {
      // if (!selectedRegion) {
      //   console.log('stop rendering regions');
      // }
    }
  }

  // function renderRegions() {
  //   if (!ground) {
  //     const divisions = 10 * 2 * 2;
  //     const size = (1000 / 2) * divisions;
  //     const THREE = realityEditor.gui.threejsScene.THREE;
  //     const colorCenterLine = new THREE.Color(1, 0.3, 0.3);
  //     const colorGrid = new THREE.Color(1, 1, 1);
  //     ground = new THREE.GridHelper( size, divisions, colorCenterLine, colorGrid );
  //     // threejsContainerObj.add( gridHelper );
  //     realityEditor.gui.threejsScene.addToScene(ground, {occluded: true});
  //   }
  // }

  function onObjectDiscovered(object, objectKey) {
    console.log('object discovered: ' + objectKey + ' (desktop)');

    if (object.type === 'region') {
      var alreadyContained = regionDropdown.selectables.map(function(selectableObj) {
        return selectableObj.id;
      }).indexOf(objectKey) > -1;

      if (!alreadyContained) {
        regionDropdown.addSelectable(objectKey, object.name);
        regionInfo[objectKey] = { name: object.name };
      }
    }
  }

  realityEditor.addons.addCallback('init', initService);
})(realityEditor.regionEditor);
