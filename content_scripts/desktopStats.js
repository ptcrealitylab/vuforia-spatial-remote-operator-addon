/*
* Copyright © 2018 PTC
*
* This Source Code Form is subject to the terms of the Mozilla Public
* License, v. 2.0. If a copy of the MPL was not distributed with this
* file, You can obtain one at http://mozilla.org/MPL/2.0/.
*/

createNameSpace('realityEditor.device.desktopStats');

/**
 * @fileOverview realityEditor.device.desktopRenderer.js
 * For remote desktop operation: renders background graphics simulating the context streamed from a connected phone.
 * e.g. a point or plane for each marker, or an entire point cloud of the background contents
 */

(function(exports) {

    let stats = new Stats();

    let imagesPerSecond = 0;
    let numImages = 0;
    let imageStartTime = null;
    let currentImageTime = null;
    let imagesPerSecondElement = null;

    let isVisible = false;

    function initService() {
        if (!realityEditor.device.desktopAdapter.isDesktop()) { return; }

        document.body.appendChild(stats.dom);

    	imagesPerSecondElement = document.createElement('div');
    	imagesPerSecondElement.style.color = 'white';
    	imagesPerSecondElement.style.fontSize = '30px';
    	imagesPerSecondElement.style.position = 'absolute';
    	imagesPerSecondElement.style.left = '100px';
    	imagesPerSecondElement.style.top = '0';
    	document.body.appendChild(imagesPerSecondElement);

    	isVisible = true;

	    update(); // start update loop

        setTimeout(function () {
            hide();
        }, 1000);
    }

    function update() {
    	if (!isVisible) {
    		return;
    	}

        stats.update();
        requestAnimationFrame(update);

        if (imageStartTime !== null) {
        	updateImagesPerSecond();
        }
    }

    function startImageTimer() {
    	imageStartTime = (new Date()).getTime();
    }

    function resetImageTimer() {
    	numImages = 0;
    	imageStartTime = null;
    	currentImageTime = null;
    }

    function imageRendered() {
    	if (!isVisible) {
    		return;
    	}

    	if (currentImageTime > 10000) {
    		resetImageTimer(); // reset every 10 seconds to maintain accurate temporal averages
    	}
    	if (imageStartTime === null) {
    		startImageTimer();
    	}
    	numImages += 1;
    }

    function updateImagesPerSecond() {
    	currentImageTime = (new Date()).getTime() - imageStartTime;
    	imagesPerSecond = numImages / (currentImageTime / 1000);
    	imagesPerSecondElement.innerText = imagesPerSecond.toFixed(2);
    }

    function show() {
    	stats.dom.style.visibility = 'visible';
    	imagesPerSecondElement.style.visibility = 'visible';
    	isVisible = true;
    	resetImageTimer();
    	update();
    }

    function hide() {
        if (stats && stats.dom) {
            stats.dom.style.visibility = 'hidden';
        }
        if (imagesPerSecond) {
            imagesPerSecondElement.style.visibility = 'hidden';
        }
    	isVisible = false;
    }

    exports.imageRendered = imageRendered;
    exports.resetImageTimer = resetImageTimer;
    exports.show = show;
    exports.hide = hide;

    realityEditor.addons.addCallback('init', initService);
})(realityEditor.device.desktopStats);
