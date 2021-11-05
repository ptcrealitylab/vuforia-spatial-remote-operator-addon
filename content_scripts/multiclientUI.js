/*
* Copyright © 2018 PTC
*
* This Source Code Form is subject to the terms of the Mozilla Public
* License, v. 2.0. If a copy of the MPL was not distributed with this
* file, You can obtain one at http://mozilla.org/MPL/2.0/.
*/

createNameSpace('realityEditor.device.multiclientUI');

(function(exports) {

    let allConnectedCameras = {};
    let isCameraSubscriptionActive = false;
    let THREE;

    function initService() {
        if (!realityEditor.device.desktopAdapter.isDesktop()) { return; }

        realityEditor.network.addObjectDiscoveredCallback(function(object, objectKey) {
            setTimeout(function() {
                setupWorldSocketSubscriptionsIfNeeded(objectKey);
            }, 100); // give time for bestWorldObject to update before checking
        });

        THREE = realityEditor.gui.threejsScene.THREE;

        update();
    }

    function setupWorldSocketSubscriptionsIfNeeded(objectKey) {
        if (isCameraSubscriptionActive) { return; }

        // subscribe to remote operator camera positions
        // let world = realityEditor.worldObjects.getBestWorldObject();
        // if (!world) { return; }

        // let worldId = world.objectId;
        // if (objectKey === worldId) {
        let object = realityEditor.getObject(objectKey);
        if (object && (object.isWorldObject || object.type === 'world')) {
            realityEditor.network.realtime.subscribeToCameraMatrices(objectKey, onCameraMatrix);
            isCameraSubscriptionActive = true;
        }
    }

    function onCameraMatrix(data) {
        let msgData = JSON.parse(data);
        if (typeof msgData.cameraMatrix !== 'undefined' && typeof msgData.editorId !== 'undefined') {
            allConnectedCameras[msgData.editorId] = msgData.cameraMatrix;
        }
    }

    function update() {
        // this remote operator's camera position already gets sent in desktopCamera.js
        // here we render boxes at the location of each other camera...

        try {
            Object.keys(allConnectedCameras).forEach(function(editorId) {
                let cameraMatrix = allConnectedCameras[editorId];
                let existingMesh = realityEditor.gui.threejsScene.getObjectByName('camera_' + editorId);
                if (!existingMesh) {
                    existingMesh = new THREE.Mesh(new THREE.BoxGeometry(100,100,100),new THREE.MeshNormalMaterial());
                    existingMesh.name = 'camera_' + editorId;
                    existingMesh.matrixAutoUpdate = false;
                    realityEditor.gui.threejsScene.addToScene(existingMesh);
                }
                realityEditor.gui.threejsScene.setMatrixFromArray(existingMesh.matrix, cameraMatrix);
            });
        } catch (e) {
            console.warn(e);
        }

        requestAnimationFrame(update);
    }

    realityEditor.addons.addCallback('init', initService);
})(realityEditor.device.multiclientUI);
