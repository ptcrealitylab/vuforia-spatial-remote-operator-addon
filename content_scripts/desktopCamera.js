createNameSpace('realityEditor.device.desktopCamera');

/**
 * @fileOverview realityEditor.device.desktopCamera.js
 * Responsible for manipulating the camera position and resulting view matrix, on remote desktop clients
 */

(function() {

    var cameraPosition = [1800, 7300, -5300]; //[735, -1575, -162]; //[1000, -500, 500];
    var cameraTargetPosition = [0, 0, 0];
    var previousTargetPosition = [0, 0, 0];
    var currentDistanceToTarget = 500;
    var isFollowingObjectTarget = false;
    var closestObjectLog = null;

    var targetOnLoad = 'kepwareBox7Cjeujc54h5y'; //'kepwareBox4Qimhnuea3n6'; // TODO: load from localStorage the last targeted thing

    var DEBUG_SHOW_LOGGER = false;
    var DEBUG_REMOVE_KEYBOARD_CONTROLS = false;
    var DEBUG_PREVENT_CAMERA_SINGULARITIES = false;

    /**
     * @type {Dropdown} - DOM element to choose which object to target for the camera
     */
    var objectDropdown;
    var selectedObjectKey = null; //null; //'closestObject';

    // polyfill for requestAnimationFrame to provide a smooth update loop
    var requestAnimationFrame = window.requestAnimationFrame ||
        window.webkitRequestAnimationFrame || function(cb) {setTimeout(cb, 17);};

    // holds the most recent set of objectId/matrix pairs so that they can be rendered on the next frame

    // hold the current camera position/rotation information, which can be updated with keyboard input
    var cameraTranslationMatrix = []; // these are defined here for memory allocation optimization, but updated each time
    var cameraRotationMatrix = [];

    var cameraX = 200; //0;
    var cameraY = -1170; //0;
    var cameraZ = 2230; //7000;

    var cameraVelocityX = 0;
    var cameraVelocityY = 0;
    var cameraVelocityZ = 0;

    var cameraPitch = 0;
    var cameraRoll = 0;
    var cameraYaw = 0;

    var cameraVelocityPitch = 0;
    var cameraVelocityRoll = 0;
    var cameraVelocityYaw = 0;

    // how fast the camera will pan and rotate each frame (units are scaled for vuforia modelview matrix)
    var cameraSpeed = 0.0001; // 0.01;
    var keyboardSpeedMultiplier = {
        translation: 50000,
        rotation: 10,
        scale: 250000
    }; //1000;
    
    let scrollWheelMultiplier = 10000;

    var mouseSpeedMultiplier = {
        translation: 250,
        rotation: .0015,
        scale: 350
    };

    var firstX = 0;
    var firstY = 0;
    var lastX = 0;
    var lastY = 0;
    // var firstMouse = true;
    var isMouseDown = false;
    // var sensitivity = 1;
    var unprocessedMouseMovements = [];
    
    let unprocessedScrollDY = 0;
    let unprocessedMouseDX = 0;
    let unprocessedMouseDY = 0;

    var mouseMovement = {};

    var cameraUpVector = [0, 1, 0];

    var areControlsInverted = true;

    /**
     * Enum mapping readable keyboard names to their keyCode
     * @type {Readonly<{LEFT: number, UP: number, RIGHT: number, DOWN: number, ONE: number, TWO: number, ESCAPE: number, W: number, A: number, S: number, D: number}>}
     */
    var keyCodes = Object.freeze({
        LEFT: 37,
        UP: 38,
        RIGHT: 39,
        DOWN: 40,
        ONE: 49,
        TWO: 50,
        ESCAPE: 27,
        W: 87,
        A: 65,
        S: 83,
        D: 68,
        Q: 81,
        E: 69,
        SHIFT: 16
    });

    /**
     * For each key included in keyCodes, tracks whether the key is "up" or "down"
     * @type {Object.<string, string>}
     */
    var keyStates = {};

    /**
     * for cameraModes.CLOSEST_OBJECT - holds how much the camera has rotated while each objectId was the closest
     * @type {Object.<string, {roll: number, pitch: number, yaw: number}>}
     */
    var rotations = {};

    var speedMultipliers = {
        translation: -100,
        rotation: 0.01
    };

    var destinationCameraMatrix = []; //JSON.parse("[0.9970872369217663,-0.0195192707153495,-0.0737295058877905,0,0,0.9666966751096482,-0.2559248685297132,0,0.076269534990826,0.2551794200218579,0.9638809167265376,0,9.292587708200172e-166,2.2737367544323196e-13,-4789.705780105794,1]"); //[];

    /**
     * Public init method to enable rendering if isDesktop
     */
    function initService() {
        if (!realityEditor.device.desktopAdapter.isDesktop()) { return; }
        
        // disable right-click context menu so we can use right-click to rotate camera
        document.addEventListener('contextmenu', event => event.preventDefault());

        // setTimeout(function() {
        //     realityEditor.gui.ar.draw.correctedCameraMatrix = JSON.parse("[0.9970872369217663,-0.0195192707153495,-0.0737295058877905,0,0,0.9666966751096482,-0.2559248685297132,0,0.076269534990826,0.2551794200218579,0.9638809167265376,0,9.292587708200172e-166,2.2737367544323196e-13,-4789.705780105794,1]")
        // }, 100);

        try {
            addSensitivitySlidersToMenu();
        } catch (e) {
            console.warn('Slider components for settings menu not available, skipping', e);
        }

        createObjectSelectionDropdown();
        addCameraManipulationListeners();
        update();

        realityEditor.device.callbackHandler.registerCallback('objectMatrixDiscovered', function(params) {
            tryAddingObjectToDropdown(params.objectKey);
        });

        // add a spacebar keyboard listener to toggle visibility of the zone/phone discovery buttons
        realityEditor.device.keyboardEvents.registerCallback('keyUpHandler', function(params) {
            if (params.event.code === 'KeyV') {
                if (objectDropdown) {
                    if (objectDropdown.dom.style.display !== 'none') {
                        objectDropdown.dom.style.display = 'none';
                    } else {
                        objectDropdown.dom.style.display = '';
                    }
                }
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

        // setInterval(function() {
        //     var closestObjectKey = realityEditor.gui.ar.getClosestObject()[0];
        //     closestObjectLog.innerText = closestObjectKey;
        // }, 1000);
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

    function getCameraZoomSensitivity() {
        return Math.max(0.01, realityEditor.gui.settings.toggleStates.cameraZoomSensitivity || 0.5);
    }

    function getCameraPanSensitivity() {
        return Math.max(0.01, realityEditor.gui.settings.toggleStates.cameraPanSensitivity || 0.5);
    }

    function getCameraRotateSensitivity() {
        return Math.max(0.01, realityEditor.gui.settings.toggleStates.cameraRotateSensitivity || 0.5);
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

            // objectDropdown.addSelectable('null', 'No Target');
            // objectDropdown.addSelectable('inverted', 'Inverted');
            // objectDropdown.addSelectable('classic', 'Classic');
            // objectDropdown.addSelectable('closestObject', 'Closest Object');
            // objectDropdown.addSelectable('floatingPoint2000', 'Floating Point (2m)');
            // objectDropdown.addSelectable('floatingPoint5000', 'Floating Point (5m)');
            // objectDropdown.addSelectable('floatingPoint10000', 'Floating Point (10m)');
            // objectDropdown.addSelectable('floatingPoint20000', 'Floating Point (20m)');

            // objectDropdown.setText('Selected: Inverted', true);

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
        }
    }

    function setTargetPositionToObject(objectKey) {
        if (objectKey === 'origin') {
            cameraTargetPosition = [0, 0, 0];
            isFollowingObjectTarget = true;
            return;
        }

        var targetPosition = realityEditor.sceneGraph.getWorldPosition(objectKey);
        if (targetPosition) {
            cameraTargetPosition = [targetPosition.x, targetPosition.y, targetPosition.z];
            isFollowingObjectTarget = true;
        }
    }

    function onObjectSelectionChanged(selected) {
        if (selected && selected.element) {
            selectedObjectKey = selected.element.id;
            selectObject(selected.element.id);
        } else {
            selectedObjectKey = null;
        }
    }

    function selectObject(objectKey) { // todo use this in objectselectionchanged and element clicked

        objectDropdown.setText('Selected: ' + objectKey, true);

        selectedObjectKey = objectKey;
        setTargetPositionToObject(objectKey);
        previousTargetPosition = [cameraTargetPosition[0], cameraTargetPosition[1], cameraTargetPosition[2]];
        // if (objectKey === 'null' || objectKey === 'inverted') {
        //     areControlsInverted = objectKey === 'inverted';
        //     objectKey = null;
        //     // resetCamera(); // TODO: instead of reset, calculate the position+rotation needed to maintain visual consistency
        // }
    }

    function onObjectExpandedChanged(_isExpanded) {
        // console.log(isExpanded);
    }

    function logMessage(text) {
        if (DEBUG_SHOW_LOGGER) {
            closestObjectLog.innerText = text;
        }
    }

    // checks if moving the cameraPosition and cameraTargetPosition by the given velocities would cause the vertical vector to cross a singularity and flip the entire camera view
    function wouldCameraFlip(currentVerticalVector, velocity, targetVelocity) {
        var nextPosition = add(cameraPosition, velocity);
        var nextTargetPosition = add(cameraTargetPosition, targetVelocity);
        var ev = nextPosition;
        var cv = nextTargetPosition;
        var uv = [0, 1, 0];
        var nextForwardVector = normalize(add(ev, negate(cv))); // vector from the camera to the center point
        var nextHorizontalVector = normalize(crossProduct(uv, nextForwardVector)); // a "right" vector, orthogonal to n and the lookup vector
        var nextVerticalVector = crossProduct(nextForwardVector, nextHorizontalVector); // resulting orthogonal vector to n and u, as the up vector isn't necessarily one anymore

        return ((currentVerticalVector[2] * nextVerticalVector[2]) < 0) &&
            (Math.abs(currentVerticalVector[0]) + Math.abs(nextVerticalVector[0])) > 1; // flipped from -1 to 1, not passing through 0
    }

    /**
     * Main update loop
     */
    function update() {

        try {
            updateMode_Target();
        } catch (e) {
            console.warn('ERROR updating');
        }

        requestAnimationFrame(update);
    }

    function updateMode_Target() {

        var cameraVelocity = [0, 0, 0];
        var cameraTargetVelocity = [0, 0, 0];

        if (isFollowingObjectTarget) {
            setTargetPositionToObject(selectedObjectKey);

            // move camera to preserve relative position to target
            var movement = add(cameraTargetPosition, negate(previousTargetPosition));
            if (movement[0] !== 0 || movement[1] !== 0 || movement[2] !== 0) {
                console.log(movement);
                cameraVelocity = add(cameraVelocity, movement);
            }
        }

        previousTargetPosition = [cameraTargetPosition[0], cameraTargetPosition[1], cameraTargetPosition[2]];

        // move camera to cameraPosition
        // look at cameraTargetPosition
        destinationCameraMatrix = lookAt(cameraPosition[0], cameraPosition[1], cameraPosition[2], cameraTargetPosition[0], cameraTargetPosition[1], cameraTargetPosition[2], 0, 1, 0);

        // move the cameraTargetPosition if you strafe

        // move the cameraPosition if you orbit

        var ev = cameraPosition; //[cameraX, cameraY, cameraZ];
        var cv = cameraTargetPosition; //[objX, objY, objZ];
        var uv = [0, 1, 0];

        // var forwardVector = normalize(add(ev, negate(cv))); // vector from the camera to the center point
        // var horizontalVector = normalize(crossProduct(uv, forwardVector)); // a "right" vector, orthogonal to n and the lookup vector
        // var verticalVector = crossProduct(forwardVector, horizontalVector); // resulting orthogonal vector to n and u, as the up vector isn't necessarily one anymore

        currentDistanceToTarget = magnitude(add(ev, negate(cv)));
        // console.log(distanceToCenter);
        // var upRotationVelocity = 0;

        var mCamera = destinationCameraMatrix; // translation is based on what direction you're facing,
        var vCamX = normalize([mCamera[0], mCamera[4], mCamera[8]]);
        var vCamY = normalize([mCamera[1], mCamera[5], mCamera[9]]);
        var vCamZ = normalize([mCamera[2], mCamera[6], mCamera[10]]);

        // var strafeSpeedMultiplier = 25;
        // var zoomSpeedMultiplier = 100;
        // var threshold = 0.1;

        cameraSpeed = 0.001; // 0.01;

        var forwardVector = normalize(add(ev, negate(cv))); // vector from the camera to the center point
        var horizontalVector = normalize(crossProduct(uv, forwardVector)); // a "right" vector, orthogonal to n and the lookup vector
        var verticalVector = crossProduct(forwardVector, horizontalVector); // resulting orthogonal vector to n and u, as the up vector isn't necessarily one anymore

        // stop following if you strafe away
        function deselectTarget() {
            if (isFollowingObjectTarget) {
                // objectDropdown.setText('Select Camera Target', true);
                objectDropdown.resetSelection();
            }
            isFollowingObjectTarget = false;
        }

        // update with keyboard
        if (!DEBUG_REMOVE_KEYBOARD_CONTROLS) {

            // move the cameraTargetPosition and the cameraPosition equally if you strafe
            if (keyStates[keyCodes.LEFT] === 'down') {
                let vector = scalarMultiply(horizontalVector, cameraSpeed * keyboardSpeedMultiplier.translation);
                cameraTargetVelocity = add(cameraTargetVelocity, vector);
                cameraVelocity = add(cameraVelocity, vector);
                deselectTarget();
            }
            if (keyStates[keyCodes.RIGHT] === 'down') {
                let vector = scalarMultiply(negate(horizontalVector), cameraSpeed * keyboardSpeedMultiplier.translation);
                cameraTargetVelocity = add(cameraTargetVelocity, vector);
                cameraVelocity = add(cameraVelocity, vector);
                deselectTarget();
            }
            if (keyStates[keyCodes.UP] === 'down') {
                let vector = scalarMultiply(verticalVector, cameraSpeed * keyboardSpeedMultiplier.translation);
                cameraTargetVelocity = add(cameraTargetVelocity, vector);
                cameraVelocity = add(cameraVelocity, vector);
                deselectTarget();
            }
            if (keyStates[keyCodes.DOWN] === 'down') {
                let vector = scalarMultiply(negate(verticalVector), cameraSpeed * keyboardSpeedMultiplier.translation);
                cameraTargetVelocity = add(cameraTargetVelocity, vector);
                cameraVelocity = add(cameraVelocity, vector);
                deselectTarget();
            }

            // move the cameraPosition if you orbit or move in/out
            if (keyStates[keyCodes.ONE] === 'down') { // zoom out
                let vector = scalarMultiply(forwardVector, cameraSpeed * keyboardSpeedMultiplier.scale);
                cameraVelocity = add(cameraVelocity, vector);
            }
            if (keyStates[keyCodes.TWO] === 'down') { // zoom in (only if you are far enough away)
                let vector = scalarMultiply(negate(forwardVector), cameraSpeed * keyboardSpeedMultiplier.scale);
                console.log(magnitude(vector), currentDistanceToTarget);
                if (magnitude(vector) < currentDistanceToTarget / 3) { // prevent you from zooming beyond it
                    cameraVelocity = add(cameraVelocity, vector);
                }
            }
        }

        if (keyStates[keyCodes.W] === 'down') {
            let vector = scalarMultiply(vCamY, cameraSpeed * keyboardSpeedMultiplier.rotation * (2 * Math.PI * currentDistanceToTarget));
            cameraVelocity = add(cameraVelocity, vector);
        }
        if (keyStates[keyCodes.S] === 'down') {
            let vector = scalarMultiply(negate(vCamY), cameraSpeed * keyboardSpeedMultiplier.rotation * (2 * Math.PI * currentDistanceToTarget));
            cameraVelocity = add(cameraVelocity, vector);
        }
        if (keyStates[keyCodes.A] === 'down') {
            let vector = scalarMultiply(vCamX, cameraSpeed * keyboardSpeedMultiplier.rotation * (2 * Math.PI * currentDistanceToTarget));
            cameraVelocity = add(cameraVelocity, vector);
        }
        if (keyStates[keyCodes.D] === 'down') {
            let vector = scalarMultiply(negate(vCamX), cameraSpeed * keyboardSpeedMultiplier.rotation * (2 * Math.PI * currentDistanceToTarget));
            cameraVelocity = add(cameraVelocity, vector);
        }
        
        if (unprocessedScrollDY !== 0) {
            
            // increase speed as distance increases
            let nonLinearFactor = 1.05; // closer to 1 = less intense log (bigger as distance bigger)
            let distanceMultiplier = Math.max(1, getBaseLog(nonLinearFactor, currentDistanceToTarget) / 100);
            
            let vector = scalarMultiply(forwardVector, cameraSpeed * distanceMultiplier * scrollWheelMultiplier * getCameraZoomSensitivity() * unprocessedScrollDY);

            // prevent you from zooming beyond it
            let isZoomingIn = unprocessedScrollDY < 0;
            if (isZoomingIn && currentDistanceToTarget <= magnitude(vector)) {
                // zoom in at most halfway to the origin if you're going to overshoot it
                let percentToClipBy = 0.5 * currentDistanceToTarget / magnitude(vector);
                vector = scalarMultiply(vector, percentToClipBy);
            }

            cameraVelocity = add(cameraVelocity, vector);

            unprocessedScrollDY = 0;
        }

        let distancePanFactor = currentDistanceToTarget / 1000; // speed when 1 meter units away, scales up w/ distance
        
        if (unprocessedMouseDX !== 0) {
            // pan if shift held down
            if (keyStates[keyCodes.SHIFT] === 'down') {
                // STRAFE LEFT-RIGHT
                let vector = scalarMultiply(horizontalVector, distancePanFactor * unprocessedMouseDX * getCameraPanSensitivity());
                cameraTargetVelocity = add(cameraTargetVelocity, vector);
                cameraVelocity = add(cameraVelocity, vector);
                deselectTarget();
            } else {
                // rotate otherwise 
                let vector = scalarMultiply(vCamX, cameraSpeed * getCameraRotateSensitivity() * (2 * Math.PI * currentDistanceToTarget) * unprocessedMouseDX);
                cameraVelocity = add(cameraVelocity, vector);
            }

            unprocessedMouseDX = 0;
        }

        if (unprocessedMouseDY !== 0) {
            // pan if shift held down
            if (keyStates[keyCodes.SHIFT] === 'down') {
                // STRAFE UP-DOWN
                let vector = scalarMultiply(verticalVector, distancePanFactor * unprocessedMouseDY * getCameraPanSensitivity());
                cameraTargetVelocity = add(cameraTargetVelocity, vector);
                cameraVelocity = add(cameraVelocity, vector);
                deselectTarget();
            } else {
                // rotate otherwise 
                let vector = scalarMultiply(vCamY, cameraSpeed * getCameraRotateSensitivity() * (2 * Math.PI * currentDistanceToTarget) * unprocessedMouseDY);
                cameraVelocity = add(cameraVelocity, vector);
            }

            unprocessedMouseDY = 0;
        }

        var threshold = 0.1;

        // GO FORWARD-BACKWARD
        if (typeof mouseMovement.translation !== 'undefined') {
            // zoom in-out
            if (Math.abs(mouseMovement.translation.y) >= threshold) {
                var forwardSpeed = -mouseMovement.translation.y;
                let vector = scalarMultiply(forwardVector, forwardSpeed * mouseSpeedMultiplier.scale);
                if (forwardSpeed > 0 || currentDistanceToTarget > 500) { // prevent you from zooming too close to it
                    cameraVelocity = add(cameraVelocity, vector);
                }
            }

            // STRAFE LEFT-RIGHT
            if (Math.abs(mouseMovement.translation.x) >= threshold) {
                var sideSpeed = -mouseMovement.translation.x;
                let vector = scalarMultiply(horizontalVector, sideSpeed * mouseSpeedMultiplier.translation);
                cameraTargetVelocity = add(cameraTargetVelocity, vector);
                cameraVelocity = add(cameraVelocity, vector);
                deselectTarget();
            }

            // STRAFE UP-DOWN
            if (Math.abs(mouseMovement.translation.z) >= threshold) {
                var upSpeed = -mouseMovement.translation.z;
                let vector = scalarMultiply(verticalVector, upSpeed * mouseSpeedMultiplier.translation);
                cameraTargetVelocity = add(cameraTargetVelocity, vector);
                cameraVelocity = add(cameraVelocity, vector);
                deselectTarget();
            }
        }

        if (typeof mouseMovement.rotation !== 'undefined') {

            // rotate left-right
            if (Math.abs(mouseMovement.rotation.z) >= threshold) {
                let rotationSpeed = mouseMovement.rotation.z;
                let vector = scalarMultiply(vCamX, rotationSpeed * mouseSpeedMultiplier.rotation * (2 * Math.PI * currentDistanceToTarget));
                cameraVelocity = add(cameraVelocity, vector);
            }

            // rotate up-down
            if (Math.abs(mouseMovement.rotation.x) >= threshold) {
                let rotationSpeed = mouseMovement.rotation.x;
                let vector = scalarMultiply(negate(vCamY), rotationSpeed * mouseSpeedMultiplier.rotation * (2 * Math.PI * currentDistanceToTarget));
                cameraVelocity = add(cameraVelocity, vector);
            }

        }

        var shouldMoveCamera = true;

        if (DEBUG_PREVENT_CAMERA_SINGULARITIES) {
            var isAboutToFlip = wouldCameraFlip(verticalVector, cameraVelocity, cameraTargetVelocity) || !DEBUG_PREVENT_CAMERA_SINGULARITIES;
            shouldMoveCamera = !isAboutToFlip; // prevent the camera from flipping when it's about to cross a singularity
        }

        if (shouldMoveCamera) {
            // TODO: limit velocity to at most bring you to +epsilon distance to target, instead of flipping world
            //  when you go through it / beyond it
            cameraPosition = add(cameraPosition, cameraVelocity);
            cameraTargetPosition = add(cameraTargetPosition, cameraTargetVelocity);
        }

        logMessage(prettyPrint(cameraPosition, 0) + ' -> ' + prettyPrint(cameraTargetPosition, 0) + ' (' +
        currentDistanceToTarget.toFixed(0) + ') ' + (isFollowingObjectTarget ? '(Following)' : '()'));

        // tween the matrix every frame to animate it to the new position
        let cameraNode = realityEditor.sceneGraph.getSceneNodeById('CAMERA');
        let currentCameraMatrix = realityEditor.gui.ar.utilities.copyMatrix(cameraNode.localMatrix);
        let newCameraMatrix = tweenMatrix(currentCameraMatrix, realityEditor.gui.ar.utilities.invertMatrix(destinationCameraMatrix), 0.3);
        realityEditor.sceneGraph.setCameraPosition(newCameraMatrix);

        // TODO ben: make sure groundplane matrix works on desktop
        // var rotatedGroundPlaneMatrix = [];
        //var rotation3d = makeRotationY(Math.PI/2);
        // realityEditor.gui.ar.utilities.multiplyMatrix(window.gpMat, realityEditor.gui.ar.draw.correctedCameraMatrix, rotatedGroundPlaneMatrix);
        //
        // realityEditor.gui.ar.draw.groundPlaneMatrix = rotatedGroundPlaneMatrix;
    }

    function getBaseLog(x, y) {
        return Math.log(y) / Math.log(x);
    }

    function prettyPrint(matrix, precision) {
        return '[ ' + matrix[0].toFixed(precision) + ', ' + matrix[1].toFixed(precision) + ', ' + matrix[2].toFixed(precision) + ']';
    }

    function tweenMatrix(currentMatrix, destination, tweenSpeed) {
        if (typeof tweenSpeed === 'undefined') { tweenSpeed = 0.5; } // default value

        if (currentMatrix.length !== destination.length) {
            console.warn('matrices are inequal lengths. cannot be tweened so just assigning current=destination');
            return realityEditor.gui.ar.utilities.copyMatrix(destination);
        }
        if (tweenSpeed <= 0 || tweenSpeed >= 1) {
            console.warn('tween speed should be between 0 and 1. cannot be tweened so just assigning current=destination');
            return realityEditor.gui.ar.utilities.copyMatrix(destination);
        }

        var m = [];
        for (var i = 0; i < currentMatrix.length; i++) {
            m[i] = destination[i] * tweenSpeed + currentMatrix[i] * (1.0 - tweenSpeed);
        }
        return m;
    }

    function getTargetPosition(targetObjectKey) {
        if (targetObjectKey === 'floatingPoint2000' || targetObjectKey === 'floatingPoint5000' || targetObjectKey === 'floatingPoint10000' || targetObjectKey === 'floatingPoint20000') {
            // figure out camera position and forward vector. choose a point distance D along the forward vector.
            var floatingPointDistance = parseInt(targetObjectKey.split('floatingPoint')[1]); // pulls out 2000, 5000, or 10000 from targetObjectKey
            var mCamera = destinationCameraMatrix;
            var vCamZ = normalize([mCamera[2], mCamera[6], mCamera[10]]); // this is the forward vector
            var relativePos = scalarMultiply(vCamZ, floatingPointDistance);
            var targetPos = add([cameraX, cameraY, cameraZ], negate(relativePos)); // not sure why it has to be negated, but flips camera otherwise
            return {
                x: targetPos[0],
                y: targetPos[1],
                z: targetPos[2]
            };
        }

        var targetPosition = realityEditor.sceneGraph.getWorldPosition(targetObjectKey);
        return {
            x: targetPosition.x,
            y: targetPosition.y,
            z: targetPosition.z
        };
    }

    function multiplyMatrixVector(M, v) {
        return [M[0] * v[0] + M[1] * v[1] + M[2] * v[2],
            M[3] * v[0] + M[4] * v[1] + M[5] * v[2],
            M[6] * v[0] + M[7] * v[1] + M[8] * v[2]];
    }

    /**
     * Adds keyboard listeners and initializes the camera matrix
     */
    function addCameraManipulationListeners() {

        console.log('add desktop camera keyboard, mouse, and 3d mouse controls');

        cameraTranslationMatrix = realityEditor.gui.ar.utilities.newIdentityMatrix();
        destinationCameraMatrix = realityEditor.gui.ar.utilities.newIdentityMatrix();

        // set up the keyStates map with default value of "up" for each key
        Object.keys(keyCodes).forEach(function(keyName) {
            keyStates[keyCodes[keyName]] = 'up';
        });

        // when a key is pressed down, automatically update that entry in keyStates
        // also freeze/pause if you pressed a relevant arrow key
        document.addEventListener('keydown', function(event) {
            event.preventDefault();
            var code = event.keyCode ? event.keyCode : event.which;
            if (keyStates.hasOwnProperty(code)) {
                keyStates[code] = 'down';
            }
        });

        // when a key is released, automatically update that entry in keyStates
        // also unfreeze/un-pause when the escape key is pressed
        document.addEventListener('keyup', function(event) {
            event.preventDefault();
            var code = event.keyCode ? event.keyCode : event.which;
            if (keyStates.hasOwnProperty(code)) {
                keyStates[code] = 'up';

                // reset when escape pressed
                if (code === keyCodes.ESCAPE) {
                    resetCamera();
                }
            }
        });

        var prevScrollTop = 0;
        var direction = 'neutral';
        document.addEventListener('scroll', function(event) {
            var newScrollTop = event.currentTarget.scrollingElement.scrollTop;

            if (direction !== 'up' && newScrollTop < 0) {
                direction = 'up';
            } else if (direction !== 'down' && newScrollTop > 0) {
                direction = 'down';
            }

            if (newScrollTop > prevScrollTop && direction === 'down') {
                cameraVelocityZ -= cameraSpeed * keyboardSpeedMultiplier.scale;
            } else if (newScrollTop < prevScrollTop && direction === 'up') {
                cameraVelocityZ += cameraSpeed * keyboardSpeedMultiplier.scale;
            }

            prevScrollTop = newScrollTop;
            event.preventDefault();
        });

        window.addEventListener("wheel", function(event) {
            let scrollAmount = event.deltaY;
            unprocessedScrollDY += scrollAmount;
            event.preventDefault();
        }, {passive: false}); // in order to call preventDefault, wheel needs to be active not passive

        document.addEventListener('pointerdown', function(event) {

            if (event.button === 2) { // right click, 0 is left, 1 is middle button
                console.log('right click 2');

                isMouseDown = true;
                firstX = event.pageX;
                firstY = event.pageY;
                lastX = event.pageX;
                lastY = event.pageY;

                unprocessedMouseMovements.push({
                    x: event.pageX - firstX,
                    y: event.pageY - firstY
                });
            }

            if (keyStates[keyCodes.SHIFT] !== 'down') { return; }

            console.log(event.currentTarget);

            var overlappingDivs = realityEditor.device.utilities.getAllDivsUnderCoordinate(event.pageX, event.pageY);

            var firstVisibleFrame = null;
            overlappingDivs.forEach(function(elt) {
                if (firstVisibleFrame) { return; }

                if (elt.classList.contains('visibleFrame')) {
                    firstVisibleFrame = elt;
                }
            });

            if (firstVisibleFrame) {
                var objectKey = firstVisibleFrame.getAttribute('data-object-key');
                console.log(objectKey);
                selectObject(objectKey);
            }
            
            // overlappingDivs.filter(function(elt) {
            //     return (typeof elt.parentNode.dataset.displayAfterTouch !== 'undefined');
            // }).forEach(function(elt) {
            //     elt.parentNode.style.display = 'none'; // TODO: instead of changing display, maybe just change pointerevents css to none
            // });

        });

        document.addEventListener('pointerup', function(event) {
            if (event.button !== 2) {
                return;
            }

            isMouseDown = false;
            unprocessedMouseMovements = [];
            lastX = 0;
            lastY = 0;
        });

        document.addEventListener('pointermove', function(event) {
            if (isMouseDown) {

                var xOffset = event.pageX - lastX;
                var yOffset = event.pageY - lastY;

                unprocessedMouseDX += xOffset;
                unprocessedMouseDY += yOffset;

                lastX = event.pageX;
                lastY = event.pageY;

                unprocessedMouseMovements.push({
                    x: event.pageX - firstX,
                    y: event.pageY - firstY
                });
            }
        });

        realityEditor.network.realtime.addDesktopSocketMessageListener('/mouse/transformation', function(msgContent) {
            // console.log('received 3d mouse data', msgContent);
            mouseMovement = msgContent;
        });
    }

    function resetCamera() {
        rotations = {};
        cameraX = 0; //-500; //-1500; //0;
        cameraY = 0; //-11673; //7639; //0;
        cameraZ = -7000; //13307; //-12993; //5000;
        cameraVelocityX = 0;
        cameraVelocityY = 0;
        cameraVelocityZ = 0;
        cameraPitch = 0;
        cameraRoll = 0;
        cameraYaw = 0;
        cameraTranslationMatrix = realityEditor.gui.ar.utilities.newIdentityMatrix();
        cameraRotationMatrix = realityEditor.gui.ar.utilities.newIdentityMatrix();
        // cameraUpVector = [0.058374143427579205, -0.9982947757947471, 0];
        // destinationCameraMatrix = realityEditor.gui.ar.utilities.newIdentityMatrix();

        // realityEditor.gui.ar.draw.correctedCameraMatrix = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 600, 200, -4750, 1];
        // destinationCameraMatrix = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 600, 200, -4750, 1];

        // realityEditor.gui.ar.draw.correctedCameraMatrix = [-0.9979047869606354,0.04357977057008431,-0.04782091339682644,0,0,0.7391224253723763,0.673571110063114,0,0.06469958393257225,0.6721598350903706,-0.7375738064290496,0,-7.3603317075507955e-62,1.8189894035458557e-12,-13467.956791262939,1];
        // destinationCameraMatrix = [-0.9979047869606354,0.04357977057008431,-0.04782091339682644,0,0,0.7391224253723763,0.673571110063114,0,0.06469958393257225,0.6721598350903706,-0.7375738064290496,0,-7.3603317075507955e-62,1.8189894035458557e-12,-13467.956791262939,1];

    }

    // Working look-at matrix generator (with a set of vector3 math functions)
    function lookAt( eyeX, eyeY, eyeZ, centerX, centerY, centerZ, upX, upY, upZ ) {
        var ev = [eyeX, eyeY, eyeZ];
        var cv = [centerX, centerY, centerZ];
        var uv = [upX, upY, upZ];

        var n = normalize(add(ev, negate(cv))); // vector from the camera to the center point
        var u = normalize(crossProduct(uv, n)); // a "right" vector, orthogonal to n and the lookup vector
        var v = crossProduct(n, u); // resulting orthogonal vector to n and u, as the up vector isn't necessarily one anymore

        return [u[0], v[0], n[0], 0,
            u[1], v[1], n[1], 0,
            u[2], v[2], n[2], 0,
            dotProduct(negate(u), ev), dotProduct(negate(v), ev), dotProduct(negate(n), ev), 1];
    }

    function scalarMultiply(A, x) {
        return [A[0] * x, A[1] * x, A[2] * x];
    }

    function negate(A) {
        return [-A[0], -A[1], -A[2]];
    }

    function add(A, B) {
        return [A[0] + B[0], A[1] + B[1], A[2] + B[2]];
    }

    function magnitude(A) {
        return Math.sqrt(A[0] * A[0] + A[1] * A[1] + A[2] * A[2]);
    }

    function normalize(A) {
        var mag = magnitude(A);
        return [A[0] / mag, A[1] / mag, A[2] / mag];
    }

    function crossProduct(A, B) {
        var a = A[1] * B[2] - A[2] * B[1];
        var b = A[2] * B[0] - A[0] * B[2];
        var c = A[0] * B[1] - A[1] * B[0];
        return [a, b, c];
    }

    function dotProduct(A, B) {
        return A[0] * B[0] + A[1] * B[1] + A[2] * B[2];
    }

    realityEditor.addons.addCallback('init', initService);
})();

    var gp_makeRotationX = function ( theta ) {
        var c = Math.cos( theta ), s = Math.sin( theta );
        return [1, 0, 0, 0,
                0, c, - s, 0,
                0, s, c, 0,
                0, 0, 0, 1];
    };

    var gp_makeRotationY = function ( theta ) {
        var c = Math.cos( theta ), s = Math.sin( theta );
        return [c, 0, s, 0,
                0, 1, 0, 0,
                -s, 0, c, 0,
                0, 0, 0, 1];
    };

    var gp_makeRotationZ = function ( theta ) {
        var c = Math.cos( theta ), s = Math.sin( theta );
        return [c, -s, 0, 0,
                s, c, 0, 0,
                0, 0, 1, 0,
                0, 0, 0, 1];
    };

    window.gpMat = gp_makeRotationY(0);
