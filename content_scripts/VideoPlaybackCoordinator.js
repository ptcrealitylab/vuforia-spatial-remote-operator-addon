createNameSpace('realityEditor.videoPlayback');

(function (exports) {
    class Coordinator {
        constructor() {
            this.displayPointClouds = true;
            this.canvasElements = {};
        }
        load() {
            this.timeline = new realityEditor.videoPlayback.Timeline();
            this.videoSources = new realityEditor.videoPlayback.VideoSources((videoInfo, trackInfo) => {
                console.log('Coordinator got videoInfo, trackInfo');
                this.timeline.loadTracks(trackInfo);
            });
            this.timeline.onVideoFrame((colorVideo, depthVideo, deviceId, segmentId) => {
                let colorVideoCanvas = this.getCanvasElement(deviceId, 'color');
                let depthVideoCanvas = this.getCanvasElement(deviceId, 'depth');

                let colorCtx = colorVideoCanvas.getContext('2d');
                let depthCtx = depthVideoCanvas.getContext('2d');
                colorCtx.drawImage(colorVideo, 0, 0, 960, 540);
                depthCtx.drawImage(depthVideo, 0, 0, 256, 144);

                // robust way to get pose that matches actual video playback currentTime (independent of offset, viewport, etc)
                let segmentInfo = this.videoSources.getSegmentInfo(deviceId, segmentId);
                let videoTimePercent = colorVideo.currentTime / colorVideo.duration;
                let firstPoseTime = segmentInfo.poses[0].time;
                let lastPoseTime = segmentInfo.poses[segmentInfo.poses.length - 1].time;
                let computedTime = firstPoseTime + videoTimePercent * (lastPoseTime - firstPoseTime);

                let colorImageUrl = colorVideoCanvas.toDataURL('image/jpeg');
                let depthImageUrl = depthVideoCanvas.toDataURL('image/png');

                let closestPose = this.videoSources.getClosestPose(deviceId, segmentId, computedTime);
                if (closestPose) {
                    this.processPointCloud(deviceId, colorImageUrl, depthImageUrl, closestPose);
                }
            });
            this.timeline.onSegmentSelected(() => {
                console.log('segment selected');
            });
            this.timeline.onSegmentDeselected(() => {
                console.log('segment deselected');
            });
        }
        processPointCloud(deviceId, colorImageUrl, depthImageUrl, poseMatrix) {
            if (!this.displayPointClouds) {
                return;
            }
            if (typeof this.loadPointCloud !== 'undefined') {
                let cameraId = parseInt(deviceId.replace('device_', ''));
                this.loadPointCloud(cameraId, colorImageUrl, depthImageUrl, poseMatrix);
            }
        }
        getCanvasElement(trackId, colorOrDepth) {
            if (colorOrDepth !== 'color' && colorOrDepth !== 'depth') { console.warn('passing invalid colorOrDepth to getCanvasElement', colorOrDepth); }

            if (typeof this.canvasElements[trackId] === 'undefined') {
                this.canvasElements[trackId] = {};
            }
            if (typeof this.canvasElements[trackId].depth === 'undefined') {
                this.canvasElements[trackId].depth = this.createCanvasElement('depth_canvas_' + trackId, 256, 144);
            }
            if (typeof this.canvasElements[trackId].color === 'undefined') {
                this.canvasElements[trackId].color = this.createCanvasElement('color_canvas_' + trackId, 960, 540);
            }

            return this.canvasElements[trackId][colorOrDepth];
        }
        createCanvasElement(id, width, height) {
            let canvas = document.createElement('canvas');
            canvas.id = id;
            canvas.width = width;
            canvas.height = height;
            canvas.style.display = 'none';
            document.body.appendChild(canvas);
            return canvas;
        }
        setPointCloudCallback(callback) {
            this.loadPointCloud = callback;
        }
        togglePointClouds() {
            this.displayPointClouds = !this.displayPointClouds;
        }
        toggleVisibility() {
            this.timeline.toggleVisibility();
        }
        handleKeyUp(code) {
            if (code === 'KeyY') {
                this.toggleVisibility();
            } else if (code === 'KeyU') {
                this.togglePointClouds();
            } else if (code === 'Space') {
                this.timeline.togglePlayback();
            } else if (code === 'Comma') {
                this.timeline.multiplySpeed(0.5, false);
            } else if (code === 'Period') {
                this.timeline.multiplySpeed(2.0, false);
            }
        }
    }
    exports.Coordinator = Coordinator;
})(realityEditor.videoPlayback);
