createNameSpace('realityEditor.videoPlayback');

(function (exports) {
    const DEVICE_ID_PREFIX = 'device'; // should match DEVICE_ID_PREFIX in backend recording system
    let menuItemsAdded = false;
    class Coordinator {
        constructor() {
            this.displayPointClouds = true;
            this.canvasElements = {};
            this.timelineVisibile = true;
            this.POSE_FPS = 10; // if the recording FPS changes, this const needs to be updated to synchronize the playback
        }
        load() {
            let playback = realityEditor.videoPlayback;
            // this.timeline = new playback.Timeline();
            this.timelineController = new playback.TimelineController();
            // this.timelineModel = new playback.TimelineModel();
            this.database = new playback.TimelineDatabase();
            this.videoSources = new playback.VideoSources((videoInfo, trackInfo) => {
                console.log('Coordinator got videoInfo, trackInfo', trackInfo);
                for (const [trackId, trackData] of Object.entries(trackInfo.tracks)) {
                    // create new DataTrack() and add to database
                    console.log(trackId, trackData);
                    let track = new playback.DataTrack(trackId, playback.TRACK_TYPES.VIDEO_3D);
                    for (const [segmentId, segmentData] of Object.entries(trackData.segments)) {
                        let segment = new playback.DataSegment(segmentId, playback.TRACK_TYPES.VIDEO_3D, segmentData.start, segmentData.end);
                        let colorVideo = new playback.DataPiece('colorVideo', playback.DATA_PIECE_TYPES.VIDEO_URL);
                        colorVideo.setVideoUrl(segmentData.colorVideo); // TODO: set absolute URL
                        let depthVideo = new playback.DataPiece('depthVideo', playback.DATA_PIECE_TYPES.VIDEO_URL);
                        depthVideo.setVideoUrl(segmentData.depthVideo); // TODO: set absolute URL
                        let poses = new playback.DataPiece('poses', playback.DATA_PIECE_TYPES.TIME_SERIES);
                        poses.setTimeSeriesData(segmentData.poses);
                        segment.addDataPiece(colorVideo);
                        segment.addDataPiece(depthVideo);
                        segment.addDataPiece(poses);
                        track.addSegment(segment);
                    }
                    this.database.addTrack(track);
                }
                console.log(this.database);

                // this.timeline.loadTracks(trackInfo);
                this.timelineController.setDatabase(this.database);

                // let datesList = Object.keys(this.videoSources.getDatesWithVideos()).map(stringified => new Date(stringified));
                // let datesList = this.videoSources.getDatesWithVideos();
                // this.timeline.setDatesWithVideos(datesList);
                // TODO: make the VideoSources listen for newly uploaded videos, and when loaded, append to timeline
            });
            this.timelineController.onVideoFrame((colorVideo, depthVideo, deviceId, segmentId) => {
                let colorVideoCanvas = this.getCanvasElement(deviceId, 'color');
                let depthVideoCanvas = this.getCanvasElement(deviceId, 'depth');

                let colorCtx = colorVideoCanvas.getContext('2d');
                let depthCtx = depthVideoCanvas.getContext('2d');
                colorCtx.drawImage(colorVideo, 0, 0, 960, 540);
                depthCtx.drawImage(depthVideo, 0, 0, 256, 144);

                // robust way to get pose that matches actual video playback currentTime (independent of offset, viewport, etc)
                // a 179.5 second video has 1795 poses, so use the (video timestamp * 10) as index to retrieve pose (10fps-dependent)
                let closestPose = this.videoSources.getPoseAtIndex(deviceId, segmentId, Math.floor(colorVideo.currentTime * this.POSE_FPS));

                let colorImageUrl = colorVideoCanvas.toDataURL('image/jpeg');
                let depthImageUrl = depthVideoCanvas.toDataURL('image/png');

                if (closestPose) {
                    this.processPointCloud(deviceId, colorImageUrl, depthImageUrl, closestPose);
                }
            });
            // this.timeline.onSegmentSelected((_deviceId, _segmentId) => {
            //     console.log('segment selected');
            // });
            // this.timeline.onSegmentDeselected((deviceId, _segmentId) => {
            //     console.log('segment deselected');
            //
            //     if (typeof this.hidePointCloud !== 'undefined') {
            //         let cameraId = parseInt(deviceId.replace(DEVICE_ID_PREFIX, ''));
            //         this.hidePointCloud(cameraId);
            //     }
            // });

            this.timelineVisibilityButton = document.createElement('img');
            this.timelineVisibilityButton.id = 'timelineVisibilityButton';
            this.timelineVisibilityButton.src = '/addons/vuforia-spatial-remote-operator-addon/showTimelineButton.svg';
            document.body.appendChild(this.timelineVisibilityButton);
            this.timelineVisibilityButton.addEventListener('pointerup', _ev => {
                this.toggleVisibility();
            });
            this.toggleVisibility(false); // default to hidden

            // hide timeline visibility toggle if there are no recorded clips
        }
        processPointCloud(deviceId, colorImageUrl, depthImageUrl, poseMatrix) {
            if (!this.displayPointClouds) {
                return;
            }
            if (typeof this.loadPointCloud !== 'undefined') {
                let cameraId = parseInt(deviceId.replace(DEVICE_ID_PREFIX, '')) + 255; // go outside the range of camera ids
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
        toggleVisibility(toggled) {
            if (this.timelineVisibile || (typeof toggled !== 'undefined' && !toggled)) {
                this.timelineVisibile = false;
                this.timelineVisibilityButton.src = '/addons/vuforia-spatial-remote-operator-addon/showTimelineButton.svg';
                this.timelineVisibilityButton.classList.remove('timelineVisibilityButtonOpen');
            } else {
                this.timelineVisibile = true;
                this.timelineVisibilityButton.src = '/addons/vuforia-spatial-remote-operator-addon/hideTimelineButton.svg';
                this.timelineVisibilityButton.classList.add('timelineVisibilityButtonOpen');

                if (!menuItemsAdded) {
                    menuItemsAdded = true;
                    // set up keyboard shortcuts
                    let togglePlayback = new realityEditor.gui.MenuItem('Toggle Playback', { shortcutKey: 'SPACE', toggle: true, defaultVal: false}, (toggled) => {
                        this.timelineController.togglePlayback(toggled);
                    });
                    realityEditor.gui.getMenuBar().addItemToMenu(realityEditor.gui.MENU.History, togglePlayback);

                    let slower = new realityEditor.gui.MenuItem('Slower', { shortcutKey: 'COMMA' }, () => {
                        this.timelineController.multiplySpeed(0.5, false);
                    });
                    realityEditor.gui.getMenuBar().addItemToMenu(realityEditor.gui.MENU.History, slower);

                    let faster = new realityEditor.gui.MenuItem('Faster', { shortcutKey: 'PERIOD' }, () => {
                        this.timelineController.multiplySpeed(2.0, false);
                    });
                    realityEditor.gui.getMenuBar().addItemToMenu(realityEditor.gui.MENU.History, faster);
                }
            }

            this.timelineController.toggleVisibility(this.timelineVisibile);
        }
    }
    exports.Coordinator = Coordinator;
})(realityEditor.videoPlayback);
