/*
* Copyright © 2018 PTC
*
* This Source Code Form is subject to the terms of the Mozilla Public
* License, v. 2.0. If a copy of the MPL was not distributed with this
* file, You can obtain one at http://mozilla.org/MPL/2.0/.
*/

createNameSpace('realityEditor.gui.ar.desktopRenderer');

/**
 * @fileOverview realityEditor.device.desktopRenderer.js
 * For remote desktop operation: renders background graphics simulating the context streamed from a connected phone.
 * e.g. a point or plane for each marker, or an entire point cloud of the background contents
 */

(function(exports) {
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

    let gltfPath = null; //'./svg/office.glb'; //null; // './svg/BenApt1_authoring.glb';
    let isGlbLoaded = false;

    let gltf = null;
    let staticModelMode = true;

    /**
     * Public init method to enable rendering if isDesktop
     */
    function initService() {
        if (!realityEditor.device.desktopAdapter.isDesktop()) { return; }

        // when a new object is detected, check if we need to create a socket connection with its server
        realityEditor.network.addObjectDiscoveredCallback(function(object, objectKey) {
          if (isGlbLoaded) { return; } // only do this for the first world object detected
          // addServerForObjectIfNeeded(object, objectKey);
          // try loading area target GLB file into the threejs scene
          if (object.isWorldObject || object.type === 'world') { // backwards compatible with isWorldObject
            if (!gltfPath) {
              gltfPath = 'http://' + object.ip + ':' + realityEditor.network.getPort(object) + '/obj/' + object.name + '/target/target.glb';
            }

            let rotationCalibration = realityEditor.gui.settings.toggleStates.rotationCalibration * Math.PI * 2;
            let xCalibration = realityEditor.gui.settings.toggleStates.xCalibration * 10000 - 5000;
            let zCalibration = realityEditor.gui.settings.toggleStates.zCalibration * 10000 - 5000;

            let floorOffset = 0;
            // let floorOffset = -1.55 * 1000;
            realityEditor.gui.threejsScene.addGltfToScene(gltfPath, {x: 0, y: 0, z: 0}, {x: 0, y: 0, z: 0}, 2.3, function (createdMesh) {
              gltf = createdMesh;
            });

            // realityEditor.gui.threejsScene.addGltfToScene(gltfPath, {x: xCalibration, y: 0, z: zCalibration}, {x: 0, y: rotationCalibration, z: 0});
            // realityEditor.gui.threejsScene.addGltfToScene(gltfPath, {x: -600, y: -floorOffset, z: -3300}, {x: 0, y: 2.661627109291353, z: 0});

            let tableHeight = 0.77;
            // let floorOffset = -1.4 * 1000; //(-1.5009218056996663 /*+ tableHeight */) * 1000; // meters -> mm //
            // -1.5009218056996663
            let buffer = 100;
            floorOffset += buffer;
            let groundPlaneMatrix = [
              1, 0, 0, 0,
              0, 1, 0, 0,
              0, 0, 1, 0,
              0, floorOffset, 0, 1
            ];
            realityEditor.sceneGraph.setGroundPlanePosition(groundPlaneMatrix);
          }
        });

        // add sliders to calibrate rotation and translation of model
      realityEditor.gui.settings.addSlider('Calibrate Rotation', '', 'rotationCalibration',  '../../../svg/cameraRotate.svg', 0, function(newValue) {
        console.log('rotation value = ' + newValue);
      });
      realityEditor.gui.settings.addSlider('Calibrate X', '', 'xCalibration',  '../../../svg/cameraPan.svg', 0.5, function(newValue) {
        console.log('x value = ' + newValue);
      });
      realityEditor.gui.settings.addSlider('Calibrate Z', '', 'zCalibration',  '../../../svg/cameraPan.svg', 0.5, function(newValue) {
        console.log('z value = ' + newValue);
      });


      // create background canvas and supporting canvasses

        backgroundCanvas = document.createElement('canvas');
        backgroundCanvas.id = 'desktopBackgroundRenderer';
        backgroundCanvas.classList.add('desktopBackgroundRenderer');
        backgroundCanvas.style.transform = 'matrix3d(1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, -1, 1)';
        backgroundCanvas.style.transformOrigin = 'top left';
        backgroundCanvas.style.position = 'absolute';
        primaryBackgroundCanvas = document.createElement('canvas');
        secondaryBackgroundCanvas = document.createElement('canvas');

        updateCanvasSize();
        window.addEventListener('resize', updateCanvasSize);

        // backgroundRenderer.src = "https://www.youtube.com/embed/XOacA3RYrXk?enablejsapi=1&rel=0&amp;controls=0&playsinline=1&vq=large";

        // add the Reality Zone background behind everything else
        document.body.insertBefore(backgroundCanvas, document.body.childNodes[0]);

        // if (typeof msgContent.sendToBackground !== "undefined") {
        //
        //     var iframe = globalDOMCache['iframe' + tempThisObject.uuid];
        //     var src = iframe.src;
        //
        //     var desktopBackgroundRenderer = document.getElementById('desktopBackgroundRenderer');
        //     if (desktopBackgroundRenderer) {
        //         if (desktopBackgroundRenderer.src !== src) {
        //             desktopBackgroundRenderer.src = src;
        //         }
        //     }
        //
        //     if (iframe) {
        //         iframe.style.display = 'none';
        //     }
        //
        //     var div = globalDOMCache[tempThisObject.uuid]; //globalDOMCache['object' + tempThisObject.uuid];
        //     if (div) {
        //         // div.style.pointerEvents = 'none';
        //         globalDOMCache[tempThisObject.uuid].style.display = 'none';
        //     }
        //
        // }

        realityEditor.device.keyboardEvents.registerCallback('keyUpHandler', function(params) {
          if (params.event.code === 'KeyT' && gltf) {
            staticModelMode = !staticModelMode;
            if (staticModelMode) {
              gltf.visible = true;
            } else {
              gltf.visible = false;
            }
          }
        });
    }

    /**
     * Updates canvas size for resize events
     */
    function updateCanvasSize() {
        backgroundCanvas.width = window.innerWidth;
        backgroundCanvas.height = window.innerHeight;
        primaryBackgroundCanvas.width = window.innerWidth;
        primaryBackgroundCanvas.height = window.innerHeight;
        secondaryBackgroundCanvas.width = window.innerWidth;
        secondaryBackgroundCanvas.height = window.innerHeight;
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
                backgroundCanvas.style.transform = 'matrix3d(' + rescaleFactor + ', 0, 0, 0, 0, ' + rescaleFactor + ', 0, 0, 0, 0, 1, 0, 0, 0, -1, 1)';
            }
        });
    }

    function renderBackground() {
        let gfx = backgroundCanvas.getContext('2d');
        gfx.clearRect(0, 0, backgroundCanvas.width, backgroundCanvas.height);
        gfx.drawImage(primaryBackgroundCanvas, 0, 0);
        gfx.drawImage(secondaryBackgroundCanvas, 0, 0);
        realityEditor.device.desktopStats.imageRendered();
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

    realityEditor.addons.addCallback('init', initService);
})(realityEditor.gui.ar.desktopRenderer);
