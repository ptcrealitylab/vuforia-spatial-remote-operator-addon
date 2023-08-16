/*
* Copyright © 2018 PTC
*
* This Source Code Form is subject to the terms of the Mozilla Public
* License, v. 2.0. If a copy of the MPL was not distributed with this
* file, You can obtain one at http://mozilla.org/MPL/2.0/.
*/

createNameSpace('realityEditor.device.desktopCamera');

import { CameraFollowCoordinator } from './CameraFollowTarget.js';

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
    
    let storedFloorOffset = 0;

    // polyfill for requestAnimationFrame to provide a smooth update loop
    let requestAnimationFrame = window.requestAnimationFrame ||
        window.webkitRequestAnimationFrame || function(cb) {setTimeout(cb, 17);};
    let virtualCamera;

    let knownInteractionStates = {
        pan: false,
        rotate: false,
        scale: false
    };

    let staticInteractionCursor = null;
    let interactionCursor = null;
    let pointerPosition = { x: 0, y: 0 };
    let cameraTargetIcon = null;

    let followCoordinator = null;
    let currentlyFollowingId = null;

    // let videoPlaybackTargets = {};
    let videoPlayback = realityEditor.gui.ar.videoPlayback;

    // used for transitioning from AR view to remote operator virtual camera
    let didAddModeTransitionListeners = false;
    let virtualCameraEnabled = false;
    let cameraTransitionPosition_AR = null;
    let cameraTransitionTarget_AR = null;
    let cameraTransitionPosition_VR = null;
    let cameraTransitionTarget_VR = null;

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
        
        storedFloorOffset = floorOffset;

        addModeTransitionListeners();

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

        // TODO: this is an experiment for the analytics
        let analyticsCameraGroupContainerId = realityEditor.sceneGraph.addVisualElement('AnalyticsCameraGroupContainer', parentNode);
        let analyticsCameraGroupContainer = realityEditor.sceneGraph.getSceneNodeById(analyticsCameraGroupContainerId);
        transformationMatrix = makeGroundPlaneRotationX(Math.PI / 2);
        transformationMatrix[13] = -floorOffset; // ground plane translation
        analyticsCameraGroupContainer.setLocalMatrix(transformationMatrix);

        let cameraNode = realityEditor.sceneGraph.getSceneNodeById('CAMERA');
        virtualCamera = new realityEditor.device.VirtualCamera(cameraNode, 1, 0.001, 10, INITIAL_CAMERA_POSITION, floorOffset);
        virtualCameraEnabled = true;

        followCoordinator = new CameraFollowCoordinator(virtualCamera);
        window.followCoordinator = followCoordinator;
        followCoordinator.addMenuItems();
        console.log(followCoordinator);
        
        function addCameraVisCallbacks() {
            let cameraVisCoordinator = realityEditor.gui.ar.desktopRenderer.getCameraVisCoordinator();
            if (!cameraVisCoordinator) {
                console.log('addCameraVisCallbacks failed');
                setTimeout(addCameraVisCallbacks, 100);
                return;
            }
            console.log('addCameraVisCallbacks succeeded');
            cameraVisCoordinator.onCameraVisCreated(cameraVis => {
                let displayName = `Live Video ${cameraVis.id}`;
                followCoordinator.addFollowTarget(cameraVis.id, displayName, cameraVis.mesh, cameraVis.sceneGraphNode, cameraVis);
            });
            cameraVisCoordinator.onCameraVisRemoved(cameraVis => {
                followCoordinator.removeFollowTarget(cameraVis.id);
            });
        }
        addCameraVisCallbacks();

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

        onFrame();

        // disable right-click context menu so we can use right-click to rotate camera
        document.addEventListener('contextmenu', event => event.preventDefault());

        try {
            addSensitivitySlidersToMenu();
        } catch (e) {
            console.warn('Slider components for settings menu not available, skipping', e);
        }

        realityEditor.gui.getMenuBar().addCallbackToItem(realityEditor.gui.ITEM.ResetCameraPosition, () => {
            console.log('reset camera position');
            virtualCamera.reset();
        });

        realityEditor.gui.getMenuBar().addCallbackToItem(realityEditor.gui.ITEM.OrbitCamera, (value) => {
            virtualCamera.idleOrbitting = value;
        });

        realityEditor.gui.getMenuBar().addCallbackToItem(realityEditor.gui.ITEM.StopFollowing, () => {
            virtualCamera.stopFollowing();
        });
        
        const videoRecordingNumberMap = {};
        let videoRecordingCount = 1;

        videoPlayback.onVideoCreated(player => {
            console.log('onVideoCreated', player.id, player);
            
            if (typeof videoRecordingNumberMap[player.id] === 'undefined') {
                videoRecordingNumberMap[player.id] = videoRecordingCount;
                videoRecordingCount++;
            }

            let parentNode = realityEditor.sceneGraph.getVisualElement('CameraGroupContainer');
            let sceneGraphNodeId = realityEditor.sceneGraph.addVisualElement('CameraPlaybackNode' + player.id, parentNode);
            let sceneNode = realityEditor.sceneGraph.getSceneNodeById(sceneGraphNodeId);
            let displayName = `Video Recording ${videoRecordingNumberMap[player.id]}`;
            // player.pointCloud is undefined here, so we add it in when the video starts playing
            followCoordinator.addFollowTarget(player.id, displayName, player.pointCloud, sceneNode, player);
        });
        videoPlayback.onVideoDisposed(id => {
            console.log('onVideoDisposed', id);
            followCoordinator.removeFollowTarget(id);
        });
        videoPlayback.onVideoPlayed(player => {
            if (followCoordinator.followTargets[player.id] && player.pointCloud) {
                followCoordinator.followTargets[player.id].pointCloudMesh = player.pointCloud;
            }
            console.log('onVideoPlayed', player.id, player);
        });
        videoPlayback.onVideoPaused(player => {
            console.log('onVideoPaused', player.id, player);
        });

        realityEditor.network.addPostMessageHandler('analyticsOpen', (msgData) => {
            let displayName = 'Analytics';
            // let parentNode = realityEditor.sceneGraph.getVisualElement('CameraGroupContainer');
            // let parentNode = realityEditor.sceneGraph.getGroundPlaneNode();

            let parentNode = realityEditor.sceneGraph.getVisualElement('AnalyticsCameraGroupContainer');
            // let parentNode = realityEditor.sceneGraph.getVisualElement('UntransformedCameraGroupContainer');
            let sceneGraphNodeId = realityEditor.sceneGraph.addVisualElement('AnalyticsNode' + msgData.frame, parentNode);
            let sceneNode = realityEditor.sceneGraph.getSceneNodeById(sceneGraphNodeId);
            
            let pointCloudMesh = null;
            let firstPersonEnabler = null;
            
            followCoordinator.addFollowTarget(msgData.frame, displayName, pointCloudMesh, sceneNode, firstPersonEnabler);

            // if (!analyticsByFrame[msgData.frame]) {
            //     analyticsByFrame[msgData.frame] = makeAnalytics(msgData.frame);
            // }
            // activeFrame = msgData.frame;
            // analyticsByFrame[msgData.frame].open();
            // realityEditor.app.enableHumanTracking();
        });

        realityEditor.network.addPostMessageHandler('analyticsClose', (msgData) => {
            // if (!analyticsByFrame[msgData.frame]) {
            //     return;
            // }
            // analyticsByFrame[msgData.frame].close();
            // if (activeFrame === msgData.frame) {
            //     activeFrame = noneFrame;
            // }

            followCoordinator.removeFollowTarget(msgData.frame);
        });
        //
        // realityEditor.network.addPostMessageHandler('analyticsFocus', (msgData) => {
        //     if (!analyticsByFrame[msgData.frame]) {
        //         analyticsByFrame[msgData.frame] = makeAnalytics(msgData.frame);
        //     }
        //     if (activeFrame !== msgData.frame) {
        //         const activeAnalytics = getActiveAnalytics();
        //         if (activeAnalytics !== realityEditor.analytics.getDefaultAnalytics()) {
        //             activeAnalytics.blur(); // Default analytics should only lose 2D UI manually via menu bar
        //         }
        //     }
        //     activeFrame = msgData.frame;
        //     analyticsByFrame[msgData.frame].focus();
        // });
        //
        // realityEditor.network.addPostMessageHandler('analyticsBlur', (msgData) => {
        //     if (!analyticsByFrame[msgData.frame]) {
        //         return;
        //     }
        //     analyticsByFrame[msgData.frame].blur();
        //     if (activeFrame === msgData.frame) {
        //         activeFrame = noneFrame;
        //     }
        // });

        // realityEditor.gui.getMenuBar().addCallbackToItem(realityEditor.gui.ITEM.FollowVideo, () => {
        //     if (Object.values(videoPlaybackTargets).length > 0) {
        //         let thisVideoPlayer = Object.values(videoPlaybackTargets)[0].videoPlayer;
        //         let sceneGraphNode = realityEditor.sceneGraph.getVisualElement('CameraPlaybackNode' + thisVideoPlayer.id);
        //         if (!sceneGraphNode) {
        //             let parentNode = realityEditor.sceneGraph.getVisualElement('CameraGroupContainer');
        //             let sceneGraphNodeId = realityEditor.sceneGraph.addVisualElement('CameraPlaybackNode' + thisVideoPlayer.id, parentNode);
        //             sceneGraphNode = realityEditor.sceneGraph.getSceneNodeById(sceneGraphNodeId);
        //         }
        //         sceneGraphNode.setLocalMatrix(thisVideoPlayer.phone.matrix.elements);
        //         followVirtualizer(thisVideoPlayer.id, sceneGraphNode, 3000, false);
        //         thisVideoPlayer.enableFirstPersonMode();
        //     }
        // });

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

    function addSensitivitySlidersToMenu() {
        // add sliders for strafe, rotate, and zoom sensitivity
        realityEditor.gui.settings.addSlider('Zoom Sensitivity', 'how fast scroll wheel zooms camera', 'cameraZoomSensitivity',  '../../../svg/cameraZoom.svg', 0.5, function(newValue) {
            if (DEBUG) {
                console.log('zoom value = ' + newValue);
            }
        });

        realityEditor.gui.settings.addSlider('Pan Sensitivity', 'how fast keyboard pans camera', 'cameraPanSensitivity',  '../../../svg/cameraPan.svg', 0.5, function(newValue) {
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

    function panToggled() {
        if (!cameraTargetIcon) return;
        cameraTargetIcon.visible = knownInteractionStates.pan || knownInteractionStates.rotate || knownInteractionStates.scale;
        updateInteractionCursor(cameraTargetIcon.visible, 'addons/vuforia-spatial-remote-operator-addon/cameraPan.svg');
    }
    function rotateToggled() {
        if (!cameraTargetIcon) return;
        cameraTargetIcon.visible = knownInteractionStates.rotate || knownInteractionStates.pan || knownInteractionStates.scale;
        updateInteractionCursor(cameraTargetIcon.visible, 'addons/vuforia-spatial-remote-operator-addon/cameraRotate.svg');
    }
    function scaleToggled() {
        if (!cameraTargetIcon) return;
        cameraTargetIcon.visible = knownInteractionStates.scale || knownInteractionStates.pan || knownInteractionStates.rotate;
        // if (!cameraTargetIcon.visible) {
        //     updateInteractionCursor(false);
        // }
        updateInteractionCursor(cameraTargetIcon.visible, 'addons/vuforia-spatial-remote-operator-addon/cameraZoom.svg');
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
     * Move the sceneNode associated with the videoPlayback to match its three.js object's position
     */
    function updateFollowVideoPlayback() {
        if (!followCoordinator) return;
        Object.values(followCoordinator.followTargets).forEach(followTarget => {
            if (followTarget.sceneNode && followTarget.pointCloudMesh) {
                followTarget.sceneNode.setLocalMatrix(followTarget.pointCloudMesh.parent.matrix.elements);
            } else {
                let matchingAnalytics = realityEditor.analytics.getAnalyticsByFrame(followTarget.id);
                if (!matchingAnalytics) return;
                // console.log(matchingAnalytics.humanPoseAnalyzer.lastDisplayedClones);
                if (matchingAnalytics.humanPoseAnalyzer.lastDisplayedClones.length === 0) return;
                // TODO: for now we're following the first person detected in that timestamp, but if we support tracking multiple people at once then this might not work
                let joints = matchingAnalytics.humanPoseAnalyzer.lastDisplayedClones[0].pose.joints;
                let THREE = realityEditor.gui.threejsScene.THREE;
                let headPosition = joints.head.position;
                let neckPosition = joints.neck.position;
                let leftShoulderPosition = joints.left_shoulder.position;

                const neckToHeadVector = new THREE.Vector3().subVectors(headPosition, neckPosition).normalize();
                const neckToShoulderVector = new THREE.Vector3().subVectors(leftShoulderPosition, neckPosition).normalize();
                const neckRotationAxis = new THREE.Vector3().crossVectors(neckToHeadVector, neckToShoulderVector).normalize();
                // Calculate the angle between the neck-to-head and neck-to-shoulder vectors
                // const angle = Math.PI / 2; // neckToHeadVector.angleTo(neckToShoulderVector); //
                // const quaternion = new THREE.Quaternion().setFromAxisAngle(neckRotationAxis, angle);
                // const scale = new THREE.Vector3(1, 1, 1); // Assuming no scaling is needed
                // const finalMatrix = new THREE.Matrix4().compose(headPosition, quaternion, scale);

                // let finalMatrix = new THREE.Matrix4().setPosition(headPosition.x, -headPosition.z, -headPosition.y);
                let finalMatrix = new THREE.Matrix4().setPosition(neckPosition.x, neckPosition.y + storedFloorOffset, neckPosition.z);

                const neckRotationMatrix = new THREE.Matrix4().lookAt(new THREE.Vector3(0, 0, 0), neckRotationAxis, neckToHeadVector);

                finalMatrix.multiplyMatrices(finalMatrix, neckRotationMatrix);
                
                followTarget.sceneNode.setLocalMatrix(finalMatrix.elements);
                // followTarget.sceneNode.setPositionRelativeTo(realityEditor.sceneGraph.getSceneNodeById(realityEditor.sceneGraph.NAMES.ROOT), finalMatrix.elements);

                /*
                const neckToHeadVector = new THREE.Vector3().subVectors(headPosition, neckPosition).normalize();
                const neckToShoulderVector = new THREE.Vector3().subVectors(leftShoulderPosition, neckPosition).normalize();

                const neckRotationAxis = new THREE.Vector3().crossVectors(neckToHeadVector, neckToShoulderVector).normalize();
                // const neckRotationAngle = 0; //neckToHeadVector.angleTo(neckToShoulderVector);

                // Calculate the angle between the neck-to-head and neck-to-shoulder vectors
                const angle = Math.PI / 2; // neckToHeadVector.angleTo(neckToShoulderVector);

// Create a quaternion using the rotation axis and angle
                const quaternion = new THREE.Quaternion().setFromAxisAngle(neckRotationAxis, angle);

// Compose the quaternion with the head position to create a transformation matrix
//                 const scale = new THREE.Vector3(1, 1, 1); // Assuming no scaling is needed
                // const matrix = new THREE.Matrix4().compose(headPosition, quaternion, scale);


                // const neckRotationMatrix = new THREE.Matrix4().makeRotationAxis(neckRotationAxis, neckRotationAngle);
                // // neckPosition.clone().normalize()
                const neckRotationMatrix = new THREE.Matrix4().lookAt(new THREE.Vector3(0, 0, 0), neckRotationAxis, neckToHeadVector);
                // neckRotationMatrix.setPosition(0, 0, 0);

                // Calculate the forward direction (opposite of the neck-to-head vector)
                const forwardDirection = neckToHeadVector.clone().negate().normalize();

// Calculate the up direction (cross product of forward and neck-to-shoulder)
                const upDirection = new THREE.Vector3(0, 1, 0); //neckToShoulderVector.clone().cross(forwardDirection).normalize();

// Calculate the right direction (cross product of up and forward)
                const rightDirection = upDirection.clone().cross(forwardDirection).normalize();

// Create a rotation matrix using these basis vectors
//                 const neckRotationMatrix = new THREE.Matrix4().makeBasis(rightDirection, upDirection, forwardDirection);

                // Convert the rotation matrix to a quaternion
                const neckRotationQuaternion = new THREE.Quaternion().setFromRotationMatrix(neckRotationMatrix);

// Compose the transformation matrix using the head position and the rotation quaternion
                const scale = new THREE.Vector3(1, 1, 1); // Assuming no scaling is needed
                const transformationMatrix = new THREE.Matrix4().compose(headPosition, neckRotationQuaternion, scale);

                
                const headMatrix = new THREE.Matrix4();
                headMatrix.setPosition(headPosition);
                
                let offsetMatrix = matchingAnalytics.humanPoseAnalyzer.lastDisplayedClones[0].renderer.jointsMesh.matrixWorld;
                
                headMatrix.multiplyMatrices(offsetMatrix, headMatrix);

                const finalMatrix = new THREE.Matrix4().compose(headPosition, quaternion, scale);
                
                // matchingAnalytics.humanPoseAnalyzer.lastDisplayedClones[0].renderer.jointsMesh.matrixWorld

                headMatrix.multiplyMatrices(neckRotationMatrix, headMatrix);

                // let newHeadPosition = new THREE.Vector3(headPosition.x, headPosition.y, headPosition.z);
                headMatrix.setPosition(headPosition);
                
                // let head_neck = neckPosition.sub(headPosition).normalize();
                // let shoulder_neck = leftShoulderPosition.sub(neckPosition).normalize();
                // let forwardVector = head_neck.cross(shoulder_neck).normalize();

                let unrotatedHeadMatrix = new THREE.Matrix4().setPosition(headPosition.x, headPosition.y, headPosition.z);
                
                let invertedCoordinateSystemMatrix = new THREE.Matrix4();
                invertedCoordinateSystemMatrix.makeRotationAxis(new THREE.Vector3(1, 0, 0), Math.PI / 2);
                
                let floorOffsetMatrix = new THREE.Matrix4().setPosition(0, -storedFloorOffset, 0);
                unrotatedHeadMatrix.multiplyMatrices(invertedCoordinateSystemMatrix, unrotatedHeadMatrix);
                unrotatedHeadMatrix.multiplyMatrices(floorOffsetMatrix, unrotatedHeadMatrix);

                // TODO: apply inverse of this, because the follower is added to the rotated/positioned container
                // this.threeJsContainer = new THREE.Group();
                // this.threeJsContainer.name = 'VirtualCamera_' + cameraNode.id + '_threeJsContainer';
                // this.threeJsContainer.position.y = -floorOffset;
                // this.threeJsContainer.rotation.x = Math.PI / 2;
                // realityEditor.gui.threejsScene.addToScene(this.threeJsContainer);
                
                // TODO: none of these methods are working
                //   --> 1) make a diagram of where the stabilized follow container is in the scene hierarchy
                //   --> 2) make a diagram of where the followTarget sceneNode is in the scene hierarchy
                //   --> 2) make a diagram of where the headPosition is in the scene hierarchy
                //   --> 3) figure out how to transform headPosition from followTarget sceneNode to stabilizedContainer coord system

                // followTarget.sceneNode.setLocalMatrix(unrotatedHeadMatrix.elements);
                let groundPlaneNode = realityEditor.sceneGraph.getGroundPlaneNode();
                followTarget.sceneNode.setPositionRelativeTo(groundPlaneNode, unrotatedHeadMatrix.elements);
                
                // followTarget.sceneNode.setLocalMatrix([
                //     1, 0, 0, 0,
                //     0, 1, 0, 0,
                //     0, 0, 1, 0,
                //     headPosition.x, headPosition.y, headPosition.z, 1
                // ]);
                 */
            }
        });
    }
    
    /**
     * Main update function
     * @param forceCameraUpdate - Whether this update forces virtualCamera to
     * update even if it's in 2d (locked follow) mode
     */
    function update(forceCameraUpdate) {
        if (virtualCamera && virtualCameraEnabled) {
            try {
                updateFollowVideoPlayback();
                
                // if (forceCameraUpdate) { // || !virtualCamera.isRendering2DVideo()) {
                    virtualCamera.update();
                // }

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

    let transitionPercent = -1;
    
    // these only affect the camera when you load the remote operator view in the AR app, not in the browser
    function addModeTransitionListeners() {
        if (didAddModeTransitionListeners) return;
        didAddModeTransitionListeners = true;

        // move the camera based on the combination of the transitionPercent and the transition endpoint positions
        const processDevicePosition = () => {
            if (transitionPercent <= 0 || transitionPercent === 1) {
                virtualCamera.zoomOutTransition = false;
                return;
            }
            if (!cameraTransitionPosition_AR || !cameraTransitionTarget_AR ||
                !cameraTransitionPosition_VR || !cameraTransitionTarget_VR) return;

            // only starts moving after the first 5% of the pinch gesture / slider
            let percent = Math.max(0, Math.min(1, (transitionPercent - 0.1) / 0.9));

            let groundPlaneNode = realityEditor.sceneGraph.getGroundPlaneNode();

            virtualCamera.position = [
                (1.0 - percent) * cameraTransitionPosition_AR[0] + percent * cameraTransitionPosition_VR[0],
                (1.0 - percent) * cameraTransitionPosition_AR[1] + percent * cameraTransitionPosition_VR[1],
                (1.0 - percent) * cameraTransitionPosition_AR[2] + percent * cameraTransitionPosition_VR[2]
            ];
            virtualCamera.position[1] -= groundPlaneNode.worldMatrix[13]; // TODO: this works but spatial cursor ends up in weird positions

            virtualCamera.targetPosition = [
                (1.0 - percent) * cameraTransitionTarget_AR[0] + percent * cameraTransitionTarget_VR[0],
                (1.0 - percent) * cameraTransitionTarget_AR[1] + percent * cameraTransitionTarget_VR[1],
                (1.0 - percent) * cameraTransitionTarget_AR[2] + percent * cameraTransitionTarget_VR[2]
            ];
            virtualCamera.targetPosition[1] -= groundPlaneNode.worldMatrix[13]; // TODO: this works but spatial cursor ends up in weird positions

            virtualCamera.zoomOutTransition = percent !== 0 && percent !== 1;
        }

        // when the slider or pinch gesture updates, move the virtual camera based on the transition endpoints
        realityEditor.device.modeTransition.onTransitionPercent((percent) => {
            transitionPercent = percent;
            if (!virtualCamera) return; // wait for virtual camera to initialize
            virtualCamera.pauseTouchGestures = percent < 1;
            processDevicePosition();
        });

        // when the device itself moves, update the transition endpoints
        realityEditor.device.modeTransition.onDeviceCameraPosition((_cameraMatrix) => {
            let deviceNode = realityEditor.sceneGraph.getDeviceNode();
            let worldNode = realityEditor.sceneGraph.getSceneNodeById(realityEditor.sceneGraph.getWorldId());
            let position = realityEditor.sceneGraph.convertToNewCoordSystem([0, 0, 0], deviceNode, worldNode);

            // get the current camera target position, so we maintain the same perspective when we turn on the scene
            // defaults the target position to 1 meter in front of the camera
            let targetPositionObj = realityEditor.sceneGraph.getPointAtDistanceFromCamera(window.innerWidth/2, window.innerHeight/2, 1000, worldNode, deviceNode);
            let targetPosition = [targetPositionObj.x, targetPositionObj.y, targetPositionObj.z];

            if (position) {
                cameraTransitionPosition_AR = [...position];
            }
            if (targetPosition) {
                cameraTransitionTarget_AR = [...targetPosition];
                cameraTransitionTarget_VR = [...targetPosition];
            }
            cameraTransitionPosition_VR = virtualCamera.getRelativePosition(cameraTransitionPosition_AR, cameraTransitionTarget_AR, 0, 3000, 8000);

            if (transitionPercent === 1) {
                cameraTransitionTarget_VR = [...virtualCamera.targetPosition];
                cameraTransitionPosition_VR = [...virtualCamera.position];
            }

            processDevicePosition();
        });
        
        // move the virtual camera to a good starting position when the remote operator first loads in the AR app
        // TODO: there's some redundant code in here that should be removed and rely on onDeviceCameraPosition instead
        realityEditor.device.modeTransition.onRemoteOperatorShown(() => {
            if (virtualCameraEnabled) return; // don't do this multiple times per transition
            virtualCameraEnabled = true;
            if (!virtualCamera) return;

            // get the current camera position
            let cameraNode = realityEditor.sceneGraph.getCameraNode();
            let deviceNode = realityEditor.sceneGraph.getDeviceNode();
            let groundPlaneNode = realityEditor.sceneGraph.getGroundPlaneNode();
            let position = realityEditor.sceneGraph.convertToNewCoordSystem([0, 0, 0], cameraNode, groundPlaneNode);

            // get the current camera target position, so we maintain the same perspective when we turn on the scene
            // defaults the target position to 1 meter in front of the camera
            let targetPositionObj = realityEditor.sceneGraph.getPointAtDistanceFromCamera(window.innerWidth/2, window.innerHeight/2, 1000, groundPlaneNode, deviceNode);
            let targetPosition = [targetPositionObj.x, targetPositionObj.y, targetPositionObj.z];

            if (position) {
                cameraTransitionPosition_AR = [...position];
                virtualCamera.position = [...position];
            }
            if (targetPosition) {
                cameraTransitionTarget_AR = [...targetPosition];
                virtualCamera.targetPosition = [...targetPosition];
            }

            // calculate the end position of the transition, and assign to the _VR variables
            cameraTransitionPosition_VR = virtualCamera.getRelativePosition(cameraTransitionPosition_AR, cameraTransitionTarget_AR, 0, 3000, 8000);
            cameraTransitionTarget_VR = [...targetPosition]; // where you're looking doesn't change

            if (virtualCamera.focusTargetCube) {
                virtualCamera.focusTargetCube.position.copy({
                    x: targetPosition[0],
                    y: targetPosition[1],
                    z: targetPosition[2]
                });
                virtualCamera.mouseInput.lastWorldPos = [...targetPosition];
            }

            virtualCamera.zoomOutTransition = true;

            // force it to update
            virtualCamera.update();
        });
        realityEditor.device.modeTransition.onRemoteOperatorHidden(() => {
            virtualCameraEnabled = false;
            virtualCamera.zoomOutTransition = false;
            cameraTransitionPosition_AR = null;
            cameraTransitionTarget_AR = null;
            cameraTransitionPosition_VR = null;
            cameraTransitionTarget_VR = null;
        });
    }

    exports.update = update;
    exports.initService = initService;
})(realityEditor.device.desktopCamera);
