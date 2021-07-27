/*
* Copyright © 2021 PTC
*/

createNameSpace('realityEditor.device');

(function(exports) {

    class VirtualCamera {
        constructor(cameraNode, kTranslation, kRotation, kScale, initialPosition) {
            this.cameraNode = cameraNode;
            this.projectionMatrix = [];
            this.position = [0,0,0];
            if (typeof initialPosition !== 'undefined') {
                this.position = [initialPosition[0], initialPosition[1], initialPosition[2]];
            }
            this.targetPosition = [1,0,0];
            this.distanceToTarget = 1;
            this.speedFactors = {
                translation: kTranslation || 1,
                rotation: kRotation || 1,
                scale: kScale || 1
            }
            this.mouseInput = {
                unprocessedDX: 0,
                unprocessedDY: 0,
                unprocessedScroll: 0,
                isPointerDown: false,
                isRightClick: false,
                first: { x: 0, y: 0 },
                last: { x: 0, y: 0 }
            }
            this.keyboard = new realityEditor.device.KeyboardListener();
            this.followingState = false;
            this.addEventListeners();
        }
        addEventListeners() {
            window.addEventListener("wheel", function(event) {
                this.mouseInput.unprocessedScroll += event.deltaY;
                event.preventDefault();
            }.bind(this), {passive: false}); // in order to call preventDefault, wheel needs to be active not passive

            document.addEventListener('pointerdown', function(event) {
                if (event.button === 2) { // 2 is right click, 0 is left, 1 is middle button
                    this.mouseInput.isPointerDown = true;
                    this.mouseInput.isRightClick = true;
                    this.mouseInput.first.x = event.pageX;
                    this.mouseInput.first.y = event.pageY;
                    this.mouseInput.last.x = event.pageX;
                    this.mouseInput.last.y = event.pageY;
                }

                if (this.keyboard.keyStates[this.keyboard.keyCodes.SHIFT] !== 'down') { return; }

                this.attemptToFollowClickedElement(event.pageX, event.pageY);
            }.bind(this));

            // TODO: do this for pointercancel, too
            document.addEventListener('pointerup', function(event) {
                this.mouseInput.isPointerDown = false;
                this.mouseInput.isRightClick = false;
                this.mouseInput.last.x = 0;
                this.mouseInput.last.y = 0;
            }.bind(this));

            document.addEventListener('pointermove', function(event) {
                if (this.mouseInput.isPointerDown) {

                    let xOffset = event.pageX - this.mouseInput.last.x;
                    let yOffset = event.pageY - this.mouseInput.last.y;

                    this.mouseInput.unprocessedDX += xOffset;
                    this.mouseInput.unprocessedDY += yOffset;

                    this.mouseInput.last.x = event.pageX;
                    this.mouseInput.last.y = event.pageY;
                }
            }.bind(this));

            this.keyboard.onKeyUp(function(code) {
                // reset when escape pressed
                if (code === this.keyboard.keyCodes.ESCAPE) {
                    this.reset();
                }
            }.bind(this));
        }
        reset() {
            console.log('TODO: implement reset');
        }
        attemptToFollowClickedElement(mouseX, mouseY) {
            let overlappingDivs = realityEditor.device.utilities.getAllDivsUnderCoordinate(mouseX, mouseY);

            let firstVisibleFrame = null;
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
                this.selectObject(frameKey);
            }
        }
        selectObject(key) {
            console.log('TODO: implement virtualCamera.selectObject()', key);
        }
        deselectTarget() {
            // if (isFollowingObjectTarget) {
            //     // objectDropdown.setText('Select Camera Target', true);
            //     objectDropdown.resetSelection();
            // }
            // isFollowingObjectTarget = false;
        }
        adjustEnvVars(distanceToTarget) {
            if (distanceToTarget < 3000) {
                realityEditor.device.environment.variables.newFrameDistanceMultiplier = 6;
            } else if (distanceToTarget < 12000) {
                realityEditor.device.environment.variables.newFrameDistanceMultiplier = 6 * (distanceToTarget / 3000);
            } else {
                realityEditor.device.environment.variables.newFrameDistanceMultiplier = 6 * (4);
            }
        }
        updateFollowing() {
            // TODO: reimplement following
        }
        stopFollowing() {
            // TODO: stop following
        }

        // this needs to be called externally each frame that you want it to update
        update() {
            let cameraVelocity = [0, 0, 0];
            let cameraTargetVelocity = [0, 0, 0];

            if (this.followingState) {
                this.updateFollowing();
            } else {
                this.stopFollowing();
            }

            let previousTargetPosition = [this.targetPosition[0], this.targetPosition[1], this.targetPosition[2]];
            // move camera to cameraPosition and look at cameraTargetPosition
            let destinationCameraMatrix = lookAt(this.position[0], this.position[1], this.position[2], this.targetPosition[0], this.targetPosition[1], this.targetPosition[2], 0, 1, 0);

            let ev = this.position;
            let cv = this.targetPosition;
            let uv = [0, 1, 0];

            this.distanceToTarget = magnitude(add(ev, negate(cv)));
            this.adjustEnvVars(this.distanceToTarget);

            let mCamera = destinationCameraMatrix; // translation is based on what direction you're facing,
            let vCamX = normalize([mCamera[0], mCamera[4], mCamera[8]]);
            let vCamY = normalize([mCamera[1], mCamera[5], mCamera[9]]);
            let _vCamZ = normalize([mCamera[2], mCamera[6], mCamera[10]]);

            let forwardVector = normalize(add(ev, negate(cv))); // vector from the camera to the center point
            let horizontalVector = normalize(crossProduct(uv, forwardVector)); // a "right" vector, orthogonal to n and the lookup vector
            let verticalVector = crossProduct(forwardVector, horizontalVector); // resulting orthogonal vector to n and u, as the up vector isn't necessarily one anymore

            if (this.mouseInput.unprocessedScroll !== 0) {
                // increase speed as distance increases
                let nonLinearFactor = 1.05; // closer to 1 = less intense log (bigger as distance bigger)
                let distanceMultiplier = Math.max(1, getBaseLog(nonLinearFactor, this.distanceToTarget) / 100);

                let vector = scalarMultiply(forwardVector, distanceMultiplier * this.speedFactors.scale * getCameraZoomSensitivity() * this.mouseInput.unprocessedScroll);

                // prevent you from zooming beyond it
                let isZoomingIn = this.mouseInput.unprocessedScroll < 0;
                if (isZoomingIn && this.distanceToTarget <= magnitude(vector)) {
                    // zoom in at most halfway to the origin if you're going to overshoot it
                    let percentToClipBy = 0.5 * this.distanceToTarget / magnitude(vector);
                    vector = scalarMultiply(vector, percentToClipBy);
                }

                cameraVelocity = add(cameraVelocity, vector);
                this.deselectTarget();

                this.mouseInput.unprocessedScroll = 0; // reset now that data is processed
            }

            let distancePanFactor = Math.max(1, this.distanceToTarget / 1000); // speed when 1 meter units away, scales up w/ distance
            let isShiftDown = this.keyboard.keyStates[this.keyboard.keyCodes.SHIFT] === 'down';

            if (this.mouseInput.unprocessedDX !== 0) {
                if (isShiftDown) { // stafe left-right
                    let vector = scalarMultiply(negate(horizontalVector), distancePanFactor * this.speedFactors.translation * this.mouseInput.unprocessedDX * getCameraPanSensitivity());
                    cameraTargetVelocity = add(cameraTargetVelocity, vector);
                    cameraVelocity = add(cameraVelocity, vector);
                    this.deselectTarget();
                } else { // rotate
                    let vector = scalarMultiply(negate(vCamX), this.speedFactors.rotation * getCameraRotateSensitivity() * (2 * Math.PI * this.distanceToTarget) * this.mouseInput.unprocessedDX);
                    cameraVelocity = add(cameraVelocity, vector);
                    this.deselectTarget();
                }

                this.mouseInput.unprocessedDX = 0;
            }

            if (this.mouseInput.unprocessedDY !== 0) {
                if (isShiftDown) { // stafe up-down
                    let vector = scalarMultiply(verticalVector, distancePanFactor * this.speedFactors.translation * this.mouseInput.unprocessedDY * getCameraPanSensitivity());
                    cameraTargetVelocity = add(cameraTargetVelocity, vector);
                    cameraVelocity = add(cameraVelocity, vector);
                    this.deselectTarget();
                } else { // rotate
                    let vector = scalarMultiply(vCamY, this.speedFactors.rotation * getCameraRotateSensitivity() * (2 * Math.PI * this.distanceToTarget) * this.mouseInput.unprocessedDY);
                    cameraVelocity = add(cameraVelocity, vector);
                    this.deselectTarget();
                }

                this.mouseInput.unprocessedDY = 0;
            }

            // TODO: add back keyboard controls
            // TODO: add back 6D mouse controls

            // TODO: debug/prevent camera singularities

            this.position = add(this.position, cameraVelocity);
            this.targetPosition = add(this.targetPosition, cameraTargetVelocity);

            // tween the matrix every frame to animate it to the new position
            // let cameraNode = realityEditor.sceneGraph.getSceneNodeById('CAMERA');
            let currentCameraMatrix = realityEditor.gui.ar.utilities.copyMatrix(this.cameraNode.localMatrix);
            let newCameraMatrix = tweenMatrix(currentCameraMatrix, realityEditor.gui.ar.utilities.invertMatrix(destinationCameraMatrix), 0.3);
            // realityEditor.sceneGraph.setCameraPosition(newCameraMatrix);
            this.cameraNode.setLocalMatrix(newCameraMatrix);
        }
    }

    //************************************************ Utilities *************************************************//

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

    function multiplyMatrixVector(M, v) {
        return [M[0] * v[0] + M[1] * v[1] + M[2] * v[2],
            M[3] * v[0] + M[4] * v[1] + M[5] * v[2],
            M[6] * v[0] + M[7] * v[1] + M[8] * v[2]];
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

    function getCameraZoomSensitivity() {
        return Math.max(0.01, realityEditor.gui.settings.toggleStates.cameraZoomSensitivity || 0.5);
    }

    function getCameraPanSensitivity() {
        return Math.max(0.01, realityEditor.gui.settings.toggleStates.cameraPanSensitivity || 0.5);
    }

    function getCameraRotateSensitivity() {
        return Math.max(0.01, realityEditor.gui.settings.toggleStates.cameraRotateSensitivity || 0.5);
    }

    exports.VirtualCamera = VirtualCamera;
})(realityEditor.device);