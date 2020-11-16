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
    	imagesPerSecond = numImages / (currentImageTime/1000);
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
    	stats.dom.style.visibility = 'hidden';
    	imagesPerSecondElement.style.visibility = 'hidden';
    	isVisible = false;
    }

    exports.imageRendered = imageRendered;
    exports.resetImageTimer = resetImageTimer;
    exports.show = show;
    exports.hide = hide;

    realityEditor.addons.addCallback('init', initService);
})(realityEditor.device.desktopStats);
