/*
* Copyright © 2018 PTC
*
* This Source Code Form is subject to the terms of the Mozilla Public
* License, v. 2.0. If a copy of the MPL was not distributed with this
* file, You can obtain one at http://mozilla.org/MPL/2.0/.
*/

createNameSpace('realityEditor.device.desktopCamera');

import { Vector3 } from '../../thirdPartyCode/three/three.module.js';
import { CameraFollowCoordinator } from './CameraFollowCoordinator.js';
import { MotionStudyFollowable } from './MotionStudyFollowable.js';
import { TouchControlButtons } from './TouchControlButtons.js';
import { CameraPositionMemoryBar } from './CameraPositionMemoryBar.js';

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

    // used for transitioning from AR view to remote operator virtual camera
    let didAddModeTransitionListeners = false;
    let virtualCameraEnabled = false;
    let cameraTransitionPosition_AR = null;
    let cameraTransitionTarget_AR = null;
    let cameraTransitionPosition_VR = null;
    let cameraTransitionTarget_VR = null;

    // on touchscreen VR mode devices, these let us toggle between camera controls and pointer
    let touchControlButtons = null;

    let motionStudyFollowables = {};

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

        addModeTransitionListeners();

        if (realityEditor.device.environment.isARMode()) { return; }

        if (!realityEditor.sceneGraph.getSceneNodeById('CAMERA')) { // reload after camera has been created
            setTimeout(function() {
                initService(floorOffset);
            }, 100);
            return;
        }

        let parentNode = realityEditor.sceneGraph.getGroundPlaneNode();

        let cameraNode = realityEditor.sceneGraph.getSceneNodeById('CAMERA');
        virtualCamera = new realityEditor.device.VirtualCamera(cameraNode, 1, 0.001, 10, INITIAL_CAMERA_POSITION, floorOffset);
        virtualCameraEnabled = true;

        followCoordinator = new CameraFollowCoordinator(virtualCamera);
        window.followCoordinator = followCoordinator;
        followCoordinator.addMenuItems();

        // ---- Add and remove follow targets when virtualizers connect ---- //

        function addCameraVisCallbacks() {
            let cameraVisCoordinator = realityEditor.gui.ar.desktopRenderer.getCameraVisCoordinator();
            if (!cameraVisCoordinator) {
                setTimeout(addCameraVisCallbacks, 100);
                return;
            }
            cameraVisCoordinator.onCameraVisCreated(cameraVis => {
                followCoordinator.addFollowTarget(cameraVis);
            });
            cameraVisCoordinator.onCameraVisRemoved(cameraVis => {
                followCoordinator.removeFollowTarget(cameraVis.id);
            });
        }
        addCameraVisCallbacks();

        // set rotateCenterElementId parent as groundPlaneNode to make the coord space of rotateCenterElementId the same as virtual camera and threejsContainerObj
        rotateCenterElementId = realityEditor.sceneGraph.addVisualElement('rotateCenter', parentNode, undefined, virtualCamera.getFocusTargetCubeMatrix());

        virtualCamera.onPanToggled(function(isPanning) {
            if (virtualCamera.lockOnMode) {
                isPanning = false; // can't pan while locked onto another user's perspective
            }
            if (isPanning && !knownInteractionStates.pan) {
                knownInteractionStates.pan = true;
                panToggled();
            } else if (!isPanning && knownInteractionStates.pan) {
                knownInteractionStates.pan = false;
                panToggled();
            }
        });
        virtualCamera.onRotateToggled(function(isRotating) {
            if (virtualCamera.lockOnMode) {
                isRotating = false; // can't rotate while locked onto another user's perspective
            }
            if (isRotating && !knownInteractionStates.rotate) {
                knownInteractionStates.rotate = true;
                knownInteractionStates.pan = false; // stop panning if you start rotating
                rotateToggled();
            } else if (!isRotating && knownInteractionStates.rotate) {
                knownInteractionStates.rotate = false;
                rotateToggled();
            }
        });
        virtualCamera.onScaleToggled(function(isScaling) {
            if (virtualCamera.lockOnMode) {
                isScaling = false;
            }
            if (isScaling && !knownInteractionStates.scale) {
                knownInteractionStates.scale = true;
                scaleToggled();
            } else if (!isScaling && knownInteractionStates.scale) {
                knownInteractionStates.scale = false;
                scaleToggled();
            }
        });

        // virtualCamera.onStopFollowing(() => {
        //     currentlyFollowingId = null;
        // });

        interactionCursor = document.createElement('img');
        interactionCursor.id = 'interactionCursor';
        document.body.appendChild(interactionCursor);

        staticInteractionCursor = document.createElement('img');
        staticInteractionCursor.id = 'staticInteractionCursor';
        document.body.appendChild(staticInteractionCursor);

        // necessary to make the interactionCursor start at the right position on touchscreens
        document.addEventListener('pointerdown', (e) => {
            pointerPosition.x = e.clientX;
            pointerPosition.y = e.clientY;
        });

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

        setupTouchControlButtons();

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

        // ---- Add and remove follow targets when video players are created ---- //

        realityEditor.network.addPostMessageHandler('followCameraOnPlayback', (msgData) => {
            const cameraTargets = followCoordinator.followTargets;
            for (let cameraTarget in cameraTargets) {
                if (cameraTargets[cameraTarget].followable.frameKey === msgData.frame) {
                    followCoordinator.follow(cameraTargets[cameraTarget].id, msgData.distance);
                }
            }
        });

        realityEditor.network.addPostMessageHandler('stopFollowingCamera', (msgData) => {
            const cameraTargets = followCoordinator.followTargets;
            for (let cameraTarget in cameraTargets) {
                if (cameraTargets[cameraTarget].followable.frameKey === msgData.frame) {
                    followCoordinator.unfollow();
                }
            }
        });

        let videoPlayback = realityEditor.gui.ar.videoPlayback;
        videoPlayback.onVideoCreated(player => {
            followCoordinator.addFollowTarget(player);
        });
        videoPlayback.onVideoDisposed(id => {
            followCoordinator.removeFollowTarget(id);
        });
        // TODO: should we do anything when videos pause/resume?
        // videoPlayback.onVideoPlayed(_player => {
        //     console.log('onVideoPlayed', player.id, player);
        // });
        // videoPlayback.onVideoPaused(_player => {
        //     console.log('onVideoPaused', player.id, player);
        // });

        // ---- Add and remove follow targets when motion studies are opened ---- //

        realityEditor.network.addPostMessageHandler('analyticsOpen', (msgData) => {
            if (typeof motionStudyFollowables[msgData.frame] === 'undefined') {
                motionStudyFollowables[msgData.frame] = new MotionStudyFollowable(msgData.frame);
            }
            followCoordinator.addFollowTarget(motionStudyFollowables[msgData.frame]);
        });

        realityEditor.network.addPostMessageHandler('analyticsClose', (msgData) => {
            if (!motionStudyFollowables[msgData.frame]) return;
            followCoordinator.removeFollowTarget(motionStudyFollowables[msgData.frame].id);
        });

        const keyboard = new realityEditor.device.KeyboardListener();

        const getCameraPositionDirection = () => {
            const cameraPosition = [...virtualCamera.position];
            const cameraDirection = virtualCamera.getCameraDirection();
            return {
                position: cameraPosition,
                direction: cameraDirection,
            };
        };

        let memoryBar = null;
        // to save and load memories per world object, this need to happen after localization
        realityEditor.worldObjects.onLocalizedWithinWorld((objectKey) => {
            if (objectKey === realityEditor.worldObjects.getLocalWorldId()) return; // skip local world
            if (memoryBar) return; // only do this once

            memoryBar = new CameraPositionMemoryBar(objectKey, getCameraPositionDirection);

            memoryBar.onMemorySelected((position, direction) => {
                if (virtualCamera.lockOnMode) return;
                try {
                    virtualCamera.position = [...position];
                    virtualCamera.setCameraDirection(direction);
                } catch (e) {
                    console.warn('Error loading camera position', e);
                }
                const HIDE_AFTER_EACH_SELECTION = false;
                if (HIDE_AFTER_EACH_SELECTION) {
                    memoryBar.toggleVisibility(false);
                    if (toggleMemoryBarMenuItem.isToggled()) {
                        toggleMemoryBarMenuItem.switchToggle();
                    }
                }
            });

            memoryBar.onBarVisibilityToggledInternally((isVisible) => {
                if (toggleMemoryBarMenuItem.isToggled() !== isVisible) {
                    toggleMemoryBarMenuItem.switchToggle();
                }
            });

            const toggleMemoryBarMenuItem = new realityEditor.gui.MenuItem('Toggle Memory Bar', { shortcutKey: 'PERIOD', toggle: true, disabled: false }, (checked) => {
                memoryBar.toggleVisibility(checked);
            });
            realityEditor.gui.getMenuBar().addItemToMenu(realityEditor.gui.MENU.Camera, toggleMemoryBarMenuItem);

            // Only one gets a menu item to avoid crowding, but they all get a shortcut key
            // TODO: make use of the MenuItemSubmenu (used in the Follow menu) to include all of the shortcuts
            const saveCameraPositionMenuItem = new realityEditor.gui.MenuItem('Save Camera Position', { shortcutKey: '_1', modifiers: ['ALT'], toggle: false, disabled: false }, () => {
                memoryBar.saveMemoryInSlot(0);
            });
            const loadCameraPositionMenuItem = new realityEditor.gui.MenuItem('Load Camera Position', { shortcutKey: '_1', modifiers: ['SHIFT'], toggle: false, disabled: false }, () => {
                memoryBar.loadMemoryFromSlot(0);
            });
            realityEditor.gui.getMenuBar().addItemToMenu(realityEditor.gui.MENU.Camera, saveCameraPositionMenuItem);
            realityEditor.gui.getMenuBar().addItemToMenu(realityEditor.gui.MENU.Camera, loadCameraPositionMenuItem);
            [2, 3, 4, 5, /*6, 7, 8, 9, 0*/].forEach(key => {
                // Would be nice to deduplicate some of this logic, shared with MenuBar and MenuItem
                keyboard.onKeyDown((code, activeModifiers) => {
                    if (realityEditor.device.keyboardEvents.isKeyboardActive()) { return; } // ignore if a tool is using the keyboard
                    const modifierSetsMatch = (modifierSet1, modifierSet2) => {
                        return modifierSet1.length === modifierSet2.length && modifierSet1.every(value => modifierSet2.includes(value));
                    };
                    if (code === keyboard.keyCodes[`_${key}`] && modifierSetsMatch([keyboard.keyCodes['ALT']], activeModifiers)) {
                        memoryBar.saveMemoryInSlot(key - 1);

                        memoryBar.toggleVisibility(true);
                        if (!toggleMemoryBarMenuItem.isToggled()) {
                            toggleMemoryBarMenuItem.switchToggle();
                        }
                    }
                    if (code === keyboard.keyCodes[`_${key}`] && modifierSetsMatch([keyboard.keyCodes['SHIFT']], activeModifiers)) {
                        memoryBar.loadMemoryFromSlot(key - 1);
                    }
                });
            });
        });

        /**
         * Stops following the previous target, tells the virtualCamera lock on to the new target id,
         * shows visual feedback (a colored screen border), and notifies other clients via the avatar publicData
         * @param {string} avatarToLockOntoId
         */
        const lockOnToTarget = (avatarToLockOntoId) => {
            if (virtualCamera.lockOnMode && virtualCamera.lockOnMode !== avatarToLockOntoId) {
                // stop following previous and start following new
                virtualCamera.toggleLockOnMode(null);
            }
            let newLockOnMode = virtualCamera.toggleLockOnMode(avatarToLockOntoId);
            try {
                let avatarObject = realityEditor.getObject(avatarToLockOntoId);
                let color = realityEditor.avatar.utils.getColor(avatarObject);
                let avatarProfile = realityEditor.avatar.getConnectedAvatarList()[avatarToLockOntoId];

                if (newLockOnMode) {
                    let avatarDescription = avatarProfile.name ? `${avatarProfile.name}'s` : `Anonymous User's`;
                    let description = `Press <Escape> to stop viewing ${avatarDescription} perspective`;
                    addScreenBorder(color, description);
                    realityEditor.avatar.writeMyLockOnMode(avatarToLockOntoId);
                } else {
                    removeScreenBorder();
                    realityEditor.avatar.writeMyLockOnMode(null);
                }
            } catch (e) {
                console.warn('error locking onto target', e);
            }
        };

        /**
         * Tells another user to lock onto my view, by sending a message via that avatar's publicData
         * @param {string} otherAvatarId
         */
        const lockOnToMe = (otherAvatarId) => {
            realityEditor.avatar.writeLockOnToMe(otherAvatarId);
        };

        // Depending on which avatar menu item is clicked, perform the right LockOn action
        realityEditor.avatar.iconMenu.onAvatarIconMenuItemSelected((params) => {
            let {avatarObjectId, buttonText } = params;

            if (buttonText === realityEditor.avatar.iconMenu.MENU_ITEMS.FollowThem) {
                lockOnToTarget(avatarObjectId);
            } else if (buttonText === realityEditor.avatar.iconMenu.MENU_ITEMS.FollowMe) {
                lockOnToMe(avatarObjectId);
            } else if (buttonText === realityEditor.avatar.iconMenu.MENU_ITEMS.AllFollowMe) {
                // for each other avatar in the same world... tell them to lock on to me
                let myId = realityEditor.avatar.getMyAvatarId();
                realityEditor.forEachObject((object, objectId) => {
                    if (!realityEditor.avatar.utils.isAvatarObject(object)) return; // only works with avatars
                    if (objectId === myId) return; // don't lock self onto self
                    lockOnToMe(objectId);
                });
                // if I'm locked onto someone else, stop following them when I ask everyone to follow me
                if (virtualCamera.lockOnMode) {
                    virtualCamera.toggleLockOnMode(null);
                    realityEditor.avatar.writeMyLockOnMode(null);
                    removeScreenBorder();
                }
            }
        });

        // If virtual camera stops lockOnMode (e.g. using escape key), remove the border and notify others
        virtualCamera.onStopLockOnMode(() => {
            removeScreenBorder();
            realityEditor.avatar.writeMyLockOnMode(null);
        });

        // detect when other users started/stopped following me, by subscribing to my avatar's userProfile
        realityEditor.avatar.registerOnMyAvatarInitializedCallback((myAvatarObject) => {
            const subscriptionCallbacks = {};
            subscriptionCallbacks[realityEditor.avatar.utils.PUBLIC_DATA_KEYS.userProfile] = (msgContent) => {
                const userProfile = msgContent.publicData.userProfile;
                let avatarToLockOntoId = userProfile.lockOnMode;
                lockOnToTarget(avatarToLockOntoId);
            };
            realityEditor.avatar.network.subscribeToAvatarPublicData(myAvatarObject, subscriptionCallbacks);
        });

        if (realityEditor.ai) {
            realityEditor.ai.registerCallback('shouldFocusVirtualCamera', function (params) {
                focusVirtualCamera(new Vector3(params.pos.x, params.pos.y, params.pos.z), new Vector3(params.dir.x, params.dir.y, params.dir.z));
            });
        }
    }

    /**
     * Update the floorOffset of the camera system - useful if new gltf loads with new navmesh/floorOffset
     * @param {number} floorOffset
     */
    function updateCameraFloorOffset(floorOffset) {
        if (!virtualCamera) {
            console.warn('cant update camera with floorOffset because no camera yet');
            return;
        }
        virtualCamera.updateFloorOffset(floorOffset);
    }

    /**
     * For lockOnMode: add "screen share"-style border to edge of screen to indicate that you are following another user
     * @param {string} color - hsl/rgb/hex string
     * @param {string} descriptionText - what text to display on the screen while following
     */
    function addScreenBorder(color, descriptionText) {
        let existingBorder = document.getElementById('avatar-follow-border');
        if (existingBorder) {
            changeBorderColor(color);
            return;
        }

        let border = document.createElement('div');
        border.style.border = '8px solid ' + color;
        border.id = 'avatar-follow-border';

        if (descriptionText) {
            let textDiv = document.createElement('div');
            textDiv.classList.add('fullscreenSubtitle');
            textDiv.textContent = descriptionText;
            border.appendChild(textDiv);
        }

        document.body.appendChild(border);
    }

    /**
     * Remove the colored border when you stop lockOnMode
     */
    function removeScreenBorder() {
        let border = document.getElementById('avatar-follow-border');
        if (border) {
            border.parentNode.removeChild(border);
        }
    }

    /**
     * Change the lockOnMode screen border color
     * @param {string} color - hsl/rgb/hex string
     */
    function changeBorderColor(color) {
        let border = document.getElementById('avatar-follow-border');
        if (border) {
            border.style.border = '8px solid ' + color;
        }
    }

    /**
     * More accessible controls for touchscreen devices:
     * Adds buttons to the screen where the user can toggle between pan/rotate/zoom/pointer
     * The selected mode will be used by the primary pointer (left click, first tap, etc)
     */
    function setupTouchControlButtons() {
        if (realityEditor.device.environment.isDesktop()) return; // only show them on iPhone/iPad remote operators
        if (touchControlButtons) return; // only initialize one time - but remember to show/hide if we go from AR<>VR

        // add the buttons to the screen
        touchControlButtons = new TouchControlButtons();
        document.body.appendChild(touchControlButtons.container);
        touchControlButtons.container.id = 'touchControlsContainer';

        const FLAG_NAME = 'touchCameraControlButtons';

        touchControlButtons.onModeSelected((mode) => {
            virtualCamera.setTouchControlMode(mode);

            // prevent avatar pointer from activating when we are in pan/rotate/zoom mode
            if (mode === 'pan' || mode === 'rotate' || mode === 'zoom') {
                realityEditor.device.setFlagForPointerOccupiedByCamera(FLAG_NAME);
            } else { // if 'pointer', or null
                realityEditor.device.clearFlagForPointerOccupiedByCamera(FLAG_NAME);
            }
        });

        touchControlButtons.selectMode('pointer'); // select this mode by default
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

        if (virtualCamera.touchControlMode !== 'zoom') {
            // most of the time, this is the zooming cursor UI that we use
            updateInteractionCursor(cameraTargetIcon.visible, 'addons/vuforia-spatial-remote-operator-addon/cameraZoom.svg');
        } else {
            // show different UI if you're zooming with touchscreen, which indicates that +Y is zoom in, -Y is out
            let dynamicImageSrc = 'addons/vuforia-spatial-remote-operator-addon/touch-control-zoom-dynamic.svg';
            let staticImageInfo = {
                src: 'addons/vuforia-spatial-remote-operator-addon/touch-control-zoom-static.svg',
                width: 30,
                height: 90
            };
            updateInteractionCursor(cameraTargetIcon.visible, dynamicImageSrc, staticImageInfo);
        }
    }

    /**
     * This updates the state of the two cursor images that appear while you're manipulating the camera. The first
     * image follows your cursor. The second "static" one appears faintly at the position where you originally clicked
     * down. The static image defaults to be the same as the moving cursor image, but a different image can be provided.
     * @param {boolean} visible
     * @param {string} imageSrc
     * @param {*|null} staticImageInfo
     */
    function updateInteractionCursor(visible, imageSrc, staticImageInfo = {src: null, width: null, height: null}) {
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
        if (staticImageInfo && staticImageInfo.src) {
            staticInteractionCursor.src = staticImageInfo.src;
            staticInteractionCursor.style.width = `${staticImageInfo.width}px` || '30px';
            staticInteractionCursor.style.height = `${staticImageInfo.height}px` || '30px';
        } else if (imageSrc) {
            staticInteractionCursor.src = imageSrc;
            staticInteractionCursor.style.width = '30px';
            staticInteractionCursor.style.height = '30px';
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
        if (virtualCamera && virtualCameraEnabled) {
            try {
                if (followCoordinator) {
                    followCoordinator.update();
                }

                let skipUpdate = followCoordinator.currentFollowTarget &&
                    followCoordinator.currentFollowTarget.followable &&
                    followCoordinator.currentFollowTarget.isFollowing2D &&
                    followCoordinator.currentFollowTarget.followable.doesOverrideCameraUpdatesInFirstPerson();

                let skipApplying = skipUpdate && !forceCameraUpdate;
                virtualCamera.update({ skipApplying: skipApplying });

                let worldObject = realityEditor.worldObjects.getBestWorldObject();
                if (worldObject) {
                    let worldId = worldObject.objectId;

                    // render a cube at the virtual camera's target position
                    let sceneNode = realityEditor.sceneGraph.getSceneNodeById(rotateCenterElementId);
                    sceneNode.setLocalMatrix(virtualCamera.getFocusTargetCubeMatrix());

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
        };

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
            let targetPositionObj = realityEditor.sceneGraph.getPointAtDistanceFromCamera(window.innerWidth / 2, window.innerHeight / 2, 1000, worldNode, deviceNode);
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
            let targetPositionObj = realityEditor.sceneGraph.getPointAtDistanceFromCamera(window.innerWidth / 2, window.innerHeight / 2, 1000, groundPlaneNode, deviceNode);
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

            if (touchControlButtons) {
                touchControlButtons.activate();
                touchControlButtons.selectMode('pointer'); // select pointer mode by default
            }
        });
        realityEditor.device.modeTransition.onRemoteOperatorHidden(() => {
            virtualCameraEnabled = false;
            virtualCamera.zoomOutTransition = false;
            cameraTransitionPosition_AR = null;
            cameraTransitionTarget_AR = null;
            cameraTransitionPosition_VR = null;
            cameraTransitionTarget_VR = null;

            if (touchControlButtons) {
                touchControlButtons.deactivate();
                touchControlButtons.selectMode(null); // deselect all modes and propagate state to virtual camera
            }
        });
    }

    function focusVirtualCamera(pos, dir) {
        if (!virtualCamera || !virtualCameraEnabled) return;
        virtualCamera.focus(pos, dir);
    }

    exports.update = update;
    exports.initService = initService;
    exports.updateCameraFloorOffset = updateCameraFloorOffset;
})(realityEditor.device.desktopCamera);
