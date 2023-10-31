createNameSpace('realityEditor.device.cameraVis');

import * as THREE from '../../thirdPartyCode/three/three.module.js';
import {rvl} from '../../thirdPartyCode/rvl/index.js';
import RVLParser from '../../thirdPartyCode/rvl/RVLParser.js';
import {CameraVis} from './CameraVis.js';
import {ShaderMode} from '../../src/spatialCapture/Shaders.js';;

(function(exports) {
    const debug = false;
    const ENABLE_PICTURE_IN_PICTURE = false;
    const FIRST_PERSON_CANVAS = false;
    const DEPTH_REPR_PNG = false;
    const DEPTH_WIDTH = 256;
    const DEPTH_HEIGHT = 144;
    const CONNECTION_TIMEOUT_MS = 10000;

    const enabledShaderModes = [
        ShaderMode.SOLID,
        ShaderMode.DIFF,
        ShaderMode.POINT,
        ShaderMode.HOLO,
    ];

    const urlBase = 'ws://' + window.location.hostname + ':31337/';

    exports.CameraVisCoordinator = class CameraVisCoordinator {
        constructor(floorOffset) {
            this.voxelizer = null;
            this.webRTCCoordinator = null;
            this.cameras = {};
            // this.patches = {}; // NOTE: patches have been moved to userinterface src/spatialCapture/SpatialPatchCoordinator
            this.visible = true;
            this.spaghettiVisible = false;
            this.currentShaderModeIndex = 0;
            this.floorOffset = floorOffset;
            this.depthCanvasCache = {};
            this.colorCanvasCache = {};
            this.showCanvasTimeout = null;
            this.callbacks = {
                onCameraVisCreated: [],
                onCameraVisRemoved: [],
            };

            this.onAnimationFrame = this.onAnimationFrame.bind(this);
            window.requestAnimationFrame(this.onAnimationFrame);

            this.addMenuShortcuts();

            this.onPointerDown = this.onPointerDown.bind(this);

            let threejsCanvas = document.getElementById('mainThreejsCanvas');
            if (threejsCanvas && ENABLE_PICTURE_IN_PICTURE) {
                threejsCanvas.addEventListener('pointerdown', this.onPointerDown);
            }

            this.startWebRTC();
        }

        addMenuShortcuts() {
            realityEditor.gui.getMenuBar().addCallbackToItem(realityEditor.gui.ITEM.PointClouds, (toggled) => {
                this.visible = toggled;
                for (let camera of Object.values(this.cameras)) {
                    camera.mesh.visible = this.visible;
                    camera.mesh.__hidden = !this.visible;
                }
            });

            realityEditor.gui.getMenuBar().addCallbackToItem(realityEditor.gui.ITEM.ResetPaths, () => {
                for (let camera of Object.values(this.cameras)) {
                    camera.historyPoints = [];
                    camera.historyMesh.setPoints(camera.historyPoints);
                }
            });

            realityEditor.gui.getMenuBar().addCallbackToItem(realityEditor.gui.ITEM.SpaghettiMap, (toggled) => {
                this.spaghettiVisible = toggled;
                for (let camera of Object.values(this.cameras)) {
                    camera.historyMesh.visible = this.spaghettiVisible;
                }
            });

            realityEditor.gui.getMenuBar().addCallbackToItem(realityEditor.gui.ITEM.TakeSpatialSnapshot, () => {
                realityEditor.spatialCapture.spatialPatchCoordinator.clonePatches(ShaderMode.SOLID, this.cameras);
            });

            realityEditor.gui.getMenuBar().addCallbackToItem(realityEditor.gui.ITEM.CutoutViewFrustums, (toggled) => {
                this.cutoutViewFrustums = toggled;
                for (let camera of Object.values(this.cameras)) {
                    if (toggled) {
                        camera.enableFrustumCutout();
                    } else {
                        camera.disableFrustumCutout();
                    }
                }
            });
        }

        onAnimationFrame() {
            let now = performance.now();
            for (let camera of Object.values(this.cameras)) {
                if (camera.mesh.__hidden) {
                    camera.mesh.visible = false;
                    continue;
                }
                if (now - camera.lastUpdate > CONNECTION_TIMEOUT_MS) {
                    camera.remove();
                    delete this.cameras[camera.id];
                    this.callbacks.onCameraVisRemoved.forEach(cb => {
                        cb(camera);
                    });
                } else if (!camera.mesh.visible) {
                    camera.mesh.visible = true;
                }
            }
            window.requestAnimationFrame(this.onAnimationFrame);
        }

        connectWsToMatrix(url) {
            if (realityEditor.cloud.socket) {
                const ws = realityEditor.cloud.socket;

                ws.on('message', async (route, body, cbObj, bin) => {
                    if (body.id !== 'matrix') {
                        return;
                    }

                    const id = bin.data[0];
                    // const pktType = bytes[1];
                    // if (pktType === PKT_MATRIX) {
                    const mat = new Float32Array(bin.data.slice(1, bin.data.length).buffer);
                    // }
                    this.updateMatrix(id, mat, true, null);
                });
            } else {
                const ws = new WebSocket(url);
                ws.addEventListener('message', async (msg) => {
                    const bytes = new Uint8Array(await msg.data.slice(0, 1).arrayBuffer());
                    const id = bytes[0];
                    const mat = new Float32Array(await msg.data.slice(1, msg.data.size).arrayBuffer());
                    this.updateMatrix(id, mat, true, null);
                });
            }
        }

        updateMatrix(id, mat, delayed, rawMatricesMsg) {
            if (!this.cameras[id]) {
                this.createCameraVis(id);
            }
            this.cameras[id].update(mat, delayed, rawMatricesMsg);
        }

        connect() {
            const connectWsToTexture = (url, textureKey, mimetype) => {
                if (realityEditor.cloud.socket) {
                    const ws = realityEditor.cloud.socket;

                    ws.on('message', async (route, body, cbObj, bin) => {
                        if (body.id !== 'depth' && body.id !== 'color') {
                            return;
                        }
                        if (body.id === 'depth' && textureKey !== 'textureDepth') {
                            return;
                        }
                        if (body.id === 'color' && textureKey !== 'texture') {
                            return;
                        }

                        const bytes = new Uint8Array(bin.data.slice(0, 1));
                        const id = bytes[0];
                        const imageBlob = new Blob([bin.data.slice(1, bin.data.length).buffer], {type: mimetype});
                        const imageUrl = URL.createObjectURL(imageBlob);
                        this.renderPointCloud(id, textureKey, imageUrl);
                    });
                } else {
                    const ws = new WebSocket(url);

                    ws.addEventListener('message', async (msg) => {
                        const bytes = new Uint8Array(await msg.data.slice(0, 1).arrayBuffer());
                        const id = bytes[0];
                        if (textureKey === 'textureDepth' && !DEPTH_REPR_PNG) {
                            const parser = new RVLParser(await msg.data.slice(1, msg.data.size).arrayBuffer());
                            const rawDepth = rvl.decompress(parser.currentFrame.rvlBuf);
                            this.renderPointCloudRawDepth(id, rawDepth);
                            return;
                        }

                        const imageBlob = msg.data.slice(1, msg.data.size, mimetype);
                        const imageUrl = URL.createObjectURL(imageBlob);
                        this.renderPointCloud(id, textureKey, imageUrl);
                    });
                }
            };

            const urlColor = urlBase + 'color';
            const urlDepth = urlBase + 'depth';
            const urlMatrix = urlBase + 'matrix';

            connectWsToTexture(urlColor, 'texture', 'image/jpeg');
            connectWsToTexture(urlDepth, 'textureDepth', 'image/png');
            this.connectWsToMatrix(urlMatrix);
        }

        startWebRTC() {
            const network = 'cam' + Math.floor(Math.random() * 1000);

            const ws = realityEditor.cloud.socket || new WebSocket(urlBase + 'signalling');
            this.webRTCCoordinator = new realityEditor.device.cameraVis.WebRTCCoordinator(this, ws, network);
        }

        muteMicrophone() {
            if (!this.webRTCCoordinator) return;
            this.webRTCCoordinator.mute();
        }

        unmuteMicrophone() {
            if (!this.webRTCCoordinator) return;
            this.webRTCCoordinator.unmute();
        }

        renderPointCloud(id, textureKey, imageUrl) {
            if (!this.cameras[id]) {
                this.createCameraVis(id);
            }
            if (this.cameras[id].loading[textureKey]) {
                return;
            }
            this.cameras[id].loading[textureKey] = true;
            // const pktType = bytes[1];
            // if (pktType === PKT_MATRIX) {
            //   const text = await msg.data.slice(2, msg.data.length).text();
            //   const mat = JSON.parse(text);
            // }

            const image = new Image();

            let start = window.performance.now();
            image.onload = () => {
                const tex = this.cameras[id][textureKey];
                tex.dispose();
                // hmmmmm
                // most efficient would be if this had a data url for its src
                // data url = 'data:image/(png|jpeg);' + base64(blob)
                if (textureKey === 'textureDepth') {
                    if (!this.depthCanvasCache.hasOwnProperty(id)) {
                        let canvas = document.createElement('canvas');
                        this.depthCanvasCache[id] = {
                            canvas,
                            context: canvas.getContext('2d'),
                        };
                    }
                    let {canvas, context} = this.depthCanvasCache[id];
                    if (canvas.width !== image.width || canvas.height !== image.height) {
                        canvas.width = image.width;
                        canvas.height = image.height;
                    }
                    context.drawImage(image, 0, 0, image.width, image.height);
                } else {
                    if (!this.colorCanvasCache.hasOwnProperty(id)) {
                        let canvas = document.createElement('canvas');
                        this.colorCanvasCache[id] = {
                            canvas,
                            context: canvas.getContext('2d'),
                        };
                    }
                    let {canvas, context} = this.colorCanvasCache[id];
                    if (canvas.width !== image.width || canvas.height !== image.height) {
                        canvas.width = image.width;
                        canvas.height = image.height;
                    }
                    context.drawImage(image, 0, 0, image.width, image.height);
                }
                this.finishRenderPointCloudCanvas(id, textureKey, start);
                URL.revokeObjectURL(imageUrl);
            };
            image.onerror = (e) => {
                console.error(e);
            };
            image.src = imageUrl;
        }

        renderPointCloudRawDepth(id, rawDepth) {
            const textureKey = 'textureDepth';

            if (!this.cameras[id]) {
                this.createCameraVis(id);
            }
            if (this.cameras[id].loading[textureKey]) {
                return;
            }
            this.cameras[id].loading[textureKey] = true;
            const tex = this.cameras[id][textureKey];
            tex.dispose();

            if (!this.depthCanvasCache.hasOwnProperty(id)) {
                let canvas = document.createElement('canvas');
                let context = canvas.getContext('2d');
                let imageData = context.createImageData(DEPTH_WIDTH, DEPTH_HEIGHT);
                this.depthCanvasCache[id] = {
                    canvas,
                    context,
                    imageData,
                };
            }

            let {canvas, context, imageData} = this.depthCanvasCache[id];
            canvas.width = DEPTH_WIDTH;
            canvas.height = DEPTH_HEIGHT;
            let maxDepth14bits = 0;
            for (let i = 0; i < DEPTH_WIDTH * DEPTH_HEIGHT; i++) {
                if (rawDepth[i] > maxDepth14bits) {
                    maxDepth14bits = rawDepth[i];
                }
                // We get 14 bits of depth information from the RVL-encoded
                // depth buffer. Note that this means the blue channel is
                // always zero
                let depth24Bits = rawDepth[i] << (24 - 14); // * 5 / (1 << 14);
                if (depth24Bits > 0xffffff) {
                    depth24Bits = 0xffffff;
                }
                let b = depth24Bits & 0xff;
                let g = (depth24Bits >> 8) & 0xff;
                let r = (depth24Bits >> 16) & 0xff;
                imageData.data[4 * i + 0] = r;
                imageData.data[4 * i + 1] = g;
                imageData.data[4 * i + 2] = b;
                imageData.data[4 * i + 3] = 255;
            }
            this.cameras[id].maxDepthMeters = 5 * (maxDepth14bits / (1 << 14));

            context.putImageData(imageData, 0, 0);
            this.finishRenderPointCloudCanvas(id, textureKey, -1);

            if (this.voxelizer) {
                this.voxelizer.raycastDepth(
                    this.cameras[id].phone, {
                        width: DEPTH_WIDTH,
                        height: DEPTH_HEIGHT,
                    },
                    rawDepth
                );
            }
        }

        finishRenderPointCloudCanvas(id, textureKey, start) {
            const tex = this.cameras[id][textureKey];

            if (textureKey === 'textureDepth') {
                if (!this.depthCanvasCache.hasOwnProperty(id)) {
                    let canvas = document.createElement('canvas');
                    this.depthCanvasCache[id] = {
                        canvas,
                        context: canvas.getContext('2d'),
                    };
                }
                let {canvas} = this.depthCanvasCache[id];
                tex.image = canvas;
            } else {
                if (!this.colorCanvasCache.hasOwnProperty(id)) {
                    let canvas = document.createElement('canvas');
                    this.colorCanvasCache[id] = {
                        canvas,
                        context: canvas.getContext('2d'),
                    };
                }
                let {canvas} = this.colorCanvasCache[id];
                tex.image = canvas;
            }
            // tex.needsUpdate = true;
            // let end = window.performance.now();
            if (textureKey === 'texture') {
                // We know that capture takes 30ms
                // Transmission takes ??s
                this.cameras[id].setTime(start + 40);
            }
            this.cameras[id].loading[textureKey] = false;
        }

        showFullscreenColorCanvas(id) {
            let cacheId = id;
            if (!this.cameras.hasOwnProperty(cacheId)) {
                cacheId = 'prov' + id;
            }

            if (FIRST_PERSON_CANVAS) {
                const doShowCanvas = !document.getElementById('colorCanvas' + cacheId) && !this.showCanvasTimeout;
                if (this.colorCanvasCache[cacheId] && doShowCanvas) {
                    let canvas = this.colorCanvasCache[cacheId].canvas;
                    canvas.style.position = 'absolute';
                    canvas.style.left = '0';
                    canvas.style.top = '0';
                    canvas.style.width = '100vw';
                    canvas.style.height = '100vh';
                    canvas.style.transform = 'rotate(180deg)';
                    // canvas.style.transition = 'opacity 1.0s ease-in-out';
                    // canvas.style.opacity = '0';
                    canvas.id = 'colorCanvas' + cacheId;
                    this.showCanvasTimeout = setTimeout(() => {
                        document.body.appendChild(canvas);
                        this.showCanvasTimeout = null;
                    }, 300);
                }
            } else {
                const camera = this.cameras[cacheId];
                if (camera) {
                    camera.enableFirstPersonMode();
                    camera.historyMesh.visible = false;
                }
            }
        }

        hideFullscreenColorCanvas(id) {
            let cacheId = id;
            if (!this.cameras.hasOwnProperty(cacheId)) {
                cacheId = 'prov' + id;
            }

            if (FIRST_PERSON_CANVAS) {
                let canvas = document.getElementById('colorCanvas' + cacheId);
                if (canvas && canvas.parentElement) {
                    canvas.parentElement.removeChild(canvas);
                }
            } else {
                const camera = this.cameras[cacheId];
                if (this.cameras[cacheId]) {
                    camera.disableFirstPersonMode();
                    camera.historyMesh.visible = this.spaghettiVisible;
                }
            }
        }

        loadPointCloud(id, textureUrl, textureDepthUrl, matrix) {
            this.renderPointCloud(id, 'texture', textureUrl);
            this.renderPointCloud(id, 'textureDepth', textureDepthUrl);
            this.updateMatrix(id, matrix, true, null);
        }

        hidePointCloud(id) {
            if (!this.cameras[id]) {
                console.log('No need to hide camera ' + id + ', it hasn\'t been created yet.');
                return;
            }
            let camera = this.cameras[id];
            if (camera.mesh) {
                camera.mesh.visible = false;
            }
        }

        onCameraVisCreated(cb) {
            this.callbacks.onCameraVisCreated.push(cb);
        }

        onCameraVisRemoved(cb) {
            this.callbacks.onCameraVisRemoved.push(cb);
        }

        /**
         * @param {string} id - id of cameravis to be on the lookout for
         */
        startRecheckColorInterval(id) {
            let recheckColorInterval = setInterval(() => {
                let colorStr = realityEditor.avatar.getAvatarColorFromProviderId(id);
                if (!colorStr) {
                    return;
                }
                let color = new THREE.Color(colorStr);
                this.cameras[id].setColor(color);
                clearInterval(recheckColorInterval);
            }, 3000);
        }

        createCameraVis(id) {
            if (debug) {
                console.log('new camera', id);
            }
            let color;
            let colorStr = realityEditor.avatar.getAvatarColorFromProviderId(id);
            if (!colorStr) {
                console.warn('no color for camera', id);
                // If it's a webrtc cameravis (id starts with prov) then we
                // should eventually get this avatar information
                if (id.startsWith('prov')) {
                    this.startRecheckColorInterval(id);
                }
            } else {
                color = new THREE.Color(colorStr);
            }
            this.cameras[id] = new CameraVis(id, this.floorOffset, color);
            this.cameras[id].add();
            this.cameras[id].historyMesh.visible = this.spaghettiVisible;
            this.cameras[id].setShaderMode(enabledShaderModes[this.currentShaderModeIndex]);
            if (this.cutoutViewFrustums) {
                this.cameras[id].enableFrustumCutout();
            } else {
                this.cameras[id].disableFrustumCutout();
            }
            // these menubar shortcuts are disabled by default, enabled when at least one virtualizer connects
            realityEditor.gui.getMenuBar().setItemEnabled(realityEditor.gui.ITEM.PointClouds, true);
            realityEditor.gui.getMenuBar().setItemEnabled(realityEditor.gui.ITEM.SpaghettiMap, true);

            realityEditor.gui.getMenuBar().setItemEnabled(realityEditor.gui.ITEM.AdvanceCameraShader, true);

            realityEditor.gui.getMenuBar().setItemEnabled(realityEditor.gui.ITEM.TakeSpatialSnapshot, true);

            this.callbacks.onCameraVisCreated.forEach(cb => {
                cb(this.cameras[id]);
            });
        }

        onPointerDown(e) {
            let objectsToCheck = Object.values(this.cameras).map(cameraVis => {
                return cameraVis.cameraMeshGroup;
            });
            let intersects = realityEditor.gui.threejsScene.getRaycastIntersects(e.clientX, e.clientY, objectsToCheck);

            intersects.forEach((intersect) => {
                if (intersect.object.name !== 'cameraVisCamera') {
                    return;
                }

                let id = intersect.object.cameraVisId;
                let i = Object.keys(this.cameras).indexOf('' + id);
                this.cameras[id].toggleColorCube(i);

                // stop propagation if we hit anything, otherwise pass the event on to the rest of the application
                e.stopPropagation();
            });
        }

        advanceShaderMode() {
            this.currentShaderModeIndex = (this.currentShaderModeIndex + 1) % enabledShaderModes.length;
            this.setShaderMode(enabledShaderModes[this.currentShaderModeIndex]);
        }

        setShaderMode(shaderMode) {
            for (let camera of Object.values(this.cameras)) {
                camera.setShaderMode(shaderMode);
            }
        }
    };

})(realityEditor.device.cameraVis);
