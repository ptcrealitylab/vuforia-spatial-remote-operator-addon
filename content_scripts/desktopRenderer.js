createNameSpace('realityEditor.gui.ar.desktopRenderer');

/**
 * @fileOverview realityEditor.device.desktopRenderer.js
 * For remote desktop operation: renders background graphics simulating the context streamed from a connected phone.
 * e.g. a point or plane for each marker, or an entire point cloud of the background contents
 */

(function(exports) {

    var TEMP_DISABLE_MARKER_PLANES = true;

    var visibleObjectsCopy = {};
    var elementsAdded = [];

    var utilities = realityEditor.gui.ar.utilities;
    var tempResMatrix = [];
    var activeObjectMatrix = [];

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

    /**
     * Public init method to enable rendering if isDesktop
     */
    function initService() {
        if (!realityEditor.device.desktopAdapter.isDesktop()) { return; }

        // if (!TEMP_DISABLE_MARKER_PLANES) {
        //
        //     // registers a callback to the gui.ar.draw.update loop so that this module can manage its own rendering
        //     realityEditor.gui.ar.draw.addUpdateListener(function(visibleObjects) {
        //
        //         // remove old plane elements that have disappeared
        //         for (var objectKey in visibleObjectsCopy) {
        //             if (!visibleObjectsCopy.hasOwnProperty(objectKey)) continue;
        //             if (!visibleObjects.hasOwnProperty(objectKey)) {
        //                 removePlaneElement(objectKey);
        //             }
        //         }
        //
        //         // cache the most recent visible objects so we can detect when one disappears
        //         visibleObjectsCopy = visibleObjects;
        //
        //         for (objectKey in visibleObjects) {
        //             if (!visibleObjects.hasOwnProperty(objectKey)) continue;
        //             if (!objects.hasOwnProperty(objectKey)) continue;
        //
        //             var object = realityEditor.getObject(objectKey);
        //             if (object.isWorldObject) continue;
        //             if (object.hasOwnProperty('targetType') && object.targetType === 'model') continue;
        //
        //             renderMarkerPlane(objectKey, visibleObjects[objectKey]);
        //         }
        //
        //     });
        //
        // }

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

    // function renderMarkerPlane(objectKey, visibleObjectMatrix) {
    //     // var object = realityEditor.getObject(objectKey);
    //
    //     // create div for ghost if needed
    //     if (!globalDOMCache['plane' + objectKey]) {
    //         createPlaneElement(objectKey);
    //     } else {
    //         if (globalDOMCache['plane' + objectKey].style.display === 'none') {
    //             globalDOMCache['plane' + objectKey].style.display = 'inline';
    //         }
    //     }
    //
    //     utilities.multiplyMatrix(visibleObjectMatrix, globalStates.projectionMatrix, activeObjectMatrix);
    //
    //     var finalMatrix = activeObjectMatrix;
    //
    //     // adjust Z-index so it gets rendered behind all the real frames/nodes
    //     // calculate center Z of frame to know if it is mostly in front or behind the marker plane
    //     var projectedPoint = realityEditor.gui.ar.utilities.multiplyMatrix4([0, 0, 0, 1], activeObjectMatrix);
    //     finalMatrix[14] = -5 + 1000000 / Math.max(10, projectedPoint[2]); // (don't add extra 200) so it goes behind real
    //
    //     if (globalStates.guiState !== 'ui') {
    //         finalMatrix[14] = 100;
    //     }
    //
    //     // actually adjust the CSS to draw it with the correct transformation
    //     globalDOMCache['plane' + objectKey].style.transform = 'matrix3d(' + finalMatrix.toString() + ')'; // TODO: simplify to something meaningful
    //
    //     // // store the screenX and screenY within the ghost to help us later draw lines to the ghosts
    //     // var ghostCenterPosition = getDomElementCenterPosition(globalDOMCache['ghost' + activeKey]);
    //     // ghostVehicle.screenX = ghostCenterPosition.x;
    //     // ghostVehicle.screenY = ghostCenterPosition.y;
    //
    // }

    // /**
    //  * Creates a dotted-outline DOM element for the given frame or node, using its width and height.
    //  * Styles it differently (red) if the reason for the ghost is that the frame/node was deleted.
    //  * Also add it to the elementsAdded list, to keep track of which ghosts are in existence.
    //  * @param {string} objectKey
    //  */
    // function createPlaneElement(objectKey) {
    //     var object = realityEditor.getObject(objectKey);
    //
    //     var planeDiv = document.createElement('div');
    //     planeDiv.id = 'plane' + objectKey;
    //     planeDiv.classList.add('main', 'ignorePointerEvents', 'visibleFrameContainer');
    //
    //     planeDiv.style.width = globalStates.height + 'px';
    //     planeDiv.style.height = globalStates.width + 'px';
    //     planeDiv.style.left = 0;
    //     planeDiv.style.top = 0;
    //
    //     var innerPlane = document.createElement('img');
    //     innerPlane.classList.add('markerPlaneElement');
    //     var innerWidth = object.targetSize.width * 1000;
    //     var innerHeight = object.targetSize.height * 1000;
    //     innerPlane.style.width = innerWidth + 'px';
    //     innerPlane.style.height = innerHeight + 'px';
    //     innerPlane.style.left = (globalStates.height - innerWidth) / 2 + 'px';
    //     innerPlane.style.top = (globalStates.width - innerHeight) / 2 + 'px';
    //
    //     var objectName = objectKey.slice(0, -12); // get objectName from objectId
    //     innerPlane.src = 'http://' + object.ip + ':' + httpPort + '/obj/' + objectName + '/target/target.jpg';
    //
    //     planeDiv.appendChild(innerPlane);
    //
    //     document.getElementById('GUI').appendChild(planeDiv);
    //     globalDOMCache['plane' + objectKey] = planeDiv;
    //
    //     // maintain an elementsAdded list so that we can remove them all on demand
    //     elementsAdded.push(objectKey);
    // }
    //
    // function removePlaneElement(objectKey) {
    //     if (globalDOMCache['plane' + objectKey]) {
    //         globalDOMCache['plane' + objectKey].style.display = 'none';
    //     }
    // }

    exports.processImageFromSource = processImageFromSource;

    realityEditor.addons.addCallback('init', initService);
})(realityEditor.gui.ar.desktopRenderer);
