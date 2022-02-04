createNameSpace('realityEditor.videoPlayback');

(function (exports) {
    class Coordinator {
        constructor() {
            this.colorVideoCanvas = null;
            this.depthVideoCanvas = null;
            this.displayPointClouds = true;
        }
        createCanvases() {
            // [x] create a canvas for the video to be written to so its pixel data can be extracted
            // TODO: move to OffscreenCanvas and worker thread (https://developers.google.com/web/updates/2018/08/offscreen-canvas)
            let colorVideoCanvas = document.createElement('canvas');
            colorVideoCanvas.id = 'colorVideoCanvas';
            colorVideoCanvas.width = 960;
            colorVideoCanvas.height = 540;
            // colorVideoCanvas.style.display = 'none';
            document.body.appendChild(colorVideoCanvas);
            this.colorVideoCanvas = colorVideoCanvas;

            let depthVideoCanvas = document.createElement('canvas');
            depthVideoCanvas.id = 'depthVideoCanvas';
            depthVideoCanvas.width = 256;
            depthVideoCanvas.height = 144;
            // depthVideoCanvas.style.display = 'none';
            document.body.appendChild(depthVideoCanvas);
            this.depthVideoCanvas = depthVideoCanvas;
        }
        load() {
            this.timeline = new realityEditor.videoPlayback.Timeline();
            this.videoSources = new realityEditor.videoPlayback.VideoSources((videoInfo, trackInfo) => {
                console.log('Coordinator got videoInfo, trackInfo');
                this.timeline.loadTracks(trackInfo);
                this.createCanvases();
            });
            this.timeline.onVideoFrame((colorVideo, depthVideo, deviceId, segmentId) => {
                let colorCtx = this.colorVideoCanvas.getContext('2d');
                let depthCtx = this.depthVideoCanvas.getContext('2d');
                colorCtx.drawImage(colorVideo, 0, 0, 960, 540);
                depthCtx.drawImage(depthVideo, 0, 0);

                // console.log('timeupdate: ', colorVideoElement.currentTime);
                let timeMs = colorVideo.currentTime * 1000;
                let segmentInfo = this.videoSources.getSegmentInfo(deviceId, segmentId);
                let absoluteTime = segmentInfo.start + timeMs * segmentInfo.timeMultiplier;

                // TODO: getImageData and pass buffers to point cloud renderer
                // let colorPixels = colorCtx.getImageData(0, 0, 960, 540);
                // let depthPixels = depthCtx.getImageData(0, 0, 256, 144);
                let colorImageUrl = this.colorVideoCanvas.toDataURL('image/jpeg');
                let depthImageUrl = this.depthVideoCanvas.toDataURL('image/png');

                // let poseMatrix = this.extractPoseFromDepthCanvas();
                let closestPose = this.videoSources.getClosestPose(deviceId, segmentId, absoluteTime);
                if (closestPose) {
                    this.processPointCloud(deviceId, colorImageUrl, depthImageUrl, closestPose);
                }
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
        setPointCloudCallback(callback) {
            this.loadPointCloud = callback;
        }
    }
    exports.Coordinator = Coordinator;
})(realityEditor.videoPlayback);
