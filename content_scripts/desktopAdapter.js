/*
* Copyright © 2018 PTC
*
* This Source Code Form is subject to the terms of the Mozilla Public
* License, v. 2.0. If a copy of the MPL was not distributed with this
* file, You can obtain one at http://mozilla.org/MPL/2.0/.
*/

/* globals globalCanvas */

createNameSpace('realityEditor.device.desktopAdapter');

/**
 * @fileOverview realityEditor.device.desktopAdapter.js
 * If the editor frontend is loaded on a desktop browser, re-maps some native functions, adjusts some CSS, and
 * waits for a connection from a mobile editor that will stream matrices here
 */

(function(exports) {

    const PROXY = !window.location.port || window.location.port === "443";

    // holds the most recent set of objectId/matrix pairs so that they can be rendered on the next frame
    let visibleObjects = {};

    let didAddModeTransitionListeners = false;

    let env = realityEditor.device.environment.variables;

    /**
     * initialize the desktop adapter only if we are running on a desktop environment
     */
    function initService() {
        // add these so that we can activate the addon later if we enable AR mode
        addModeTransitionListeners();

        // by including this check, we can tolerate compiling this add-on into the app without breaking everything
        // (ideally this add-on should only be added to a "desktop" server but this should effectively ignore it on mobile)
        if (realityEditor.device.environment.isARMode()) { return; }

        if (!env) {
            env = realityEditor.device.environment.variables; // ensure that this alias is set correctly if loaded too fast
        }

        // Set the correct environment variables so that this add-on changes the app to run in desktop mode
        env.requiresMouseEvents = realityEditor.device.environment.isDesktop(); // this fixes touch events to become mouse events
        env.supportsDistanceFading = false; // this prevents things from disappearing when the camera zooms out
        env.ignoresFreezeButton = true; // no need to "freeze the camera" on desktop
        env.shouldDisplayLogicMenuModally = true; // affects appearance of crafting board
        env.lineWidthMultiplier = 5; // makes links thicker (more visible)
        env.distanceScaleFactor = 30; // makes distance-based interactions work at further distances than mobile
        env.newFrameDistanceMultiplier = 6; // makes new tools spawn further away from camera position
        // globalStates.defaultScale *= 3; // make new tools bigger
        env.localServerPort = PROXY ? 443 : 8080; // this would let it find world_local if it exists (but it probably doesn't exist)
        env.shouldCreateDesktopSocket = true; // this lets UDP messages get sent over socket instead
        env.isCameraOrientationFlipped = true; // otherwise new tools and anchors get placed upside-down
        env.waitForARTracking = false; // don't show loading UI waiting for vuforia to give us camera matrices
        env.supportsAreaTargetCapture = false; // don't show Create Area Target UI when app loads
        env.hideOriginCube = true; // don't show a set of cubes at the world origin
        env.addOcclusionGltf = false; // don't add transparent world gltf, because we're already adding the visible mesh
        env.transformControlsSize = 0.3; // gizmos for ground plane anchors are smaller
        env.defaultShowGroundPlane = true;
        env.groundWireframeColor = 'rgb(255, 240, 0)'; // make the ground holo-deck styled

        globalStates.groundPlaneOffset = 0.77;
        if (PROXY) {
            realityEditor.app.callbacks.acceptUDPBeats = false;
            globalStates.a = 0.77;
            realityEditor.network.state.isCloudInterface = true;
        }
        // default values that I may or may not need to invert:
        // shouldBroadcastUpdateObjectMatrix: false,

        restyleForDesktop();
        modifyGlobalNamespace();

        let worldIdQueryItem = getPrimaryWorldId();
        if (worldIdQueryItem) {
            realityEditor.network.discovery.setPrimaryWorld(null, worldIdQueryItem);
        }

        function setupMenuBarWhenReady() {
            if (realityEditor.gui.setupMenuBar) {
                realityEditor.gui.setupMenuBar();
                setupMenuBarItems();
                return;
            }
            setTimeout(setupMenuBarWhenReady, 50);
        }

        setupMenuBarWhenReady();

        // TODO realtime interactions between remote operator and AR clients need to be re-tested and possibly fixed
        setTimeout(function() {
            addSocketListeners(); // HACK. this needs to happen after realtime module finishes loading
        }, 100);

        calculateProjectionMatrices(window.innerWidth, window.innerHeight);

        function setupKeyboardWhenReady() {
            if (realityEditor.device.KeyboardListener) {
                setupKeyboard();
                return;
            }
            setTimeout(setupKeyboardWhenReady, 50);
        }

        setupKeyboardWhenReady();

        setTimeout(() => {
            realityEditor.gui.threejsScene.getInternals().setAnimationLoop(update);
        }, 100);
    }

    function calculateProjectionMatrices(viewportWidth, viewportHeight) {
        const iPhoneVerticalFOV = 41.22673; // https://discussions.apple.com/thread/250970597
        const desktopProjectionMatrix = projectionMatrixFrom(iPhoneVerticalFOV, viewportWidth/ viewportHeight, 10, 300000);

        realityEditor.gui.ar.setProjectionMatrix(desktopProjectionMatrix);

        let cameraNode = realityEditor.sceneGraph.getCameraNode();
        if (cameraNode) {
            cameraNode.needsRerender = true; // make sure the sceneGraph is rendered with the right projection matrix
        }
    }

    function setupMenuBarItems() {
        const menuBar = realityEditor.gui.getMenuBar();

        menuBar.addCallbackToItem(realityEditor.gui.ITEM.DarkMode, (value) => {
            if (value) {
                menuBar.domElement.classList.remove('desktopMenuBarLight');
                Array.from(document.querySelectorAll('.desktopMenuBarMenuDropdown')).forEach(dropdown => {
                    dropdown.classList.remove('desktopMenuBarLight');
                });
                document.body.style.backgroundColor = 'rgb(50, 50, 50)';
                env.groundWireframeColor = 'rgb(255, 240, 0)'; // make the ground holo-deck styled yellow
                realityEditor.gui.ar.groundPlaneRenderer.updateGridStyle({
                    color: env.groundWireframeColor,
                    thickness: 0.075 // relatively thick
                });
                // todo Steve: make ai chatbox turn on dark mode
                let aiContainer = document.getElementById('ai-chat-tool-container');
                let searchTextArea = [...aiContainer.querySelectorAll('#searchTextArea')][0];
                searchTextArea.classList.remove('searchTextArea-light');
                let myAiDialogues = [...aiContainer.querySelectorAll('.ai-chat-tool-dialogue-my')];
                myAiDialogues.forEach(dialogue => dialogue.classList.remove('ai-chat-tool-dialogue-my-light'));
                let aiAiDialogues = [...aiContainer.querySelectorAll('.ai-chat-tool-dialogue-ai')];
                aiAiDialogues.forEach(dialogue => dialogue.classList.remove('ai-chat-tool-dialogue-ai-light'));
            } else {
                menuBar.domElement.classList.add('desktopMenuBarLight');
                Array.from(document.querySelectorAll('.desktopMenuBarMenuDropdown')).forEach(dropdown => {
                    dropdown.classList.add('desktopMenuBarLight');
                });
                document.body.style.backgroundColor = 'rgb(225, 225, 225)';
                env.groundWireframeColor = 'rgb(150, 150, 150)'; // make the ground plane subtle grey
                realityEditor.gui.ar.groundPlaneRenderer.updateGridStyle({
                    color: env.groundWireframeColor,
                    thickness: 0.025 // relatively thin
                });
                // todo Steve: make ai chatbox turn off dark mode
                let aiContainer = document.getElementById('ai-chat-tool-container');
                let searchTextArea = aiContainer.querySelector('#searchTextArea');
                searchTextArea.classList.add('searchTextArea-light');
                let myAiDialogues = [...aiContainer.querySelectorAll('.ai-chat-tool-dialogue-my')];
                myAiDialogues.forEach(dialogue => dialogue.classList.add('ai-chat-tool-dialogue-my-light'));
                let aiAiDialogues = [...aiContainer.querySelectorAll('.ai-chat-tool-dialogue-ai')];
                aiAiDialogues.forEach(dialogue => dialogue.classList.add('ai-chat-tool-dialogue-ai-light'));
            }
        });

        menuBar.addCallbackToItem(realityEditor.gui.ITEM.SurfaceAnchors, (value) => {
            realityEditor.gui.ar.groundPlaneAnchors.togglePositioningMode(value);
        });
    }

    // add a keyboard listener to toggle visibility of the zone/phone discovery buttons
    function setupKeyboard() {
        let keyboard = new realityEditor.device.KeyboardListener();
        keyboard.onKeyDown(function(code) {
            if (realityEditor.device.keyboardEvents.isKeyboardActive()) { return; } // ignore if a tool is using the keyboard

            // if hold press S while dragging an element, scales it
            if (code === keyboard.keyCodes.S) {
                let touchPosition = realityEditor.gui.ar.positioning.getMostRecentTouchPosition();

                if (!realityEditor.device.editingState.syntheticPinchInfo) {
                    realityEditor.device.editingState.syntheticPinchInfo = {
                        startX: touchPosition.x,
                        startY: touchPosition.y
                    };
                }
            } else if (code === keyboard.keyCodes.R) {
                // rotate tool towards camera a single time when you press the R key while dragging a tool
                let tool = realityEditor.device.getEditingVehicle();
                if (!tool) return;
                let toolSceneNode = realityEditor.sceneGraph.getSceneNodeById(tool.uuid);
                if (!toolSceneNode) return;
                // we don't include scale in new matrix otherwise it can shrink/grow
                let modelMatrix = realityEditor.sceneGraph.getModelMatrixLookingAt(tool.uuid, 'CAMERA', {flipX: true, flipY: true, includeScale: false});
                let rootNode = realityEditor.sceneGraph.getSceneNodeById('ROOT');
                toolSceneNode.setPositionRelativeTo(rootNode, modelMatrix);
            }
        });
        keyboard.onKeyUp(function(code) {
            if (realityEditor.device.keyboardEvents.isKeyboardActive()) { return; } // ignore if a tool is using the keyboard

            if (code === keyboard.keyCodes.S) {
                realityEditor.device.editingState.syntheticPinchInfo = null;
                globalCanvas.hasContent = true; // force the canvas to be cleared
            }
        });
    }

    /**
     * Builds a projection matrix from field of view, aspect ratio, and near and far planes
     */
    function projectionMatrixFrom(vFOV, aspect, near, far) {
        var top = near * Math.tan((Math.PI / 180) * 0.5 * vFOV );
        var height = 2 * top;
        var width = aspect * height;
        var left = -0.5 * width;
        return makePerspective( left, left + width, top, top - height, near, far );
    }

    /**
     * Helper function for creating a projection matrix
     */
    function makePerspective ( left, right, top, bottom, near, far ) {

        var te = [];
        var x = 2 * near / ( right - left );
        var y = 2 * near / ( top - bottom );

        var a = ( right + left ) / ( right - left );
        var b = ( top + bottom ) / ( top - bottom );
        var c = - ( far + near ) / ( far - near );
        var d = - 2 * far * near / ( far - near );
        
        te[ 0 ] = x;    te[ 4 ] = 0;    te[ 8 ] = a;    te[ 12 ] = 0;
        te[ 1 ] = 0;    te[ 5 ] = y;    te[ 9 ] = b;    te[ 13] = 0;
        te[ 2 ] = 0;    te[ 6 ] = 0;    te[ 10 ] = c;   te[ 14 ] = d;
        te[ 3 ] = 0;    te[ 7 ] = 0;    te[ 11 ] = - 1; te[ 15 ] = 0;

        return te;

    }

    /**
     * Adjust visuals for desktop rendering -> set background color and add "Waiting for Connection..." indicator
     */
    function restyleForDesktop() {

        document.getElementById('groundPlaneResetButton').classList.add('hiddenDesktopButton');

        realityEditor.device.layout.onWindowResized(({width, height}) => {
            calculateProjectionMatrices(width, height);
        });

        const DISABLE_SAFE_MODE = true;
        if (!DISABLE_SAFE_MODE) {
            if (window.outerWidth !== document.body.offsetWidth) {
                alert('Reset browser zoom level to get accurate calculations');
            }
        }

        realityEditor.gui.ar.injectClosestObjectFilter(function(objectKey) {
            let object = realityEditor.getObject(objectKey);
            if (!object) { return false; }
            let isWorld = object.isWorldObject || object.type === 'world';
            if (!isWorld && realityEditor.sceneGraph.getDistanceToCamera(objectKey) > 2000) {
                return false;
            }
            return true;
        });
    }

    /**
     * Re-maps native app calls to functions within this file.
     * E.g. calling realityEditor.app.setPause() will be rerouted to this file's setPause() function.
     * @todo Needs to be manually modified as more native calls are added. Add one switch case per native app call.
     */
    function modifyGlobalNamespace() {
        if (realityEditor.device.environment.isWithinToolboxApp()) {
            console.warn('Preventing modifyGlobalNamespace - we are within the toolbox app');
            return;
        }
        
        // mark that we've manipulated the webkit reference, so that we
        // can still detect isWithinToolboxApp vs running in mobile browser
        window.webkitWasTamperedWith = true;

        // set up object structure if it doesn't exist yet
        window.webkit = {
            messageHandlers: {
                realityEditor: {}
            }
        };

        // intercept postMessage calls to the messageHandlers and manually handle each case by functionName
        window.webkit.messageHandlers.realityEditor.postMessage = function(messageBody) {
            switch (messageBody.functionName) {
            // case 'setPause':
            //     setPause();
            //     break;
            // case 'setResume':
            //     setResume();
            //     break;
            case 'getVuforiaReady':
                getVuforiaReady(messageBody.arguments);
                break;
            case 'sendUDPMessage':
                sendUDPMessage(messageBody.arguments);
                break;
                // case 'getUDPMessages':
                //     getUDPMessages(messageBody.callback);
            case 'muteMicrophone':
                realityEditor.gui.ar.desktopRenderer.muteMicrophoneForCameraVis();
                break;
            case 'unmuteMicrophone':
                realityEditor.gui.ar.desktopRenderer.unmuteMicrophoneForCameraVis();
                break;
            default:
                return;
            }
        };

        // we also manually overwrite some of the promise wrappers for certain webkit messageHandlers
        // else they'll never resolve (e.g. realityEditor.app.promises.setPause().then(success => {...})
        realityEditor.app.promises.setPause = async () => {
            return new Promise((resolve, _reject) => {
                resolve(true); // setPause resolves immediately on desktop
            });
        };
        realityEditor.app.promises.setResume = async () => {
            return new Promise((resolve, _reject) => {
                resolve(true); // setResume resolves immediately on desktop
            });
        };

        // don't need to polyfill webkit functions for Chrome here because it is already polyfilled in the userinterface

        // TODO: unsure if env.isCameraOrientationFlipped was only necessary because rotateX needs to be different on desktop..
        //       investigate this further to potentially simplify calculations
        // rotateX = [
        //     1, 0, 0, 0,
        //     0, -1, 0, 0,
        //     0, 0, -1, 0,
        //     0, 0, 0, 1
        // ];
        // realityEditor.gui.ar.draw.rotateX = rotateX;

        window.DEBUG_CLIENT_NAME = 'Remote Operator';
    }

    /**
     * Adds socket.io listeners for UDP messages necessary to setup editor without mobile environment
     * (e.g. object discovery)
     */
    function addSocketListeners() {

        realityEditor.network.addObjectDiscoveredCallback(function(object, objectKey) {
            // make objects show up by default at the origin
            if (object.matrix.length === 0) {
                object.matrix = realityEditor.gui.ar.utilities.newIdentityMatrix();
                visibleObjects[objectKey] = realityEditor.gui.ar.utilities.newIdentityMatrix();
            }

            // subscribe to new object matrices to update where the object is in the world
            realityEditor.network.realtime.subscribeToObjectMatrices(objectKey, function(data) {
                if (globalStates.freezeButtonState) { return; }

                var msgData = JSON.parse(data);
                if (msgData.objectKey === objectKey && msgData.propertyPath === 'matrix') {

                    // emit an event if this is a newly "discovered" matrix
                    if ((!object.matrix || object.matrix.length !== 16) && msgData.newValue.length === 16) {
                        callbackHandler.triggerCallbacks('objectMatrixDiscovered', {objectKey: msgData.objectKey});
                    }

                    // TODO: set sceneGraph localMatrix to msgData.newValue?
                    // var rotatedObjectMatrix = realityEditor.gui.ar.utilities.copyMatrix(msgData.newValue);
                    // object.matrix = rotatedObjectMatrix;
                    // visibleObjects[msgData.objectKey] = rotatedObjectMatrix;

                    visibleObjects[msgData.objectKey] = realityEditor.gui.ar.utilities.newIdentityMatrix();
                }
            });
        });

        realityEditor.network.realtime.addDesktopSocketMessageListener('reloadScreen', function(_msgContent) {
            // window.location.reload(); // reload screen when server restarts
        });

        realityEditor.network.realtime.addDesktopSocketMessageListener('udpMessage', function(msgContent) {

            if (typeof msgContent.id !== 'undefined' &&
                typeof msgContent.ip !== 'undefined') {

                if (typeof realityEditor.network.discovery !== 'undefined') {
                    realityEditor.network.discovery.processHeartbeat(msgContent);
                }
            }

            if (typeof msgContent.action !== 'undefined') {
                if (typeof msgContent.action === 'string') {
                    try {
                        msgContent.action = JSON.parse(msgContent.action);
                    } catch (e) {
                        // console.log('dont need to parse');
                    }
                }
                realityEditor.network.onAction(msgContent.action);
            }

            // forward the message to a generic message handler that various modules use to subscribe to different messages
            realityEditor.network.onUDPMessage(msgContent);

        });

    }

    function addModeTransitionListeners() {
        if (didAddModeTransitionListeners) return;
        didAddModeTransitionListeners = true;

        // start the update loop when the remote operator is shown
        realityEditor.device.modeTransition.onRemoteOperatorShown(() => {
            realityEditor.gui.threejsScene.getInternals().setAnimationLoop(update); // start update loop
            calculateProjectionMatrices(window.innerWidth, window.innerHeight); // update proj matrices
        });
    }

    /**
     * The 60 FPS render loop. Smoothly calls realityEditor.gui.ar.draw.update to render the most recent visibleObjects
     * Also smoothly updates camera postion when paused
     */
    function update() {
        if (realityEditor.device.environment.isARMode()) { return; } // stop the update loop if we enter AR mode

        // TODO: ensure that visibleObjects that aren't known objects get filtered out

        realityEditor.gui.ar.draw.update(getVisibleObjects());
    }

    function getVisibleObjects() {
        // render everything that has been localized
        let tempVisibleObjects = {};

        // first process the world objects
        let visibleWorlds = [];
        Object.keys(objects).forEach(function(objectKey) {
            let object = objects[objectKey];

            // always add world object to scene unless we set a primaryWorldId in the URLSearchParams
            if (object.isWorldObject || object.type === 'world') {
                let primaryWorld = getPrimaryWorldId();

                if (!primaryWorld || objectKey === primaryWorld) {
                    tempVisibleObjects[objectKey] = object.matrix; // actual matrix doesn't matter, just that it's visible
                    visibleWorlds.push(objectKey);
                }
            }
        });

        // now process the other objects
        Object.keys(objects).forEach(function(objectKey) {
            let object = objects[objectKey];

            // we already added world objects. also ignore the avatar objects
            if (object.isWorldObject || object.type === 'world' || realityEditor.avatar.utils.isAvatarObject(object)) {
                return;
            }

            // if there isn't a world object, it's ok to load objects without a world (e.g. as a debugger)
            if (visibleWorlds.length === 0) {
                if (!object.worldId) {
                    tempVisibleObjects[objectKey] = object.matrix; // actual matrix doesn't matter, just that it's visible
                }
            } else {
                // if there is a world loaded, only show objects localized within that world, not at the identity matrix
                if (object.worldId && visibleWorlds.includes(object.worldId)) {
                    if (!realityEditor.gui.ar.utilities.isIdentityMatrix(object.matrix)) {
                        tempVisibleObjects[objectKey] = object.matrix; // actual matrix doesn't matter , just that it's visible
                    }
                }
            }
        });

        return tempVisibleObjects;
    }

    function createNativeAPISocket() {
        // lazily instantiate the socket to the server if it doesn't exist yet
        var socketsIps = realityEditor.network.realtime.getSocketIPsForSet('nativeAPI');
        // var hostedServerIP = 'http://127.0.0.1:' + window.location.port;
        var hostedServerIP = window.location.protocol + '//' + window.location.host; //'http://127.0.0.1:' + window.location.port;

        if (socketsIps.indexOf(hostedServerIP) < 0) {
            realityEditor.network.realtime.createSocketInSet('nativeAPI', hostedServerIP);
            realityEditor.network.realtime.addDesktopSocketMessageListener('test', function(message) {
                console.log('received message from socketMessageListener', message);
            });
        }
    }

    function sendUDPMessage(args) {
        createNativeAPISocket();
        realityEditor.network.realtime.sendMessageToSocketSet('nativeAPI', '/nativeAPI/sendUDPMessage', args.message);
    }

    function getVuforiaReady(_args) {
        // just immediately call the callback because vuforia will never load on the desktop

        // this is the only functionality we still need from the original callback (realityEditor.app.callbacks.vuforiaIsReady)
        realityEditor.app.getUDPMessages('realityEditor.app.callbacks.receivedUDPMessage');
    }

    function getPrimaryWorldId() {
        return (new URLSearchParams(window.location.search)).get('world');
    }

    exports.getPrimaryWorldId = getPrimaryWorldId;

    // this happens only for desktop editors
    realityEditor.addons.addCallback('init', initService);
}(realityEditor.device.desktopAdapter));
