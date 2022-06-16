/*
* Copyright © 2018 PTC
*
* This Source Code Form is subject to the terms of the Mozilla Public
* License, v. 2.0. If a copy of the MPL was not distributed with this
* file, You can obtain one at http://mozilla.org/MPL/2.0/.
*/

createNameSpace('realityEditor.device.desktopCamera');

/**
 * @fileOverview realityEditor.device.desktopCamera.js
 * Responsible for manipulating the camera position and resulting view matrix, on remote desktop clients
 */

(function(exports) {
    const DEBUG = false;

    let INITIAL_CAMERA_POSITIONS = Object.freeze({
        DESK: [757, 1410, -956], // [330, 3751, -1575]; //[735, -1575, -162]; //[1000, -500, 500];
        LAB_TABLE: [-1499.9648912671637, 8275.552791086136, 5140.3791620707225],
        KITCHEN: [-3127, 3732, -3493],
        BEDROOM: [1800, 7300, -5300],
        LAB: [-1499.9648912671637, 8275.552791086136, 5140.3791620707225]
    });
    let INITIAL_TARGET_POSITIONS = Object.freeze({
        DESK: [583, -345, 2015], // [14, -180, 1611]
        LAB_TABLE: [-5142.168341070036, 924.9535037677615, -1269.0232578867729],
        KITCHEN: [-339, 988, -4633],
        BEDROOM: [0, 0, 0],
        LAB: [0, 0, 0]
    });

    const MIN_DIST_TO_CAMERA = 0; // the point at which the 2D video will show up
    exports.MIN_DIST_TO_CAMERA = MIN_DIST_TO_CAMERA;

    const perspectives = {
        1: {
            name: 'firstPersonFollow',
            threejsPositionObject: null,
            threejsTargetObject: null,
            // positionRelativeToCamera: [0, 0, 0],
            // targetRelativeToCamera: [0, 0, 500],
            distanceToCamera: MIN_DIST_TO_CAMERA,
            smoothing: 0.2,
            debugColor: '#ffffff',
            keyboardShortcut: '_1',
            menuBarName: 'Follow 1st-Person',
            render2DVideo: true,
        },
        2: {
            name: 'almostFirstPersonFollow',
            threejsPositionObject: null,
            threejsTargetObject: null,
            // positionRelativeToCamera: [0, -250, -1000],
            // targetRelativeToCamera: [0, 0, 2000],
            distanceToCamera: 1500 + MIN_DIST_TO_CAMERA,
            smoothing: 0.5,
            debugColor: '#ffffff',
            keyboardShortcut: '_2',
            menuBarName: 'Follow 1st-Person (Wide)',
        },
        3: {
            name: 'thirdPersonFollowClose',
            threejsPositionObject: null,
            threejsTargetObject: null,
            // positionRelativeToCamera: [0, -1000, -2000],
            // targetRelativeToCamera: [0, 0, 2000],
            distanceToCamera: 3000 + MIN_DIST_TO_CAMERA,
            smoothing: 0.5,
            debugColor: '#ffffff',
            keyboardShortcut: '_3',
            menuBarName: 'Follow 3rd-Person'
        },
        4: {
            name: 'thirdPersonFollowFar',
            threejsPositionObject: null,
            threejsTargetObject: null,
            // positionRelativeToCamera: [0, -2000, -3000],
            // targetRelativeToCamera: [0, 0, 2000],
            distanceToCamera: 4500 + MIN_DIST_TO_CAMERA,
            smoothing: 0.8,
            debugColor: '#ffffff',
            keyboardShortcut: '_4',
            menuBarName: 'Follow 3rd-Person (Wide)'
        },
        5: {
            name: 'godMode',
            threejsPositionObject: null,
            threejsTargetObject: null,
            // positionRelativeToCamera: [0, -5000, -4000],
            // targetRelativeToCamera: [0, 0, 0],
            distanceToCamera: 6000 + MIN_DIST_TO_CAMERA,
            smoothing: 0.8,
            debugColor: '#ffffff',
            keyboardShortcut: '_5',
            menuBarName: 'Follow Aerial'
        }
    }
    exports.perspectives = perspectives;

    var cameraTargetPosition = [0, 0, 0];
    let cameraTargetElementId = null;

    let cameraFollowerElementId = null;

    var previousTargetPosition = [0, 0, 0];
    var isFollowingObjectTarget = false;

    var targetOnLoad = 'origin'; // window.localStorage.getItem('selectedObjectKey');

    var DEBUG_SHOW_LOGGER = false;
    var closestObjectLog = null; // if DEBUG_SHOW_LOGGER, this will be a text field

    /** @type {Dropdown} - DOM element to choose which object to target for the camera */
    var objectDropdown;

    // polyfill for requestAnimationFrame to provide a smooth update loop
    let requestAnimationFrame = window.requestAnimationFrame ||
        window.webkitRequestAnimationFrame || function(cb) {setTimeout(cb, 17);};
    let virtualCamera;

    let unityCamera;

    let knownInteractionStates = {
        pan: false,
        rotate: false,
        scale: false
    }

    let staticInteractionCursor = null;
    let interactionCursor = null;
    let pointerPosition = { x: 0, y: 0 };

    function makeGroundPlaneRotationX(theta) {
        var c = Math.cos(theta), s = Math.sin(theta);
        return [
            1, 0, 0, 0,
            0, c, -s, 0,
            0, s, c, 0,
            0, 0, 0, 1
        ];
    }
    
    function makeGroundPlaneRotationY(theta) {
        var c = Math.cos(theta), s = Math.sin(theta);
        return [
            c, 0, s, 0,
            0, 1, 0, 0,
            -s, 0, c, 0,
            0, 0, 0, 1
        ];
    }

    function makeGroundPlaneRotationZ(theta) {
        var c = Math.cos(theta), s = Math.sin(theta);
        return [
            c, -s, 0, 0,
            s, c, 0, 0,
            0, 0, 1, 0,
            0, 0, 0, 1
        ];
    }

    /**
     * Public init method to enable rendering if isDesktop
     */
    function initService() {
        if (!realityEditor.device.desktopAdapter.isDesktop()) { return; }

        if (!realityEditor.sceneGraph.getSceneNodeById('CAMERA')) { // reload after camera has been created
            setTimeout(function() {
                initService();
            }, 100);
            return;
        }

        let parentNode = realityEditor.sceneGraph.getGroundPlaneNode();
        let cameraGroupContainerId = realityEditor.sceneGraph.addVisualElement('CameraGroupContainer', parentNode);
        let cameraGroupContainer = realityEditor.sceneGraph.getSceneNodeById(cameraGroupContainerId);
        let transformationMatrix = makeGroundPlaneRotationX(0);
        transformationMatrix[13] = 1286; // ground plane translation
        cameraGroupContainer.setLocalMatrix(transformationMatrix);
        
        // let elementId = realityEditor.sceneGraph.getVisualElement('CameraGroupContainer');

        let cameraNode = realityEditor.sceneGraph.getSceneNodeById('CAMERA');
        virtualCamera = new realityEditor.device.VirtualCamera(cameraNode, 1, 0.001, 10, INITIAL_CAMERA_POSITIONS.LAB, false);

        cameraTargetElementId = realityEditor.sceneGraph.addVisualElement('cameraTarget', undefined, undefined, virtualCamera.getTargetMatrix());

        virtualCamera.onPanToggled(function(isPanning) {
            if (isPanning && !knownInteractionStates.pan) {
                knownInteractionStates.pan = true;
                // console.log('start pan');
                panToggled();
            } else if (!isPanning && knownInteractionStates.pan) {
                knownInteractionStates.pan = false;
                // console.log('stop pan');
                panToggled();
            }
        });
        virtualCamera.onRotateToggled(function(isRotating) {
            if (isRotating && !knownInteractionStates.rotate) {
                knownInteractionStates.rotate = true;
                // console.log('start rotate');
                rotateToggled();
            } else if (!isRotating && knownInteractionStates.rotate) {
                knownInteractionStates.rotate = false;
                // console.log('stop rotate');
                rotateToggled();
            }
        });
        virtualCamera.onScaleToggled(function(isScaling) {
            if (isScaling && !knownInteractionStates.scale) {
                knownInteractionStates.scale = true;
                // console.log('start scale');
                scaleToggled();
            } else if (!isScaling && knownInteractionStates.scale) {
                knownInteractionStates.scale = false;
                // console.log('stop scale');
                scaleToggled();
            }
        });

        interactionCursor = document.createElement('img');
        interactionCursor.id = 'interactionCursor';
        document.body.appendChild(interactionCursor);

        staticInteractionCursor = document.createElement('img');
        staticInteractionCursor.id = 'staticInteractionCursor';
        document.body.appendChild(staticInteractionCursor);

        document.addEventListener('pointermove', function(e) {
            pointerPosition.x = e.clientX;
            pointerPosition.y = e.clientY;

            let interactionRect = getRectSafe(interactionCursor);
            if (interactionRect) {
                interactionCursor.style.left = (pointerPosition.x - interactionRect.width / 2) + 'px';
                interactionCursor.style.top = (pointerPosition.y - interactionRect.height / 2) + 'px';
            }
        });

        let invertedCoordinatesNodeId = realityEditor.sceneGraph.addVisualElement('INVERTED_COORDINATES', undefined, undefined, [-1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
        let invertedCoordinatesNode = realityEditor.sceneGraph.getSceneNodeById(invertedCoordinatesNodeId);

        // the 1.1 should be a 1, but it's a bit off because the area target scan wasn't perfectly scanned with the same axes as the original calibrated model
        let rotatedCoordinatesNodeId = realityEditor.sceneGraph.addVisualElement('ROTATED_COORDINATES', invertedCoordinatesNode, undefined, makeGroundPlaneRotationY(Math.PI * 1.1));
        let rotatedCoordinatesNode = realityEditor.sceneGraph.getSceneNodeById(rotatedCoordinatesNodeId);

        // sceneNodeRotateX.setLocalMatrix(makeGroundPlaneRotationX(-(Math.PI/2)));

        // let unityCameraNodeId = realityEditor.sceneGraph.addVisualElement('UNITY_CAMERA', invertedCoordinatesNode);
        let unityCameraNodeId = realityEditor.sceneGraph.addVisualElement('UNITY_CAMERA', rotatedCoordinatesNode);
        let unityCameraNode = realityEditor.sceneGraph.getSceneNodeById(unityCameraNodeId);
        unityCamera = new realityEditor.device.VirtualCamera(unityCameraNode, 1, 0.001, 10, INITIAL_CAMERA_POSITIONS.LAB, true);

        update();

        // disable right-click context menu so we can use right-click to rotate camera
        document.addEventListener('contextmenu', event => event.preventDefault());

        try {
            addSensitivitySlidersToMenu();
        } catch (e) {
            console.warn('Slider components for settings menu not available, skipping', e);
        }

        createObjectSelectionDropdown();

        realityEditor.gui.getMenuBar().addCallbackToItem(realityEditor.gui.ITEM.ResetCameraPosition, () => {
            console.log('reset camera position');
            virtualCamera.reset();
            unityCamera.reset();
        });

        realityEditor.gui.getMenuBar().addCallbackToItem(realityEditor.gui.ITEM.UnityVirtualizers, (value) => {
            if (objectDropdown) {
                if (value && !window.DEBUG_DISABLE_DROPDOWNS) {
                    objectDropdown.dom.style.display = '';
                } else {
                    objectDropdown.dom.style.display = 'none';
                }
            }
        });

        realityEditor.gui.getMenuBar().addCallbackToItem(realityEditor.gui.ITEM.OrbitCamera, (value) => {
            virtualCamera.idleOrbitting = value;
            unityCamera.idleOrbitting = value;
        });

        // realityEditor.gui.getMenuBar().addCallbackToItem(realityEditor.gui.ITEM.Follow1stPerson, () => {
        //     let virtualizerSceneNodes = realityEditor.gui.ar.desktopRenderer.getCameraVisSceneNodes();
        //     if (virtualizerSceneNodes.length > 0) {
        //         virtualCamera.follow1stPerson(virtualizerSceneNodes[0]);
        //         unityCamera.follow1stPerson(virtualizerSceneNodes[0]);                
        //     }
        // });
        //
        // realityEditor.gui.getMenuBar().addCallbackToItem(realityEditor.gui.ITEM.Follow3rdPerson, () => {
        //     let virtualizerSceneNodes = realityEditor.gui.ar.desktopRenderer.getCameraVisSceneNodes();
        //     if (virtualizerSceneNodes.length > 0) {
        //         virtualCamera.follow3rdPerson(virtualizerSceneNodes[0]);
        //         unityCamera.follow3rdPerson(virtualizerSceneNodes[0]);
        //     }
        // });

        realityEditor.gui.getMenuBar().addCallbackToItem(realityEditor.gui.ITEM.StopFollowing, () => {
            virtualCamera.stopFollowing();
            unityCamera.stopFollowing();
        });

        if (DEBUG_SHOW_LOGGER) {
            closestObjectLog = document.createElement('div');
            closestObjectLog.style.position = 'absolute';
            closestObjectLog.style.left = 0;
            closestObjectLog.style.top = 0;
            closestObjectLog.style.fontFamily = 'sans-serif';
            closestObjectLog.style.color = 'cyan';
            document.body.appendChild(closestObjectLog);
        }
        
        // Setup Following Menu
        for (let info of Object.values(perspectives)) {
            const followItem = new realityEditor.gui.MenuItem(info.menuBarName, { shortcutKey: info.keyboardShortcut, toggle: false, disabled: true }, () => {
                let virtualizerSceneNodes = realityEditor.gui.ar.desktopRenderer.getCameraVisSceneNodes();
                if (virtualizerSceneNodes.length > 0) {
                    const thisVirtualizerId = parseInt(virtualizerSceneNodes[0].id.match(/\d+/)[0]); // TODO: pass this along in a less fragile way
                    virtualCamera.follow(virtualizerSceneNodes[0], thisVirtualizerId, info);
                    unityCamera.follow(virtualizerSceneNodes[0], thisVirtualizerId, info);
                    
                    if (info.render2DVideo) {
                        realityEditor.gui.ar.desktopRenderer.showCameraCanvas(thisVirtualizerId);
                    } else {
                        realityEditor.gui.ar.desktopRenderer.hideCameraCanvas(thisVirtualizerId);
                    }
                }
            });
            realityEditor.gui.getMenuBar().addItemToMenu(realityEditor.gui.MENU.Camera, followItem);
        }
    }

    function addSensitivitySlidersToMenu() {
        // add sliders for strafe, rotate, and zoom sensitivity
        realityEditor.gui.settings.addSlider('Zoom Sensitivity', 'how fast scroll wheel zooms camera', 'cameraZoomSensitivity',  '../../../svg/cameraZoom.svg', 0.5, function(newValue) {
            console.log('zoom value = ' + newValue);
        });

        realityEditor.gui.settings.addSlider('Pan Sensitivity', 'how fast keybord pans camera', 'cameraPanSensitivity',  '../../../svg/cameraPan.svg', 0.5, function(newValue) {
            console.log('pan value = ' + newValue);
        });

        realityEditor.gui.settings.addSlider('Rotate Sensitivity', 'how fast right-click dragging rotates camera', 'cameraRotateSensitivity',  '../../../svg/cameraRotate.svg', 0.5, function(newValue) {
            console.log('rotate value = ' + newValue);
        });
    }

    function createObjectSelectionDropdown() {
        if (!objectDropdown) {

            var textStates = {
                collapsedUnselected: 'Select Camera Target',
                expandedEmpty: 'No Objects Discovered',
                expandedOptions: 'Select an Object',
                selected: 'Selected: '
            };

            objectDropdown = new realityEditor.gui.dropdown.Dropdown('objectDropdown', textStates, {width: '400px', left: '310px', top: '30px'}, document.body, true, onObjectSelectionChanged, onObjectExpandedChanged);

            objectDropdown.addSelectable('origin', 'World Origin');

            objectDropdown.dom.style.display = 'none'; // defaults to hidden

            Object.keys(objects).forEach(function(objectKey) {
                tryAddingObjectToDropdown(objectKey);
            });

            // when an object is detected, check if we need to add it to the dropdown
            realityEditor.network.addObjectDiscoveredCallback(function(_object, objectKey) {
                tryAddingObjectToDropdown(objectKey);
                if (objectKey === targetOnLoad) {
                    setTimeout(function() {
                        selectObject(objectKey);
                    }, 500);
                }
            });
        }
    }

    function tryAddingObjectToDropdown(objectKey) {
        var alreadyContained = objectDropdown.selectables.map(function(selectableObj) {
            return selectableObj.id;
        }).indexOf(objectKey) > -1;

        if (!alreadyContained) {
            // don't show objects that don't have a valid matrix... todo: add them to menu as soon as a first valid matrix is received
            var object = realityEditor.getObject(objectKey);
            if (object.matrix && object.matrix.length === 16) {
                objectDropdown.addSelectable(objectKey, objectKey);
            }

            let INCLUDE_TOOLS_IN_DROPDOWN = false;
            if (INCLUDE_TOOLS_IN_DROPDOWN) {
                for (let frameKey in object.frames) {
                    tryAddingFrameToDropdown(objectKey, frameKey);
                }
            }
        }
    }

    function tryAddingFrameToDropdown(objectKey, frameKey) {
        var alreadyContained = objectDropdown.selectables.map(function(selectable) {
            return selectable.id;
        }).indexOf(frameKey) > -1;

        if (!alreadyContained) {
            // don't show objects that don't have a valid matrix... todo: add them to menu as soon as a first valid matrix is received
            var frame = realityEditor.getFrame(objectKey, frameKey);
            if (frame) {
                objectDropdown.addSelectable(frameKey, frameKey);
            }
        }
    }

    // function setTargetPositionToObject(objectKey) {
    //     if (objectKey === 'origin') {
    //         cameraTargetPosition = [0, 0, 0];
    //         isFollowingObjectTarget = true;
    //         return;
    //     }
    //
    //     var targetPosition = realityEditor.sceneGraph.getWorldPosition(objectKey);
    //     if (targetPosition) {
    //         cameraTargetPosition = [targetPosition.x, targetPosition.y, targetPosition.z];
    //         isFollowingObjectTarget = true;
    //     }
    // }

    function onObjectSelectionChanged(selected) {
        if (selected && selected.element) {
            virtualCamera.selectObject(selected.element.id);
        } else {
            virtualCamera.deselectTarget();
        }
    }

    function selectObject(objectKey) { // todo use this in objectselectionchanged and element clicked
        objectDropdown.setText('Selected: ' + objectKey, true);
        virtualCamera.selectObject(objectKey);
        window.localStorage.setItem('selectedObjectKey', objectKey);
    }

    function onObjectExpandedChanged(_isExpanded) {
        // console.log(isExpanded);
    }

    // messageButtonIcon.src = '/addons/spatialCommunication/bw-message.svg';

    function panToggled() {
        if (threejsObject) {
            threejsObject.visible = knownInteractionStates.pan || knownInteractionStates.rotate || knownInteractionStates.scale;
        }
        updateInteractionCursor(threejsObject.visible, '/addons/vuforia-spatial-remote-operator-addon/cameraPan.svg');
    }
    function rotateToggled() {
        if (threejsObject) {
            threejsObject.visible = knownInteractionStates.rotate || knownInteractionStates.pan || knownInteractionStates.scale;
        }
        updateInteractionCursor(threejsObject.visible, '/addons/vuforia-spatial-remote-operator-addon/cameraRotate.svg');
    }
    function scaleToggled() {
        // if (threejsObject) {
        //     threejsObject.visible = knownInteractionStates.scale || knownInteractionStates.pan || knownInteractionStates.rotate;
        // }
        if (!threejsObject.visible) {
            updateInteractionCursor(false);
        }
        // updateInteractionCursor(threejsObject.visible, '/addons/vuforia-spatial-remote-operator-cloud-edition/cameraZoom.svg');
    }
    function updateInteractionCursor(visible, imageSrc) {
        interactionCursor.style.display = visible ? 'inline' : 'none';
        if (imageSrc) {
            interactionCursor.src = imageSrc;
        }
        let interactionRect = getRectSafe(interactionCursor);
        if (interactionRect) {
            interactionCursor.style.left = (pointerPosition.x - interactionRect.width / 2) + 'px';
            interactionCursor.style.top = (pointerPosition.y - interactionRect.height / 2) + 'px';
        }

        staticInteractionCursor.style.display = visible ? 'inline' : 'none';
        if (imageSrc) {
            staticInteractionCursor.src = imageSrc;
        }
        let staticInteractionRect = getRectSafe(staticInteractionCursor);
        if (staticInteractionRect) {
            staticInteractionCursor.style.left = (pointerPosition.x - staticInteractionRect.width / 2) + 'px';
            staticInteractionCursor.style.top = (pointerPosition.y - staticInteractionRect.height / 2) + 'px';
        }
    }
    function getRectSafe(div) {
        if (!div || div.style.display === 'none') { return null; }
        let rects = div.getClientRects();
        if (!rects || rects.length === 0) { return null; }
        return rects[0];
    }

    let threejsObject = null;

    /**
     * Main update loop
     */
    function update() {

        if (virtualCamera) {
            try {
                virtualCamera.update();

                let worldObject = realityEditor.worldObjects.getBestWorldObject();
                if (worldObject) {
                    let worldId = worldObject.objectId;

                    // render a cube at the virtual camera's target position
                    let sceneNode = realityEditor.sceneGraph.getSceneNodeById(cameraTargetElementId);
                    sceneNode.setLocalMatrix(virtualCamera.getTargetMatrix());

                    if (!threejsObject && worldId !== realityEditor.worldObjects.getLocalWorldId()) {
                        const THREE = realityEditor.gui.threejsScene.THREE;
                        threejsObject = new THREE.Mesh(new THREE.BoxGeometry(20, 20, 20), new THREE.MeshBasicMaterial({color: 0x00ffff})); //new THREE.MeshNormalMaterial()); // THREE.MeshBasicMaterial({color:0xff0000})
                        threejsObject.name = 'cameraTargetElement';
                        threejsObject.matrixAutoUpdate = false;
                        threejsObject.visible = false;
                        realityEditor.gui.threejsScene.addToScene(threejsObject, {worldObjectId: worldId}); //{worldObjectId: areaTargetNode.id, occluded: true});
                    }
                    if (threejsObject) {
                        realityEditor.gui.threejsScene.setMatrixFromArray(threejsObject.matrix, sceneNode.worldMatrix); //virtualCamera.getTargetMatrix());
                    }

                    unityCamera.update();

                    let cameraNode = realityEditor.sceneGraph.getSceneNodeById('CAMERA');
                    let gpNode = realityEditor.sceneGraph.getSceneNodeById(realityEditor.sceneGraph.NAMES.GROUNDPLANE + realityEditor.sceneGraph.TAGS.ROTATE_X);
                    if (!gpNode) {
                        gpNode = realityEditor.sceneGraph.getSceneNodeById(realityEditor.sceneGraph.NAMES.GROUNDPLANE);
                    }
                    realityEditor.network.realtime.sendCameraMatrix(worldId, cameraNode.getMatrixRelativeTo(gpNode));
                }
            } catch (e) {
                if (DEBUG) {
                    console.warn('error updating Virtual Camera', e);
                }
            }
        }

        requestAnimationFrame(update);
    }


    realityEditor.addons.addCallback('init', initService);
})(realityEditor.device.desktopCamera);
