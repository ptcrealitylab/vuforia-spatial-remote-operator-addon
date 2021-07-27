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

(function() {

  // desk
  // var cameraPosition = [757, 1410, -956]; //[735, -1575, -162]; //[1000, -500, 500];
  // var cameraTargetPosition = [583, -345, 2015];
  // var cameraPosition = [330, 3751, -1575]; //[735, -1575, -162]; //[1000, -500, 500];
  // var cameraTargetPosition = [14, -180, 1611];

  // lab table
  var cameraPosition = [-1499.9648912671637, 8275.552791086136, 5140.3791620707225];
  // var cameraTargetPosition = [-5142.168341070036, 924.9535037677615, -1269.0232578867729];

  // lab desk
  // var cameraPosition = [7066.684466616695, 3344.0095575328837, -4973.6206380271005];
  // var cameraTargetPosition = [3551.6304646761555, 1499.0868827846332, -4285.2567421747035];

  // kitchen
  //   var cameraPosition = [-3127, 3732, -3493]; //[735, -1575, -162]; //[1000, -500, 500];
  //   var cameraTargetPosition = [-339, 988, -4633];

  // bedroom
    // var cameraPosition = [1800, 7300, -5300]; //[735, -1575, -162]; //[1000, -500, 500];

    var cameraTargetPosition = [0, 0, 0];

    var previousTargetPosition = [0, 0, 0];
    var isFollowingObjectTarget = false;

    // this is the final camera matrix that will be computed from lookAt(cameraPosition, cameraTargetPosition)
    var destinationCameraMatrix = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];

    var targetOnLoad = window.localStorage.getItem('selectedObjectKey');

    var DEBUG_SHOW_LOGGER = false;
    var closestObjectLog = null; // if DEBUG_SHOW_LOGGER, this will be a text field

    /**
     * @type {Dropdown} - DOM element to choose which object to target for the camera
     */
    var objectDropdown;
    var selectedObjectKey = null;

    // polyfill for requestAnimationFrame to provide a smooth update loop
    var requestAnimationFrame = window.requestAnimationFrame ||
        window.webkitRequestAnimationFrame || function(cb) {setTimeout(cb, 17);};

    /* ----------------------------------------------------------------------- */

    /* ------------- keep track of mouse and scroll wheel movement ----------- */
    var firstX = 0;
    var firstY = 0;
    var lastX = 0;
    var lastY = 0;
    var isMouseDown = false;
    var unprocessedMouseMovements = [];
    let unprocessedScrollDY = 0;
    let unprocessedMouseDX = 0;
    let unprocessedMouseDY = 0;

    // this is used for 6D mouse controls
    var mouseMovement = {};
    /* ----------------------------------------------------------------------- */

    let virtualCamera;
    let keyboard;

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

        let cameraNode = realityEditor.sceneGraph.getSceneNodeById('CAMERA');
        virtualCamera = new realityEditor.device.VirtualCamera(cameraNode, 1, 0.001, 10, cameraPosition);
        update();

        // disable right-click context menu so we can use right-click to rotate camera
        document.addEventListener('contextmenu', event => event.preventDefault());

        try {
            addSensitivitySlidersToMenu();
        } catch (e) {
            console.warn('Slider components for settings menu not available, skipping', e);
        }

        createObjectSelectionDropdown();
        // addCameraManipulationListeners();

        keyboard = new realityEditor.device.KeyboardListener();

        if (DEBUG_DISABLE_DROPDOWNS) {
            if (objectDropdown) {
                if (objectDropdown.dom.style.display !== 'none') {
                    objectDropdown.dom.style.display = 'none';
                }
            }
        } else {
            keyboard.onKeyUp(function (code) {
                // reset when escape pressed
                if (code === keyboard.keyCodes.V) {
                    if (objectDropdown) {
                        if (objectDropdown.dom.style.display !== 'none') {
                            objectDropdown.dom.style.display = 'none';
                        } else {
                            objectDropdown.dom.style.display = '';
                        }
                    }
                }
            }.bind(this));
        }

        if (DEBUG_SHOW_LOGGER) {
            closestObjectLog = document.createElement('div');
            closestObjectLog.style.position = 'absolute';
            closestObjectLog.style.left = 0;
            closestObjectLog.style.top = 0;
            closestObjectLog.style.fontFamily = 'sans-serif';
            closestObjectLog.style.color = 'cyan';
            document.body.appendChild(closestObjectLog);
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

            // objectDropdown.addSelectable('floatingPoint2000', 'Floating Point (2m)');
            // objectDropdown.addSelectable('floatingPoint5000', 'Floating Point (5m)');
            // objectDropdown.addSelectable('floatingPoint10000', 'Floating Point (10m)');
            // objectDropdown.addSelectable('floatingPoint20000', 'Floating Point (20m)');

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

        window.localStorage.setItem('selectedObjectKey', objectKey);
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

        // try {
        //     updateMode_Target();
        // } catch (e) {
        //     console.warn('ERROR updating');
        // }

        if (virtualCamera) {
            virtualCamera.update();
        }

        requestAnimationFrame(update);
    }

    let cameraFollowerElementId = null;

    /**
     * Adds keyboard listeners and initializes the camera matrix
     */
    function addCameraManipulationListeners() {

        console.log('add desktop camera keyboard, mouse, and 3d mouse controls');

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
                // var objectKey = firstVisibleFrame.getAttribute('data-object-key');
                // console.log(objectKey);
                // selectObject(objectKey);

                var frameKey = firstVisibleFrame.getAttribute('data-frame-key');
                console.log(frameKey);
                selectObject(frameKey);
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
        // all that's needed to fully reset the camera is to set its location and what it's looking at
        // cameraPosition = [1800, 7300, -5300];
        // cameraTargetPosition = [0, 0, 0];

      // desk
      var cameraPosition = [-3127, 3732, -3493]; //[735, -1575, -162]; //[1000, -500, 500];
      var cameraTargetPosition = [-339, 988, -4633];

      // deselectTarget();
      if (isFollowingObjectTarget) {
        // objectDropdown.setText('Select Camera Target', true);
        objectDropdown.resetSelection();
      }
      isFollowingObjectTarget = false;

      // reset target follower
      if (cameraFollowerElementId) {
        realityEditor.sceneGraph.removeElementAndChildren(cameraFollowerElementId);
        cameraFollowerElementId = null;
      }

      // follow the person from current position
        // get the first human object
        let humanObjects = realityEditor.humanObjects.getHumanObjects();
        if (Object.keys(humanObjects).length > 0) {
          selectedObjectKey = Object.keys(humanObjects)[0];

          setTargetPositionToObject(selectedObjectKey);
        }
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
