/*
* Copyright © 2018 PTC
*
* This Source Code Form is subject to the terms of the Mozilla Public
* License, v. 2.0. If a copy of the MPL was not distributed with this
* file, You can obtain one at http://mozilla.org/MPL/2.0/.
*/

createNameSpace('realityEditor.gui.ar.desktopRenderer');

import * as THREE from '../../thirdPartyCode/three/three.module.js';
import {UNIFORMS, MAX_VIEW_FRUSTUMS} from '../../src/gui/ViewFrustum.js';
import {ShaderMode} from '../../src/spatialCapture/Shaders.js';

/**
 * @fileOverview realityEditor.device.desktopRenderer.js
 * For remote desktop operation: renders background graphics simulating the context streamed from a connected phone.
 * e.g. a point or plane for each target, or an entire point cloud of the background contents
 */

(function(exports) {
    const PROXY = !window.location.port || window.location.port === "443";

    /**
     * @type {Canvas} - the DOM element where the images streamed from a reality zone are rendered
     */
    var backgroundCanvas;
    /**
     * @type {Canvas}
     * Scratch space to draw and chroma-key the image from the RZ which is
     * drawing the point cloud and background
     */
    var primaryBackgroundCanvas;
    // Whether the primary canvas is ready for use in bg rendering
    var primaryDrawn = false;

    /**
     * @type {Canvas}
     * Scratch space to draw and chroma-key the image from the RZ which is
     * drawing only its point cloud
     */
    var secondaryBackgroundCanvas;
    // Whether the secondary canvas is ready for use in bg rendering
    var secondaryDrawn = false;

    var ONLY_REQUIRE_PRIMARY = true;

    // let gltfPath = null; //'./svg/office.glb'; //null; // './svg/BenApt1_authoring.glb';
    let isGlbLoaded = false;

    let gltf = null;
    let staticModelMode = false;
    let videoPlayback = null;
    let cameraVisCoordinator = null;
    let cameraVisSceneNodes = [];

    let cameraVisFrustums = [];

    let didInit = false; // true as soon as initService is called
    let cameraSystemInitialized = false; // true when a valid world has been discovered
    let sceneInitialized = false; // true when the world mesh has loaded

    let didAddModeTransitionListeners = false;
    let gltfUpdateCallbacks = [];

    /**
     * Public init method to enable rendering if isDesktop
     */
    function initService() {
        if (!realityEditor.device.desktopAdapter) {
            setTimeout(initService, 100);
            return;
        }

        // always trigger this even on an AR device, since these listeners can trigger initService
        addModeTransitionListeners();

        // only continue initializing the remote renderer if we're not in AR mode (happens on desktop, or by pinching on AR device)
        if (realityEditor.device.environment.isARMode()) { return; }
        if (didInit) return;

        didInit = true;

        const renderingFlagName = 'loadingWorldMesh';
        realityEditor.device.environment.addSuppressedObjectRenderingFlag(renderingFlagName); // hide tools until the model is loaded

        // when a new object is detected, check if we need to create a socket connection with its server
        realityEditor.network.addObjectDiscoveredCallback(function(object, objectKey) {
            if (isGlbLoaded) { return; } // only do this for the first world object detected

            // let primaryWorldId = realityEditor.device.desktopAdapter.getPrimaryWorldId();
            let primaryWorldId = realityEditor.network.discovery.getPrimaryWorldInfo() ?
                realityEditor.network.discovery.getPrimaryWorldInfo().id : null;
            let isConnectedViaIp = window.location.hostname.split('').every(char => '0123456789.'.includes(char)); // Already know hostname is valid, this is enough to check for IP
            let isSameIp = object.ip === window.location.hostname;
            let isWorldObject = object.isWorldObject || object.type === 'world';

            let allCriteriaMet;
            if (primaryWorldId) {
                allCriteriaMet = objectKey === primaryWorldId; // Connecting to specific world object via search param
            } else {
                if (isConnectedViaIp) {
                    allCriteriaMet = isSameIp && isWorldObject; // Connecting to same world object running on remote operator (excluding when connecting via domain name)
                } else {
                    allCriteriaMet = isWorldObject; // Otherwise, connect to first available world object
                }
            }

            if (!allCriteriaMet) {
                return;
            }

            if (objectKey.includes('_local')) {
                console.warn('Rejected local world object');
                return;
            }

            // initialize the camera system first with a 0 floor offset - proper offset gets set after gltf loaded
            // this lets the camera work even when there's an empty world object (just seeing the holodeck)
            initializeCameraSystem(0);

            realityEditor.device.meshLine.inject();

            // try loading area target GLB file into the threejs scene
            isGlbLoaded = true;
            let gltfPath =  realityEditor.network.getURL(object.ip, realityEditor.network.getPort(object), '/obj/' + object.name + '/target/target.glb');
            let checkGltfPath = realityEditor.network.getURL(object.ip, realityEditor.network.getPort(object), '/object/' + objectKey + '/checkFileExists/target/target.glb');
            function checkExist() {
                let start = Date.now(); // prevent cached responses
                fetch(`${checkGltfPath}?t=${start}`).then((res) => {
                    return res.json();
                }).then((body) => {
                    if (!body.exists) {
                        setTimeout(checkExist, 500);
                    } else {
                        realityEditor.app.targetDownloader.createNavmesh(gltfPath, objectKey, createNavmeshCallback);
                    }
                }).catch(_ => {
                    setTimeout(checkExist, 500);
                });
            }

            function createNavmeshCallback(navmesh) {
                let floorOffset = navmesh.floorOffset * 1000;
                let buffer = 0; // can be used to offset the mesh from the groundplane, but other alignment issues throughout the system may arise if it isn't 0
                floorOffset += buffer;
                let groundPlaneMatrix = [
                    1, 0, 0, 0,
                    0, 1, 0, 0,
                    0, 0, 1, 0,
                    0, floorOffset, 0, 1
                ];
                realityEditor.sceneGraph.setGroundPlanePosition(groundPlaneMatrix);

                // update the camera system with the correct floor offset from the navmesh
                initializeCameraSystem(floorOffset);

                let ceilingHeight = Math.max(
                    navmesh.maxY - navmesh.minY,
                    navmesh.maxX - navmesh.minX,
                    navmesh.maxZ - navmesh.minZ
                );
                let ceilingAndFloor = {
                    ceiling: navmesh.maxY,
                    floor: navmesh.minY
                };
                let center = {
                    x: (navmesh.maxX + navmesh.minX) / 2,
                    y: navmesh.minY,
                    z: (navmesh.maxZ + navmesh.minZ) / 2,
                };
                let map = navmesh.map;
                let steepnessMap = navmesh.steepnessMap;
                let heightMap = navmesh.heightMap;
                realityEditor.gui.threejsScene.addGltfToScene(gltfPath, map, steepnessMap, heightMap, {x: 0, y: -floorOffset, z: 0}, {x: 0, y: 0, z: 0}, ceilingHeight, ceilingAndFloor, center, function(createdMesh) {

                    initializeSceneAfterMeshLoaded();

                    gltf = createdMesh;
                    gltf.name = 'areaTargetMesh';

                    const greyMaterial = new THREE.MeshBasicMaterial({
                        color: 0x777777,
                        wireframe: true,
                    });

                    gltf.traverse(obj => {
                        if (obj.type === 'Mesh' && obj.material) {
                            obj.oldMaterial = greyMaterial;

                            // to improve performance on mobile devices, switch to simpler material (has very large effect)
                            if (!realityEditor.device.environment.isDesktop() && typeof obj.originalMaterial !== 'undefined') {
                                obj.material.dispose(); // free resources from the advanced material
                                obj.material = obj.originalMaterial;

                                gltfUpdateCallbacks.push((percent) => {
                                    let scaledPercent = percent * 20; // fully fades in when slider is 5% activated
                                    // TODO: figure out best-looking transition. for now, just make it appear all at once
                                    if (percent < 0.05) {
                                        scaledPercent = 0;
                                    } else {
                                        scaledPercent = 1;
                                    }
                                    if (scaledPercent < 1) {
                                        obj.material.transparent = true;
                                    } else {
                                        obj.material.transparent = false;
                                    }
                                    obj.material.opacity = Math.max(0, Math.min(1.0, scaledPercent));
                                });
                            }
                        }
                    });

                    // this will trigger any onLocalizedWithinWorld callbacks in the userinterface, such as creating the Avatar
                    let identity = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
                    realityEditor.worldObjects.setOrigin(objectKey, identity);

                    let realityZoneVoxelizer;
                    function enableVoxelizer() {
                        if (realityZoneVoxelizer) {
                            realityZoneVoxelizer.remove();
                        }
                        realityZoneVoxelizer = new realityEditor.gui.ar.desktopRenderer.RealityZoneVoxelizer(floorOffset, createdMesh, navmesh);
                        realityZoneVoxelizer.add();
                        cameraVisCoordinator.voxelizer = realityZoneVoxelizer;
                    }
                    function disableVoxelizer() {
                        if (!realityZoneVoxelizer) {
                            return;
                        }

                        realityZoneVoxelizer.remove();
                        realityZoneVoxelizer = null;
                        cameraVisCoordinator.voxelizer = null;
                    }

                    function setupMenuBar() {
                        if (realityEditor.device.environment.isWithinToolboxApp()) return;

                        if (!realityEditor.gui.getMenuBar) {
                            setTimeout(setupMenuBar, 100);
                            return;
                        }

                        realityEditor.gui.getMenuBar().addCallbackToItem(realityEditor.gui.ITEM.Voxelizer, (toggled) => {
                            if (toggled) {
                                enableVoxelizer();
                            } else {
                                disableVoxelizer();
                            }
                        });

                        cameraVisCoordinator = new realityEditor.device.cameraVis.CameraVisCoordinator(floorOffset);
                        cameraVisCoordinator.onCameraVisCreated(cameraVis => {
                            console.log('onCameraVisCreated', cameraVis);
                            cameraVisSceneNodes.push(cameraVis.sceneNode);

                            // add to cameraVisFrustums so that material uniforms can be updated
                            cameraVisFrustums.push(cameraVis.id);
                        });

                        cameraVisCoordinator.onCameraVisRemoved(cameraVis => {
                            console.log('onCameraVisRemoved', cameraVis);
                            cameraVisSceneNodes = cameraVisSceneNodes.filter(sceneNode => {
                                return sceneNode !== cameraVis.sceneNode;
                            });

                            // remove from cameraVisFrustums so that material uniforms can be updated
                            cameraVisFrustums = cameraVisSceneNodes.filter(id => {
                                return id !== cameraVis.id;
                            });
                            realityEditor.gui.threejsScene.removeMaterialCullingFrustum(cameraVis.id);
                        });

                        realityEditor.gui.getMenuBar().addCallbackToItem(realityEditor.gui.ITEM.AdvanceCameraShader, () => {
                            cameraVisCoordinator.advanceShaderMode();
                        });

                        realityEditor.gui.getMenuBar().addCallbackToItem(realityEditor.gui.ITEM.DownloadScan, () => {
                            window.open(gltfPath, '_blank');
                        });
                        realityEditor.gui.getMenuBar().setItemEnabled(realityEditor.gui.ITEM.DownloadScan, true);

                        const ENABLE_VIDEO_TIMELINE_COMPONENT = false;
                        if (ENABLE_VIDEO_TIMELINE_COMPONENT && !PROXY) {
                            const createVideoPlayback = () => {
                                videoPlayback = new realityEditor.videoPlayback.VideoPlaybackCoordinator();
                                videoPlayback.setPointCloudCallback(cameraVisCoordinator.loadPointCloud.bind(cameraVisCoordinator));
                                videoPlayback.setHidePointCloudCallback(cameraVisCoordinator.hidePointCloud.bind(cameraVisCoordinator));
                                videoPlayback.load();
                                // window.videoPlayback = videoPlayback;
                            };

                            realityEditor.gui.getMenuBar().addCallbackToItem(realityEditor.gui.ITEM.VideoPlayback, (toggled) => {
                                if (!videoPlayback) {
                                    createVideoPlayback(); // only create it if the user decides to use it
                                }
                                videoPlayback.toggleVisibility(toggled);
                            });
                        }
                    }

                    setupMenuBar();
                });
            }

            checkExist();
        });

        if (!realityEditor.device.environment.isWithinToolboxApp()) {
            document.body.style.backgroundColor = 'rgb(50,50,50)';
        }

        // create background canvas and supporting canvasses

        backgroundCanvas = document.createElement('canvas');
        backgroundCanvas.id = 'desktopBackgroundRenderer';
        backgroundCanvas.classList.add('desktopBackgroundRenderer');
        backgroundCanvas.style.transform = 'matrix3d(1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1)'; // render behind three.js
        backgroundCanvas.style.transformOrigin = 'top left';
        backgroundCanvas.style.position = 'absolute';
        backgroundCanvas.style.visibility = 'hidden';
        primaryBackgroundCanvas = document.createElement('canvas');
        secondaryBackgroundCanvas = document.createElement('canvas');

        realityEditor.device.layout.onWindowResized(updateCanvasSize);

        // backgroundRenderer.src = "https://www.youtube.com/embed/XOacA3RYrXk?enablejsapi=1&rel=0&amp;controls=0&playsinline=1&vq=large";

        // add the Reality Zone background behind everything else
        document.body.insertBefore(backgroundCanvas, document.body.childNodes[0]);

        realityEditor.gui.getMenuBar().addCallbackToItem(realityEditor.gui.ITEM.ModelVisibility, (value) => {
            if (!gltf) { return; }
            staticModelMode = value;
            if (staticModelMode) {
                gltf.visible = true;
                console.log('show gtlf');
            } else {
                gltf.visible = false;
                console.log('hide gltf');
            }
        });

        realityEditor.gui.getMenuBar().addCallbackToItem(realityEditor.gui.ITEM.ModelTexture, () => {
            if (!gltf) {
                return;
            }
            gltf.traverse(obj => {
                if (obj.type === 'Mesh' && obj.material) {
                    let tmp = obj.material;
                    obj.material = obj.oldMaterial;
                    obj.oldMaterial = tmp;
                }
            });
        });

        realityEditor.gui.getMenuBar().addCallbackToItem(realityEditor.gui.ITEM.ToggleMotionStudySettings, () => {
            if (!realityEditor.humanPose.draw) { return; }
            realityEditor.humanPose.draw.toggleAnalyzerSettingsUI();
        });

        realityEditor.gui.buttons.registerCallbackForButton(
            'logic',
            function onLogicMode() {
                const logicCanvas = document.getElementById('canvas');
                logicCanvas.style.pointerEvents = 'auto';
            }
        );
        realityEditor.gui.buttons.registerCallbackForButton(
            'gui',
            function onGuiMode() {
                const logicCanvas = document.getElementById('canvas');
                logicCanvas.style.pointerEvents = 'none';
            }
        );
    }

    /**
     * Take care of any initialization steps that should happen as soon as a valid world object has been discovered
     * @param floorOffset
     */
    function initializeCameraSystem(floorOffset = 0) {
        if (cameraSystemInitialized) {
            realityEditor.device.desktopCamera.updateCameraFloorOffset(floorOffset);
            return;
        }
        // make sure this only happens once
        cameraSystemInitialized = true;
        realityEditor.device.desktopCamera.initService(floorOffset);
    }

    /**
     * Take care of any initialization steps that should happen after the mesh has been loaded
     */
    function initializeSceneAfterMeshLoaded() {
        if (sceneInitialized) return; // make sure this only happens once
        sceneInitialized = true;
        realityEditor.device.environment.clearSuppressedObjectRenderingFlag('loadingWorldMesh'); // stop hiding tools

        let endMarker = document.createElement('div');
        endMarker.style.display = 'none';
        endMarker.id = 'gltf-added';
        document.body.appendChild(endMarker);
    }

    /**
     * @param {ShaderMode} shaderMode - initial shader mode to set on the patches
     * @return {{[key: string]: THREE.Object3D}} map from key to patch
     */
    function cloneCameraVisPatches(shaderMode = ShaderMode.SOLID) {
        let spatialPatchCoordinator = realityEditor.spatialCapture.spatialPatchCoordinator;
        if (!spatialPatchCoordinator) {
            return null;
        }
        return spatialPatchCoordinator.clonePatches(shaderMode);
    }
    exports.cloneCameraVisPatches = cloneCameraVisPatches;

    /**
     * @return {{[key: string]: THREE.Object3D}} map from key to patch
     */
    function getCameraVisPatches() {
        let spatialPatchCoordinator = realityEditor.spatialCapture.spatialPatchCoordinator;
        if (!spatialPatchCoordinator) {
            return null;
        }
        return spatialPatchCoordinator.patches;
    }
    exports.getCameraVisPatches = getCameraVisPatches;

    function showCameraCanvas(id) {
        if (cameraVisCoordinator) {
            cameraVisCoordinator.showFullscreenColorCanvas(id);
            isVirtualizerRenderingIn2D[id] = true;
        }
    }
    exports.showCameraCanvas = showCameraCanvas;

    function hideCameraCanvas(id) {
        if (cameraVisCoordinator) {
            cameraVisCoordinator.hideFullscreenColorCanvas(id);
            isVirtualizerRenderingIn2D[id] = false;
        }
    }
    exports.hideCameraCanvas = hideCameraCanvas;

    // can use this to preserve 2D rendering if we switch from one camera target to another
    let isVirtualizerRenderingIn2D = {};
    exports.getVirtualizers2DRenderingState = function() {
        return isVirtualizerRenderingIn2D;
    };

    /**
     * Updates canvas size for resize events
     */
    function updateCanvasSize({viewport}) {
        let {left, top, width, height} = viewport;
        [backgroundCanvas, primaryBackgroundCanvas, secondaryBackgroundCanvas].forEach(thisCanvas => {
            thisCanvas.width = width;
            thisCanvas.height = height;
            thisCanvas.style.width = width + 'px';
            thisCanvas.style.height = height + 'px';
            thisCanvas.style.left = left + 'px';
            thisCanvas.style.top = top + 'px';
        });
        primaryDrawn = false;
        secondaryDrawn = false;
    }

    /**
     * Takes a message containing an encoded image, and chroma keys it for use as the fullscreen background on the desktop
     * @param {string} source - either primary or secondary
     * @param {string} msgContent - contains the image data encoded as a base64 string
     */
    function processImageFromSource(source, msgContent) {
        // if (typeof msgContent.base64String !== 'undefined') {
        //     var imageBlobUrl = realityEditor.device.utilities.decodeBase64JpgToBlobUrl(msgContent.base64String);
        //     backgroundRenderer.src = imageBlobUrl;
        // }
        let parts = msgContent.split(';_;');
        let rgbImage = parts[0];
        let alphaImage = parts[1];
        let editorId = parts[2];
        let rescaleFactor = parts[3];

        if (editorId !== globalStates.tempUuid) {
            // console.log('ignoring image from other editorId');
            return;
        }

        let prom;
        if (source === 'primary') {
            prom = renderImageAndChromaKey(primaryBackgroundCanvas, rgbImage, alphaImage).then(function() {
                primaryDrawn = true;
            });
        } else if (source === 'secondary') {
            prom = renderImageAndChromaKey(secondaryBackgroundCanvas, rgbImage, alphaImage).then(function() {
                secondaryDrawn = true;
            });
        }
        if (!prom) {
            return;
        }
        prom.then(function() {
            if (primaryDrawn && (secondaryDrawn || ONLY_REQUIRE_PRIMARY)) {
                renderBackground();
                backgroundCanvas.style.transform = 'matrix3d(' + rescaleFactor + ', 0, 0, 0, 0, ' + rescaleFactor + ', 0, 0, 0, 0, 1, 0, 0, 0, 1, 1)';
            }
        });
    }

    function renderBackground() {
        let gfx = backgroundCanvas.getContext('2d');
        gfx.clearRect(0, 0, backgroundCanvas.width, backgroundCanvas.height);
        gfx.drawImage(primaryBackgroundCanvas, 0, 0);
        gfx.drawImage(secondaryBackgroundCanvas, 0, 0);
        realityEditor.device.desktopStats.imageRendered();

        if (staticModelMode) {
            // desktopBackgroundRenderer
            backgroundCanvas.style.visibility = 'hidden';
        } else {
            backgroundCanvas.style.visibility = '';
        }
    }

    function loadImage(width, height, imageStr) {
        if (!imageStr) {
            return Promise.resolve(null);
        }
        return new Promise(function(res) {
            let img = new Image(width, height);
            img.onload = function() {
                img.onload = null;
                res(img);
            };
            img.src = imageStr;
        });
    }

    function renderImageAndChromaKey(canvas, rgbImageStr, alphaImageStr) {
        return Promise.all([
            loadImage(canvas.width, canvas.height, rgbImageStr),
            loadImage(canvas.width, canvas.height, alphaImageStr),
        ]).then(function([rgbImage, alphaImage]) {
            let gfx = canvas.getContext('2d');

            if (!alphaImage) {
                gfx.drawImage(rgbImage, 0, 0);
                return;
            }

            gfx.drawImage(alphaImage, 0, 0);
            let alphaId = gfx.getImageData(0, 0, canvas.width, canvas.height);
            gfx.drawImage(rgbImage, 0, 0);
            let id = gfx.getImageData(0, 0, canvas.width, canvas.height);
            let nPixels = canvas.width * canvas.height;
            for (let i = 0; i < nPixels; i++) {
                id.data[4 * i + 3] = alphaId.data[4 * i + 0];
            }
            gfx.putImageData(id, 0, 0);
        });
    }

    exports.processImageFromSource = processImageFromSource;

    exports.getCameraVisSceneNodes = () => {
        return cameraVisSceneNodes;
    };

    exports.updateAreaGltfForCamera = function(cameraId, cameraWorldMatrix, maxDepthMeters) {
        if (!gltf || typeof gltf.traverse === 'undefined') return;
        const utils = realityEditor.gui.ar.utilities;

        let cameraPosition = new THREE.Vector3(
            cameraWorldMatrix.elements[12] / 1000,
            cameraWorldMatrix.elements[13] / 1000,
            cameraWorldMatrix.elements[14] / 1000
        );
        let cameraPos = [cameraPosition.x, cameraPosition.y, cameraPosition.z];
        let cameraDirection = utils.normalize(utils.getForwardVector(cameraWorldMatrix.elements));
        let cameraLookAtPosition = utils.add(cameraPos, cameraDirection);
        let cameraUp = utils.normalize(utils.getUpVector(cameraWorldMatrix.elements));

        let thisFrustumPlanes = realityEditor.gui.threejsScene.updateMaterialCullingFrustum(cameraId, cameraPos, cameraLookAtPosition, cameraUp, maxDepthMeters);

        gltf.traverse(child => {
            updateFrustumUniforms(child, cameraId, thisFrustumPlanes);
        });
    };

    function updateFrustumUniforms(mesh, cameraId, frustumPlanes) {
        if (!mesh.material || !mesh.material.uniforms) return;

        let cameraFrustumIndex = cameraVisFrustums.indexOf(cameraId);
        if (cameraFrustumIndex >= MAX_VIEW_FRUSTUMS || cameraFrustumIndex === -1) {
            return;
        }

        mesh.material.uniforms[UNIFORMS.numFrustums].value = Math.min(cameraVisFrustums.length, MAX_VIEW_FRUSTUMS);

        if (typeof mesh.material.uniforms[UNIFORMS.frustums] !== 'undefined') {
            // update this frustum with all of the normals and constants
            let existingFrustums = mesh.material.uniforms[UNIFORMS.frustums].value;
            existingFrustums[cameraFrustumIndex] = frustumPlanes;
            mesh.material.uniforms[UNIFORMS.frustums].value = existingFrustums;
            mesh.material.needsUpdate = true;
        }
    }

    function muteMicrophoneForCameraVis() {
        if (!cameraVisCoordinator) return;
        cameraVisCoordinator.muteMicrophone();
    }

    function unmuteMicrophoneForCameraVis() {
        if (!cameraVisCoordinator) return;
        cameraVisCoordinator.unmuteMicrophone();
    }

    exports.muteMicrophoneForCameraVis = muteMicrophoneForCameraVis;
    exports.unmuteMicrophoneForCameraVis = unmuteMicrophoneForCameraVis;

    // when transitioning from AR to VR, add or remove the gltf from the three.js scene
    function addModeTransitionListeners() {
        if (didAddModeTransitionListeners) return;
        didAddModeTransitionListeners = true;

        realityEditor.device.modeTransition.onRemoteOperatorShown(() => {
            initService(); // init if needed
            showScene();
        });

        realityEditor.device.modeTransition.onRemoteOperatorHidden(() => {
            hideScene();
        });

        realityEditor.device.modeTransition.onTransitionPercent((percent) => {
            gltfUpdateCallbacks.forEach(callback => {
                callback(percent);
            });
        });
    }

    function showScene() {
        if (!gltf) return;
        gltf.visible = true;
        realityEditor.gui.threejsScene.addToScene(gltf);
    }

    function hideScene() {
        if (!gltf) return;
        gltf.visible = false;
        realityEditor.gui.threejsScene.removeFromScene(gltf);
    }

    exports.initService = initService;

    exports.getCameraVisCoordinator = () => {
        return cameraVisCoordinator;
    };

    realityEditor.addons.addCallback('init', initService);
})(realityEditor.gui.ar.desktopRenderer);
