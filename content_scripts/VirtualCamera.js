/*
* Copyright © 2021 PTC
*/

createNameSpace('realityEditor.device');

import * as THREE from '../../thirdPartyCode/three/three.module.js';

(function(exports) {

    const FOLLOWING_RELATIVE_POSITION = [
        -1.991735742789964, -0.0019402862384033104, 0.1816275024820606, 0,
        -0.12091535927151742, -1.4781942937095942, -1.3417622677709533, 0,
        0.1355399071070364, -1.3471959077679534, 1.4719672222377786, 0,
        1033.3310890578132, -10300.982745528603, 12136.112553930248, 0.9999999999999998
    ];

    const THIRD_PERSON_FOLLOW = [0.3948297800489131, 0.7550329823511126, 0.5234836880620531, 0,
        0.9134077373584234, -0.3839629897627356, -0.13512492764589737, 0,
        0.09897390496442003, 0.5315057665562919, -0.8412528042757477, 0,
        598.0929462431984, 1461.9560097023732, -3530.857824661904, 0.9999999999999997];

    const DISPLAY_PERSPECTIVE_CUBES = false;

    class VirtualCamera {
        constructor(cameraNode, kTranslation, kRotation, kScale, initialPosition, isDemoVersion, floorOffset) {
            if (!cameraNode) { console.warn('cameraNode is undefined!'); }

            this.cameraNode = cameraNode;
            this.projectionMatrix = [];
            this.idleOrbitting = false;

            this.initialPosition = [0, 0, 0];
            this.position = [1, 1, 1];
            if (typeof initialPosition !== 'undefined') {
                this.initialPosition = [initialPosition[0], initialPosition[1], initialPosition[2]];
                this.position = [initialPosition[0], initialPosition[1], initialPosition[2]];
            }
            this.targetPosition = [0, 0, 0];
            this.velocity = [0, 0, 0];
            this.targetVelocity = [0, 0, 0];
            this.distanceToTarget = 1;
            this.preRotateDistanceToTarget = null;
            this.speedFactors = {
                translation: kTranslation || 1,
                rotation: kRotation || 1,
                scale: kScale || 1
            };
            this.mouseInput = {
                unprocessedDX: 0,
                unprocessedDY: 0,
                unprocessedScroll: 0,
                isPointerDown: false,
                isRightClick: false,
                isStrafeRequested: false,
                first: { x: 0, y: 0 },
                last: { x: 0, y: 0 }
            };
            this.keyboard = new realityEditor.device.KeyboardListener();
            this.followerName = 'cameraFollower' + cameraNode.id;
            this.followingState = {
                active: false,
                selectedId: null,
                virtualizerId: null,
                followerElementId: null,
                isFirstPerson: false,
                isThirdPerson: false,
                threejsObject: null,
                followInfo: null,
                currentFollowingDistance: 0,
                currentlyRendering2DVideo: false
                // threejsTargetObject: null
            };
            if (typeof isDemoVersion !== 'undefined') {
                this.isDemoVersion = isDemoVersion;
            }
            this.callbacks = {
                onPanToggled: [],
                onRotateToggled: [],
                onScaleToggled: []
            };
            this.addEventListeners();

            this.threeJsContainer = new THREE.Group();
            this.threeJsContainer.name = 'VirtualCamera_' + cameraNode.id + '_threeJsContainer';
            this.threeJsContainer.position.y = -floorOffset;
            this.threeJsContainer.rotation.x = Math.PI / 2;
            realityEditor.gui.threejsScene.addToScene(this.threeJsContainer); // , {worldObjectId: realityEditor.worldObjects.getBestWorldObject().objectId}
        }
        addEventListeners() {

            let scrollTimeout = null;
            window.addEventListener('wheel', function(event) {
                this.mouseInput.unprocessedScroll += event.deltaY;
                event.preventDefault();

                // update scale callbacks based on whether you've scrolled in this 150ms time period
                this.triggerScaleCallbacks(true);
                this.preRotateDistanceToTarget = null; // if we rotate and scroll, don't lock zoom to pre-rotate level

                if (scrollTimeout !== null) {
                    clearTimeout(scrollTimeout);
                }
                scrollTimeout = setTimeout(function() {
                    this.triggerScaleCallbacks(false);
                    this.preRotateDistanceToTarget = null;

                }.bind(this), 150);
            }.bind(this), {passive: false}); // in order to call preventDefault, wheel needs to be active not passive

            document.addEventListener('pointerdown', function (event) {
                if (event.button === 2 || event.button === 1) { // 2 is right click, 0 is left, 1 is middle button
                    this.mouseInput.isPointerDown = true;
                    this.mouseInput.isRightClick = false;
                    this.mouseInput.isStrafeRequested = false;
                    if (event.button === 1 || this.keyboard.keyStates[this.keyboard.keyCodes.ALT] === 'down') {
                        this.mouseInput.isStrafeRequested = true;
                        this.triggerPanCallbacks(true);
                    } else if (event.button === 2) {
                        this.mouseInput.isRightClick = true;
                        this.triggerRotateCallbacks(true);
                        this.preRotateDistanceToTarget = this.distanceToTarget;
                    }
                    this.mouseInput.first.x = event.pageX;
                    this.mouseInput.first.y = event.pageY;
                    this.mouseInput.last.x = event.pageX;
                    this.mouseInput.last.y = event.pageY;
                    // follow a tool if you click it with shift held down
                } else if (this.keyboard.keyStates[this.keyboard.keyCodes.SHIFT] === 'down') {
                    this.attemptToFollowClickedElement(event.pageX, event.pageY);
                }

            }.bind(this));

            const pointerReset = () => {
                this.mouseInput.isPointerDown = false;
                this.mouseInput.isRightClick = false;
                this.mouseInput.isStrafeRequested = false;
                this.mouseInput.last.x = 0;
                this.mouseInput.last.y = 0;

                if (this.preRotateDistanceToTarget !== null) {
                    // console.log(this.preRotateDistanceToTarget, this.distanceToTarget);
                    this.zoomBackToPreRotateLevel();
                    this.preRotateDistanceToTarget = null;
                }

                this.triggerPanCallbacks(false);
                this.triggerRotateCallbacks(false);
                this.triggerScaleCallbacks(false);
            };

            document.addEventListener('pointerup', pointerReset);
            document.addEventListener('pointercancel', pointerReset);

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
        }
        reset() {
            this.stopFollowing();
            this.position = [this.initialPosition[0], this.initialPosition[1], this.initialPosition[2]];
            this.targetPosition = [0, 0, 0];

            // TODO: reset selection / de-select target
            // // deselectTarget();
            // if (isFollowingObjectTarget) {
            //     // objectDropdown.setText('Select Camera Target', true);
            //     objectDropdown.resetSelection();
            // }
            // isFollowingObjectTarget = false;

            // TODO: reset follower element
            // // reset target follower
            // if (cameraFollowerElementId) {
            //     realityEditor.sceneGraph.removeElementAndChildren(cameraFollowerElementId);
            //     cameraFollowerElementId = null;
            // }
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
            if (key && realityEditor.sceneGraph.getSceneNodeById(key)) {
                this.followingState.active = true;
                this.followingState.selectedId = key;
            } else {
                this.deselectTarget();
            }
        }
        deselectTarget() {
            this.followingState.active = false;
            this.followingState.selectedId = null;
            // if (isFollowingObjectTarget) {
            //     // objectDropdown.setText('Select Camera Target', true);
            //     objectDropdown.resetSelection();
            // }
            this.stopFollowing();
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
        follow(sceneNodeToFollow, virtualizerId, followInfo) {
            this.followingState.active = true;
            this.followingState.virtualizerId = virtualizerId;
            this.followingState.selectedId = sceneNodeToFollow.id;
            // this.followingState.isFirstPerson = true;
            // this.followingState.isThirdPerson = false;
            this.followingState.followInfo = followInfo;
            this.followingState.currentFollowingDistance = followInfo.distanceToCamera; // can adjust with scroll wheel
            this.followingState.currentlyRendering2DVideo = followInfo.render2DVideo;
            
            this.updateParametricTargetAndPosition(this.followingState.currentFollowingDistance);
        }
        // follow1stPerson(sceneNodeToFollow) {
        //     console.log('follow 1st person', sceneNodeToFollow);
        //     this.followingState.active = true;
        //     this.followingState.selectedId = sceneNodeToFollow.id;
        //     this.followingState.isFirstPerson = true;
        //     this.followingState.isThirdPerson = false;
        // }
        // follow3rdPerson(sceneNodeToFollow) {
        //     console.log('follow 3rd person', sceneNodeToFollow);
        //     this.followingState.active = true;
        //     this.followingState.selectedId = sceneNodeToFollow.id;
        //     this.followingState.isFirstPerson = false;
        //     this.followingState.isThirdPerson = true;
        // }
        // stopFollowing() {
        //     console.log('stop following');
        // }
        updateFollowing() {
            let targetPosition = realityEditor.sceneGraph.getWorldPosition(this.followingState.selectedId);
            if (!targetPosition) { this.stopFollowing(); return; }

            let info = this.followingState.followInfo;
            if (!info) { return; }

            let minDist = realityEditor.device.desktopCamera.MIN_DIST_TO_CAMERA;
            // create any missing Three.js objects for the current perspective
            if (!this.followingState.threejsObject) {
                this.followingState.threejsObject = new THREE.Group();
                this.followingState.threejsObject.name = 'followingElementGroup';
                this.followingState.threejsObject.matrixAutoUpdate = false;
                this.followingState.threejsObject.visible = DISPLAY_PERSPECTIVE_CUBES;
                this.threeJsContainer.add(this.followingState.threejsObject);

                let obj = new THREE.Mesh(new THREE.BoxGeometry(20, 20, 20), new THREE.MeshBasicMaterial({color: '#ff0000'}));
                obj.name = 'parametricPositionObject';
                let z = -this.followingState.currentFollowingDistance;
                let y = -1500 * ((z+minDist) / 3000) * ((z+minDist) / 3000); // camera is positioned along a quadratic curve behind the camera
                obj.position.set(0, y, z);
                obj.matrixWorldNeedsUpdate = true;
                obj.visible = DISPLAY_PERSPECTIVE_CUBES;
                this.followingState.threejsObject.add(obj);
                
                let target = new THREE.Mesh(new THREE.BoxGeometry(20, 20, 20), new THREE.MeshBasicMaterial({color: '#ff0000'}));
                target.name = 'parametricTargetObject';
                z = 1500 * (10000 / ((this.followingState.currentFollowingDistance-minDist) + 2000)); // target distance decreases hyperbolically as camera distance increases
                target.position.set(0, 0, z);
                target.matrixWorldNeedsUpdate = true;
                target.visible = DISPLAY_PERSPECTIVE_CUBES;
                this.followingState.threejsObject.add(target);
            }

            if (!info.threejsPositionObject) {
                let obj = new THREE.Mesh(new THREE.BoxGeometry(20, 20, 20), new THREE.MeshBasicMaterial({color: info.debugColor}));
                obj.name = info.name + 'PositionObject';
                let z = -info.distanceToCamera;
                let y = -1500 * ((z+minDist) / 3000) * ((z + minDist) / 3000); // camera is positioned along a quadratic curve behind the camera
                obj.position.set(0, y, z);
                // obj.position.set(info.positionRelativeToCamera[0], info.positionRelativeToCamera[1], info.positionRelativeToCamera[2]);
                obj.matrixWorldNeedsUpdate = true;
                obj.visible = DISPLAY_PERSPECTIVE_CUBES;
                this.followingState.threejsObject.add(obj);
                this.followingState.followInfo.threejsPositionObject = obj;
            }

            if (!info.threejsTargetObject) {
                let obj = new THREE.Mesh(new THREE.BoxGeometry(20, 20, 20), new THREE.MeshBasicMaterial({color: info.debugColor}));
                obj.name = info.name + 'TargetObject';
                let z = 1500 * (10000 / ((info.distanceToCamera-minDist) + 2000)); // target distance decreases hyperbolically as camera distance increases
                obj.position.set(0, 0, z);
                // obj.position.set(info.targetRelativeToCamera[0], info.targetRelativeToCamera[1], info.targetRelativeToCamera[2]);
                obj.matrixWorldNeedsUpdate = true;
                obj.visible = DISPLAY_PERSPECTIVE_CUBES;
                this.followingState.threejsObject.add(obj);
                this.followingState.followInfo.threejsTargetObject = obj;
            }

            if (!realityEditor.sceneGraph.getVisualElement(this.followerName)) {
                let selectedNode = realityEditor.sceneGraph.getSceneNodeById(this.followingState.selectedId);
                let relativeToTarget = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
                this.followingState.followerElementId = realityEditor.sceneGraph.addVisualElement(this.followerName, selectedNode, null, relativeToTarget);
                realityEditor.sceneGraph.calculateFinalMatrices([]); // recompute scenegraph immediately
            }
            
            let selectedNode = realityEditor.sceneGraph.getSceneNodeById(this.followingState.selectedId);
            realityEditor.gui.threejsScene.setMatrixFromArray(this.followingState.threejsObject.matrix, selectedNode.worldMatrix);

            // let positionObject = realityEditor.gui.threejsScene.getObjectByName(info.name + 'PositionObject');
            // let targetObject = realityEditor.gui.threejsScene.getObjectByName(info.name + 'TargetObject');

            let positionObject = realityEditor.gui.threejsScene.getObjectByName('parametricPositionObject');
            let targetObject = realityEditor.gui.threejsScene.getObjectByName('parametricTargetObject');

            if (positionObject.matrixWorldNeedsUpdate || targetObject.matrixWorldNeedsUpdate) {
                return; // irrecoverable error in camera position if we continue before Three.js computes the matrixWorld of the new objects
            }

            let targetModelView = targetObject.matrixWorld.clone();
            let positionModelView = positionObject.matrixWorld.clone();

            // multiply target and position matrices by inverse view matrix (just the camera matrix) to convert modelView into model
            let cameraMatrix = new realityEditor.gui.threejsScene.THREE.Matrix4();
            realityEditor.gui.threejsScene.setMatrixFromArray(cameraMatrix, realityEditor.sceneGraph.getCameraNode().worldMatrix);
            targetModelView.premultiply(cameraMatrix);
            positionModelView.premultiply(cameraMatrix);

            let newPosVec = [positionModelView.elements[12], positionModelView.elements[13], positionModelView.elements[14]];
            let newTargetPosVec = [targetModelView.elements[12], targetModelView.elements[13], targetModelView.elements[14]];

            let movement = add(newPosVec, negate(this.position));
            if (movement[0] !== 0 || movement[1] !== 0 || movement[2] !== 0) {
                this.velocity = add(this.velocity, movement);
            }

            let targetMovement = add(newTargetPosVec, negate(this.targetPosition));
            if (targetMovement[0] !== 0 || targetMovement[1] !== 0 || targetMovement[2] !== 0) {
                this.targetVelocity = add(this.targetVelocity, targetMovement);
            }
        }
        stopFollowing() {
            if (this.followingState.followerElementId) {
                realityEditor.sceneGraph.removeElementAndChildren(this.followingState.followerElementId);
                this.followingState.followerElementId = null;
            }
            this.followingState.active = false;
            this.followingState.selectedId = null;
            // hideFullscreenColorCanvas(id);
            if (this.followingState.virtualizerId) {
                realityEditor.gui.ar.desktopRenderer.hideCameraCanvas(this.followingState.virtualizerId);
                this.followingState.virtualizerId = null;
            }
        }
        getTargetMatrix() {
            return [
                1, 0, 0, 0,
                0, 1, 0, 0,
                0, 0, 1, 0,
                this.targetPosition[0], this.targetPosition[1], this.targetPosition[2], 1
            ];
        }

        onPanToggled(callback) {
            this.callbacks.onPanToggled.push(callback);
        }
        onRotateToggled(callback) {
            this.callbacks.onRotateToggled.push(callback);
        }
        onScaleToggled(callback) {
            this.callbacks.onScaleToggled.push(callback);
        }
        triggerPanCallbacks(newValue) {
            this.callbacks.onPanToggled.forEach(function(cb) { cb(newValue); });
        }
        triggerRotateCallbacks(newValue) {
            this.callbacks.onRotateToggled.forEach(function(cb) { cb(newValue); });
        }
        triggerScaleCallbacks(newValue) {
            this.callbacks.onScaleToggled.forEach(function(cb) { cb(newValue); });
        }
        // there is a small bug with orbiting the camera that causes it to drift further away if you go too fast
        // this locks it at the correct zoom level unless you intentionally scroll while rotating
        zoomBackToPreRotateLevel() {
            if (this.preRotateDistanceToTarget === null) { return; }
            let cameraNormalizedVector = normalize(add(this.position, negate(this.targetPosition)));
            this.position = add(this.targetPosition, scalarMultiply(cameraNormalizedVector, this.preRotateDistanceToTarget));
        }
        
        updateParametricTargetAndPosition(distanceToCamera) {
            let positionObject = realityEditor.gui.threejsScene.getObjectByName('parametricPositionObject');
            let targetObject = realityEditor.gui.threejsScene.getObjectByName('parametricTargetObject');
            
            if (!positionObject || !targetObject) {
                return;
            }
            
            let minDist = realityEditor.device.desktopCamera.MIN_DIST_TO_CAMERA;
            let z = -distanceToCamera;
            let y = -1500 * ((z+minDist) / 3000) * ((z+minDist) / 3000); // camera is positioned along a quadratic curve behind the camera
            positionObject.position.set(0, y, z);
            positionObject.matrixWorldNeedsUpdate = true;

            z = 1500 * (10000 / ((distanceToCamera-minDist) + 2000)); // target distance decreases hyperbolically as camera distance increases
            targetObject.position.set(0, 0, z);
            targetObject.matrixWorldNeedsUpdate = true;

            // let minDist = realityEditor.device.desktopCamera.MIN_DIST_TO_CAMERA;
            if (this.followingState.currentFollowingDistance <= minDist && !this.followingState.currentlyRendering2DVideo) {
                realityEditor.gui.ar.desktopRenderer.showCameraCanvas(this.followingState.virtualizerId);
                this.followingState.currentlyRendering2DVideo = true;

            } else if (this.followingState.currentlyRendering2DVideo && this.followingState.currentFollowingDistance > minDist) {
                realityEditor.gui.ar.desktopRenderer.hideCameraCanvas(this.followingState.virtualizerId);
                this.followingState.currentlyRendering2DVideo = false;
            }
        }

        // this needs to be called externally each frame that you want it to update
        update() {
            this.velocity = [0, 0, 0];
            this.targetVelocity = [0, 0, 0];

            if (this.followingState.active) {
                this.updateFollowing();
                // if (this.followingState.isFirstPerson) {
                //     return;
                // }
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
                
                if (this.followingState.active) {
                    // let positionObject = realityEditor.gui.threejsScene.getObjectByName('parametricPositionObject');
                    // let targetObject = realityEditor.gui.threejsScene.getObjectByName('parametricTargetObject');

                    // increase speed as distance increases
                    // let nonLinearFactor = 1.05; // closer to 1 = less intense log (bigger as distance bigger)
                    // let distanceMultiplier = Math.max(1, getBaseLog(nonLinearFactor, this.distanceToTarget) / 100);

                    let dDist = this.speedFactors.scale * getCameraZoomSensitivity() * this.mouseInput.unprocessedScroll;

                    // // prevent you from zooming beyond it
                    // let isZoomingIn = this.mouseInput.unprocessedScroll < 0;
                    // if (isZoomingIn && (this.followingState.currentFollowingDistance + dDist) < 0) {
                    //     // zoom in at most halfway to the origin if you're going to overshoot it
                    //     let percentToClipBy = 0.5 * this.followingState.currentFollowingDistance / dDist;
                    //     dDist *= percentToClipBy;
                    // }
                    
                    let minDist = realityEditor.device.desktopCamera.MIN_DIST_TO_CAMERA;
                    this.followingState.currentFollowingDistance = Math.min(10000, Math.max(minDist, this.followingState.currentFollowingDistance + dDist));
                    
                    console.log('currentFollowingDistance = ' + this.followingState.currentFollowingDistance);
                    
                    this.updateParametricTargetAndPosition(this.followingState.currentFollowingDistance);

                } else {
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

                    this.velocity = add(this.velocity, vector);
                    this.deselectTarget();
                }

                this.mouseInput.unprocessedScroll = 0; // reset now that data is processed
            }

            let distancePanFactor = Math.max(1, this.distanceToTarget / 1000); // speed when 1 meter units away, scales up w/ distance

            if (this.idleOrbitting) {
                this.mouseInput.unprocessedDX = 0.3;
                this.mouseInput.isStrafeRequested = false;
            }

            if (this.mouseInput.unprocessedDX !== 0) {
                if (this.mouseInput.isStrafeRequested) { // strafe left-right
                    let vector = scalarMultiply(negate(horizontalVector), distancePanFactor * this.speedFactors.translation * this.mouseInput.unprocessedDX * getCameraPanSensitivity());
                    this.targetVelocity = add(this.targetVelocity, vector);
                    this.velocity = add(this.velocity, vector);
                    this.deselectTarget();
                } else { // rotate
                    let vector = scalarMultiply(negate(vCamX), this.speedFactors.rotation * getCameraRotateSensitivity() * (2 * Math.PI * this.distanceToTarget) * this.mouseInput.unprocessedDX);
                    this.velocity = add(this.velocity, vector);
                    this.deselectTarget();
                }

                this.mouseInput.unprocessedDX = 0;
            }

            if (this.mouseInput.unprocessedDY !== 0) {
                if (this.mouseInput.isStrafeRequested) { // stafe up-down
                    let vector = scalarMultiply(verticalVector, distancePanFactor * this.speedFactors.translation * this.mouseInput.unprocessedDY * getCameraPanSensitivity());
                    this.targetVelocity = add(this.targetVelocity, vector);
                    this.velocity = add(this.velocity, vector);
                    this.deselectTarget();
                } else { // rotate
                    let vector = scalarMultiply(vCamY, this.speedFactors.rotation * getCameraRotateSensitivity() * (2 * Math.PI * this.distanceToTarget) * this.mouseInput.unprocessedDY);
                    this.velocity = add(this.velocity, vector);
                    this.deselectTarget();
                }

                this.mouseInput.unprocessedDY = 0;
            }

            // TODO: add back keyboard controls
            // TODO: add back 6D mouse controls

            // prevents camera singularities by slowing down camera movement exponentially as the vertical viewing angle approaches top or bottom

            // evaluate the new camera position to determine if we need to slow the camera down
            let potentialPosition = add(this.position, this.velocity);
            let potentialTargetPosition = add(this.targetPosition, this.targetVelocity);
            let v_look = add(potentialPosition, negate(potentialTargetPosition));
            let verticalAngle = Math.acos(v_look[1] / Math.sqrt(v_look[0] * v_look[0] + v_look[1] * v_look[1] + v_look[2] * v_look[2]));

            const UPPER_ANGLE = Math.PI * 0.8; // soft upper bound
            const LOWER_ANGLE = Math.PI * 0.2; // soft lower bound
            if (verticalAngle > LOWER_ANGLE && verticalAngle < UPPER_ANGLE) {
                // if within soft bounds, move the camera as usual
                this.position = add(this.position, this.velocity);
                this.targetPosition = add(this.targetPosition, this.targetVelocity);
            } else {
                // if between soft bounds and top or bottom, slow movement exponentially as angle approaches 0 or PI
                // e.g. if angle is PI * 0.85, we are 25% between UPPER_ANGLE and PI, so slow down by 0.25^2 = 6%
                // e.g. if angle is PI * 0.9, we are 50% between UPPER_ANGLE and PI, so slow down by 0.50^2 = 25%
                // e.g. if angle is PI * 0.99, we are 95% between UPPER_ANGLE and PI, so slow down by 0.95^2 = 90%
                let closenessToAbsoluteBorder = (verticalAngle > Math.PI / 2) ? ((verticalAngle - UPPER_ANGLE) / (Math.PI - UPPER_ANGLE)) : ((verticalAngle - LOWER_ANGLE) / (0 - LOWER_ANGLE));
                let scaleFactor = Math.pow(1 - closenessToAbsoluteBorder, 2);
                this.position = add(this.position, scalarMultiply(this.velocity, scaleFactor));
                this.targetPosition = add(this.targetPosition, scalarMultiply(this.targetVelocity, scaleFactor));
            }

            // if rotating, and distance has drifted without intentionally zooming, reset back to correct distance
            if (this.preRotateDistanceToTarget && Math.abs(this.preRotateDistanceToTarget - this.distanceToTarget) > 10) {
                this.zoomBackToPreRotateLevel();
            }

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
