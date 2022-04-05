createNameSpace('realityEditor.videoPlayback');

(function (exports) {
    class Coordinator {
        constructor() {
            this.displayPointClouds = true;
            this.canvasElements = {};
            this.timelineVisibile = true;
        }
        load() {
            this.timeline = new realityEditor.videoPlayback.Timeline();
            this.videoSources = new realityEditor.videoPlayback.VideoSources((videoInfo, trackInfo) => {
                console.log('Coordinator got videoInfo, trackInfo');
                this.timeline.loadTracks(trackInfo);
                let datesList = Object.keys(this.videoSources.getDatesWithVideos()).map(stringified => new Date(stringified));
                this.timeline.setDatesWithVideos(datesList);
                // TODO: make the VideoSources listen for newly uploaded videos, and when loaded, append to timeline
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
            this.timeline.onSegmentSelected((_deviceId, _segmentId) => {
                console.log('segment selected');
            });
            this.timeline.onSegmentDeselected((deviceId, _segmentId) => {
                console.log('segment deselected');

                if (typeof this.hidePointCloud !== 'undefined') {
                    let cameraId = parseInt(deviceId.replace('device_', ''));
                    this.hidePointCloud(cameraId);
                }
            });

            this.timelineVisibilityButton = document.createElement('img');
            this.timelineVisibilityButton.id = 'timelineVisibilityButton';
            this.timelineVisibilityButton.src = '/addons/vuforia-spatial-remote-operator-addon/showTimelineButton.svg';
            document.body.appendChild(this.timelineVisibilityButton);
            this.timelineVisibilityButton.addEventListener('pointerup', _ev => {
                this.toggleVisibility();
            });
            this.toggleVisibility(); // default to hidden

            // hide timeline visibility toggle if there are no recorded clips
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
        setHidePointCloudCallback(callback) {
            this.hidePointCloud = callback;
        }
        togglePointClouds() {
            this.displayPointClouds = !this.displayPointClouds;
        }
        toggleVisibility() {
            if (this.timelineVisibile) {
                this.timelineVisibile = false;
                this.timelineVisibilityButton.src = '/addons/vuforia-spatial-remote-operator-addon/showTimelineButton.svg';
                this.timelineVisibilityButton.classList.remove('timelineVisibilityButtonOpen');
            } else {
                this.timelineVisibile = true;
                this.timelineVisibilityButton.src = '/addons/vuforia-spatial-remote-operator-addon/hideTimelineButton.svg';
                this.timelineVisibilityButton.classList.add('timelineVisibilityButtonOpen');
            }

            this.timeline.toggleVisibility(this.timelineVisibile);
        }
        handleKeyUp(code) {
            if (code === 'KeyY') {
                this.toggleVisibility();
            } else if (code === 'KeyU') {
                // this.togglePointClouds(); // this isn't really useful at the moment, but maybe in future we want again
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
