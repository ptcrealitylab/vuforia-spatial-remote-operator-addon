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

    // arbitrary birds-eye view to start the camera with. it will look towards the world object origin
    let INITIAL_CAMERA_POSITION = [-1499.9648912671637, 8275.552791086136, 5140.3791620707225];

    // used to render an icon at the target position to help you navigate the scene
    let rotateCenterElementId = null;

    var targetOnLoad = 'origin'; // window.localStorage.getItem('selectedObjectKey');

    var DEBUG_SHOW_LOGGER = false;
    var closestObjectLog = null; // if DEBUG_SHOW_LOGGER, this will be a text field

    /** @type {Dropdown} - DOM element to choose which object to target for the camera */
    var objectDropdown;

    // polyfill for requestAnimationFrame to provide a smooth update loop
    let requestAnimationFrame = window.requestAnimationFrame ||
        window.webkitRequestAnimationFrame || function(cb) {setTimeout(cb, 17);};
    let virtualCamera;

    // adds another camera to the scene with the right coordinate system for the old virtualizer project
    const ENABLE_LEGACY_UNITY_VIRTUALIZER = false;
    let unityCamera;

    let knownInteractionStates = {
        pan: false,
        rotate: false,
        scale: false
    };

    let staticInteractionCursor = null;
    let interactionCursor = null;
    let pointerPosition = { x: 0, y: 0 };
    let cameraTargetIcon = null;

    let currentFollowIndex = 0; // which virtualizer we are currently following
    let lastFollowingIndex = 0; // lets you start following the camera you were previously following. defaults to camera 0
    let currentlyFollowingId = null;
    // defines each of the menu shortcuts to follow the virtualizer
    const perspectives = [
        {
            keyboardShortcut: '_1',
            menuBarName: 'Follow 1st-Person',
            distanceToCamera: 0,
            render2DVideo: true
        },
        {
            keyboardShortcut: '_2',
            menuBarName: 'Follow 1st-Person (Wide)',
            distanceToCamera: 1500,
            render2DVideo: false
        },
        {
            keyboardShortcut: '_3',
            menuBarName: 'Follow 3rd-Person',
            distanceToCamera: 3000,
            render2DVideo: false
        },
        {
            keyboardShortcut: '_4',
            menuBarName: 'Follow 3rd-Person (Wide)',
            distanceToCamera: 4500,
            render2DVideo: false
        },
        {
            keyboardShortcut: '_5',
            menuBarName: 'Follow Aerial',
            distanceToCamera: 6000,
            render2DVideo: false
        }
    ];
    exports.perspectives = perspectives;


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

    /**
     * Public init method to enable rendering if isDesktop
     */
    function initService(floorOffset) {
        if (!realityEditor.device.desktopAdapter) {
            setTimeout(function() {
                initService(floorOffset);
            }, 100);
            return;
        }

        if (realityEditor.device.environment.isARMode()) { return; }

        if (!realityEditor.sceneGraph.getSceneNodeById('CAMERA')) { // reload after camera has been created
            setTimeout(function() {
                initService(floorOffset);
            }, 100);
            return;
        }

        let parentNode = realityEditor.sceneGraph.getGroundPlaneNode();
        let cameraGroupContainerId = realityEditor.sceneGraph.addVisualElement('CameraGroupContainer', parentNode);
        let cameraGroupContainer = realityEditor.sceneGraph.getSceneNodeById(cameraGroupContainerId);
        let transformationMatrix = makeGroundPlaneRotationX(0);
        transformationMatrix[13] = -floorOffset; // ground plane translation
        cameraGroupContainer.setLocalMatrix(transformationMatrix);

        let cameraNode = realityEditor.sceneGraph.getSceneNodeById('CAMERA');
        virtualCamera = new realityEditor.device.VirtualCamera(cameraNode, 1, 0.001, 10, INITIAL_CAMERA_POSITION, floorOffset);

        // set rotateCenterElementId parent as groundPlaneNode to make the coord space of rotateCenterElementId the same as virtual camera and threejsContainerObj
        rotateCenterElementId = realityEditor.sceneGraph.addVisualElement('rotateCenter', parentNode, undefined, virtualCamera.getFocusTargetCubeMatrix());

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
                knownInteractionStates.pan = false; // stop panning if you start rotating
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

        virtualCamera.onStopFollowing(() => {
            currentlyFollowingId = null;
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

        if (ENABLE_LEGACY_UNITY_VIRTUALIZER) {
            let invertedCoordinatesNodeId = realityEditor.sceneGraph.addVisualElement('INVERTED_COORDINATES', undefined, undefined, [-1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
            let invertedCoordinatesNode = realityEditor.sceneGraph.getSceneNodeById(invertedCoordinatesNodeId);

            // the 1.1 should be a 1, but it's a bit off because the area target scan wasn't perfectly scanned with the same axes as the original calibrated model
            let rotatedCoordinatesNodeId = realityEditor.sceneGraph.addVisualElement('ROTATED_COORDINATES', invertedCoordinatesNode, undefined, makeGroundPlaneRotationY(Math.PI * 1.1));
            let rotatedCoordinatesNode = realityEditor.sceneGraph.getSceneNodeById(rotatedCoordinatesNodeId);

            // let unityCameraNodeId = realityEditor.sceneGraph.addVisualElement('UNITY_CAMERA', invertedCoordinatesNode);
            let unityCameraNodeId = realityEditor.sceneGraph.addVisualElement('UNITY_CAMERA', rotatedCoordinatesNode);
            let unityCameraNode = realityEditor.sceneGraph.getSceneNodeById(unityCameraNodeId);
            unityCamera = new realityEditor.device.VirtualCamera(unityCameraNode, 1, 0.001, 10, INITIAL_CAMERA_POSITION, floorOffset);
        }

        onFrame();

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
            if (unityCamera) {
                unityCamera.reset();
            }
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
            if (unityCamera) {
                unityCamera.idleOrbitting = value;
            }
        });

        realityEditor.gui.getMenuBar().addCallbackToItem(realityEditor.gui.ITEM.StopFollowing, () => {
            virtualCamera.stopFollowing();
            if (unityCamera) {
                unityCamera.stopFollowing();
            }
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

        const keyboard = new realityEditor.device.KeyboardListener();

        // Setup Save/Load Camera Position System
        // Allows for quickly jumping between different camera positions
        let getSavedCameraDataLocalStorageKey = (index) => `savedCameraData${index}-${realityEditor.sceneGraph.getWorldId()}`;
        
        const saveCameraData = (index) => {
            const cameraPosition = [...virtualCamera.position];
            const cameraDirection = virtualCamera.getCameraDirection();
            const cameraData = { cameraPosition, cameraDirection };
            const cameraDataJsonString = JSON.stringify(cameraData);
            localStorage.setItem(getSavedCameraDataLocalStorageKey(index), cameraDataJsonString);
        }
        
        const loadCameraData = (index) => {
            const cameraDataJsonString = localStorage.getItem(getSavedCameraDataLocalStorageKey(index));
            if (!cameraDataJsonString) {
                return;
            }
            try {
                const cameraData = JSON.parse(cameraDataJsonString);
                virtualCamera.position = [...cameraData.cameraPosition];
                virtualCamera.setCameraDirection(cameraData.cameraDirection);
                return cameraData;
            } catch (e) {
                console.warn('Error parsing saved camera position data', e);
            }
        }
        
        // Only one gets a menu item to avoid crowding, but they all get a shortcut key
        const saveCameraPositionMenuItem = new realityEditor.gui.MenuItem('Save Camera Position', { shortcutKey: '_1', modifiers: ['ALT'], toggle: false, disabled: false }, () => {
            saveCameraData(0);
        });
        const loadCameraPositionMenuItem = new realityEditor.gui.MenuItem('Load Camera Position', { shortcutKey: '_1', modifiers: ['SHIFT'], toggle: false, disabled: false }, () => {
            loadCameraData(0);
        });
        realityEditor.gui.getMenuBar().addItemToMenu(realityEditor.gui.MENU.Camera, saveCameraPositionMenuItem);
        realityEditor.gui.getMenuBar().addItemToMenu(realityEditor.gui.MENU.Camera, loadCameraPositionMenuItem);
        [2,3,4,5,6,7,8,9,0].forEach(key => {
            // Would be nice to deduplicate some of this logic, shared with MenuBar and MenuItem
            keyboard.onKeyDown((code, activeModifiers) => {
                if (realityEditor.device.keyboardEvents.isKeyboardActive()) { return; } // ignore if a tool is using the keyboard
                const modifierSetsMatch = (modifierSet1, modifierSet2) => {
                    return modifierSet1.length === modifierSet2.length && modifierSet1.every(value => modifierSet2.includes(value));
                };
                if (code === keyboard.keyCodes[`_${key}`] && modifierSetsMatch([keyboard.keyCodes['ALT']], activeModifiers)) {
                    saveCameraData(key - 1);
                }
                if (code === keyboard.keyCodes[`_${key}`] && modifierSetsMatch([keyboard.keyCodes['SHIFT']], activeModifiers)) {
                    loadCameraData(key - 1);
                }
            })
        });

        // Setup Following Menu
        perspectives.forEach(info => {
            const followItem = new realityEditor.gui.MenuItem(info.menuBarName, { shortcutKey: info.keyboardShortcut, toggle: false, disabled: true }, () => {
                currentFollowIndex = lastFollowingIndex; // resumes following the previously followed camera. defaults to 0
                let followTarget = chooseFollowTarget(currentFollowIndex);
                if (!followTarget) {
                    console.warn('Can\'t find a virtualizer to follow');
                    return;
                }

                followVirtualizer(followTarget.id, followTarget.sceneNode, info.distanceToCamera, info.render2DVideo);
            });
            realityEditor.gui.getMenuBar().addItemToMenu(realityEditor.gui.MENU.Camera, followItem);
        });

        // TODO: enable (or add) this only if there are more than one virtualizers
        let changeTargetButtons = [
            { name: 'Follow Next Target', shortcutKey: 'RIGHT', dIndex: 1 },
            { name: 'Follow Previous Target', shortcutKey: 'LEFT',  dIndex: -1 }
        ];

        changeTargetButtons.forEach(itemInfo => {
            const item = new realityEditor.gui.MenuItem(itemInfo.name, { shortcutKey: itemInfo.shortcutKey, toggle: false, disabled: false }, () => {
                if (currentlyFollowingId === null) {
                    return; // can't swap targets if not following anything
                }

                let numVirtualizers = realityEditor.gui.ar.desktopRenderer.getCameraVisSceneNodes().length;
                currentFollowIndex = (currentFollowIndex + itemInfo.dIndex) % numVirtualizers;
                if (currentFollowIndex < 0) {
                    currentFollowIndex += numVirtualizers;
                }

                let followTarget = chooseFollowTarget(currentFollowIndex);
                if (!followTarget) {
                    console.warn('Can\'t find a virtualizer to follow');
                    return;
                }
                followVirtualizer(followTarget.id, followTarget.sceneNode);
                lastFollowingIndex = currentFollowIndex;
            });
            realityEditor.gui.getMenuBar().addItemToMenu(realityEditor.gui.MENU.Camera, item);
        });
    }

    // based on the index you pass in, it will retrieve the virtualizer camera at that index
    function chooseFollowTarget(index) {
        let virtualizerSceneNodes = realityEditor.gui.ar.desktopRenderer.getCameraVisSceneNodes();
        if (virtualizerSceneNodes.length === 0) { return null; }
        index = Math.min(index, virtualizerSceneNodes.length - 1);
        const thisVirtualizerId = parseInt(virtualizerSceneNodes[index].id.match(/\d+/)[0]); // TODO: extract this in a less fragile way
        return {
            id: thisVirtualizerId,
            sceneNode: virtualizerSceneNodes[index]
        };
    }

    // initialDistance is optional – if included, it will change the camera distance, if not it will keep it the same
    // shouldRender2D is optional – if included, it will either start or stop the first-person renderer, if not it will keep it the same
    function followVirtualizer(virtualizerId, virtualizerSceneNode, initialDistance, shouldRender2D) {
        let wasFollowingIn2D = false;
        if (currentlyFollowingId) {
            wasFollowingIn2D = realityEditor.gui.ar.desktopRenderer.getVirtualizers2DRenderingState()[currentlyFollowingId];
        }

        virtualCamera.follow(virtualizerSceneNode, virtualizerId, initialDistance, shouldRender2D);
        if (unityCamera) {
            unityCamera.follow(virtualizerSceneNode, virtualizerId, initialDistance, shouldRender2D);
        }

        if (shouldRender2D) { // change to flat shader
            realityEditor.gui.ar.desktopRenderer.showCameraCanvas(virtualizerId);
        } else if (shouldRender2D === false) { // change to 3d shader
            realityEditor.gui.ar.desktopRenderer.hideCameraCanvas(virtualizerId);
        } else {
            if (wasFollowingIn2D) { // if old follow target was using flat shader, new should use it too
                realityEditor.gui.ar.desktopRenderer.hideCameraCanvas(currentlyFollowingId);
                realityEditor.gui.ar.desktopRenderer.showCameraCanvas(virtualizerId);
            }
        }

        currentlyFollowingId = virtualizerId;
    }

    function addSensitivitySlidersToMenu() {
        // add sliders for strafe, rotate, and zoom sensitivity
        realityEditor.gui.settings.addSlider('Zoom Sensitivity', 'how fast scroll wheel zooms camera', 'cameraZoomSensitivity',  '../../../svg/cameraZoom.svg', 0.5, function(newValue) {
            if (DEBUG) {
                console.log('zoom value = ' + newValue);
            }
        });

        realityEditor.gui.settings.addSlider('Pan Sensitivity', 'how fast keybord pans camera', 'cameraPanSensitivity',  '../../../svg/cameraPan.svg', 0.5, function(newValue) {
            if (DEBUG) {
                console.log('pan value = ' + newValue);
            }
        });

        realityEditor.gui.settings.addSlider('Rotate Sensitivity', 'how fast right-click dragging rotates camera', 'cameraRotateSensitivity',  '../../../svg/cameraRotate.svg', 0.5, function(newValue) {
            if (DEBUG) {
                console.log('rotate value = ' + newValue);
            }
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
        if (cameraTargetIcon) {
            cameraTargetIcon.visible = knownInteractionStates.pan || knownInteractionStates.rotate || knownInteractionStates.scale;
        }
        updateInteractionCursor(cameraTargetIcon.visible, '/addons/vuforia-spatial-remote-operator-addon/cameraPan.svg');
    }
    function rotateToggled() {
        if (cameraTargetIcon) {
            cameraTargetIcon.visible = knownInteractionStates.rotate || knownInteractionStates.pan || knownInteractionStates.scale;
        }
        updateInteractionCursor(cameraTargetIcon.visible, '/addons/vuforia-spatial-remote-operator-addon/cameraRotate.svg');
    }
    function scaleToggled() {
        if (cameraTargetIcon) {
            cameraTargetIcon.visible = knownInteractionStates.scale || knownInteractionStates.pan || knownInteractionStates.rotate;
        }
        // if (!cameraTargetIcon.visible) {
        //     updateInteractionCursor(false);
        // }
        updateInteractionCursor(cameraTargetIcon.visible, '/addons/vuforia-spatial-remote-operator-addon/cameraZoom.svg');
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

    /**
     * Update loop governed by requestAnimationFrame
     */
    function onFrame() {
        update(false);
        requestAnimationFrame(onFrame);
    }
    /**
     * Main update function
     * @param forceCameraUpdate - Whether this update forces virtualCamera to
     * update even if it's in 2d (locked follow) mode
     */
    function update(forceCameraUpdate) {
        if (virtualCamera) {
            try {
                if (forceCameraUpdate || !virtualCamera.isRendering2DVideo()) {
                    virtualCamera.update();
                }

                let worldObject = realityEditor.worldObjects.getBestWorldObject();
                if (worldObject) {
                    let worldId = worldObject.objectId;

                    // render a cube at the virtual camera's target position
                    let sceneNode = realityEditor.sceneGraph.getSceneNodeById(rotateCenterElementId);
                    sceneNode.setLocalMatrix(virtualCamera.getFocusTargetCubeMatrix());

                    const THREE = realityEditor.gui.threejsScene.THREE;
                    if (!cameraTargetIcon && worldId !== realityEditor.worldObjects.getLocalWorldId()) {
                        cameraTargetIcon = {};
                        cameraTargetIcon.visible = false;
                    }

                    if (unityCamera) {
                        unityCamera.update();
                    }

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
    }

    exports.update = update;
    exports.initService = initService;
})(realityEditor.device.desktopCamera);
