createNameSpace('realityEditor.videoPlayback');

(function (exports) {
    class Timeline {
        constructor() {
            this.playheadTimestamp = Date.now();
            this.playbackSpeed = 1;
            this.isPlaying = false;
            this.callbacks = {
                onVideoFrame: [],
                onSegmentSelected: [],
                onSegmentDeselected: []
            };
            this.selectedSegments = {};

            this.buildHTMLElements();
        }
        loadTracks(trackInfo) {
            this.trackInfo = trackInfo;

            this.setupPlayhead();

            // [x] create a track on the timeline for each pair of videos – vertically spaced per device – horizontally per timestamp
            this.createVideoTracks();
            this.playheadTimestamp = this.trackInfo.metadata.minTime;

            this.addPlaybackListeners();
        }
        addPlaybackListeners() {
            // TODO: how to handle video preview of multiple parallel tracks?
            this.colorVideoPreview.addEventListener('timeupdate', () => {
                let selectedSegments = this.getSelectedSegments();
                selectedSegments.forEach(selected => {
                    this.callbacks.onVideoFrame.forEach(callback => {
                        // TODO: associate a different video element with each track
                        callback(this.colorVideoPreview, this.depthVideoPreview, selected.deviceId, selected.segmentId);
                    });
                });

                // let colorCtx = this.colorVideoCanvas.getContext('2d');
                // let depthCtx = this.depthVideoCanvas.getContext('2d');
                // colorCtx.drawImage(this.colorVideoPreview, 0, 0, 960, 540);
                // depthCtx.drawImage(this.depthVideoPreview, 0, 0);
                //
                // let selectedSegments = this.getSelectedSegments();
                // if (selectedSegments.length === 0) { return; } // TODO: make it work even if no selected segment
                //
                // // console.log('timeupdate: ', colorVideoElement.currentTime);
                // let timeMs = this.colorVideoPreview.currentTime * 1000;
                // let segmentInfo = this.trackInfo.tracks[selectedSegments[0].deviceId].segments[selectedSegments[0].segmentId];
                // let absoluteTime = segmentInfo.start + timeMs * segmentInfo.timeMultiplier;
                //
                // // TODO: getImageData and pass buffers to point cloud renderer
                // // let colorPixels = colorCtx.getImageData(0, 0, 960, 540);
                // // let depthPixels = depthCtx.getImageData(0, 0, 256, 144);
                // let colorImageUrl = this.colorVideoCanvas.toDataURL('image/jpeg');
                // let depthImageUrl = this.depthVideoCanvas.toDataURL('image/png');
                //
                // // let depthImageData = this.depthVideoCanvas.getContext('2d').getImageData(0, 0, 256, 144).data;
                //
                // // let poseMatrix = this.extractPoseFromDepthCanvas();
                // let closestPose = this.getClosestPose(selectedSegments[0].deviceId, selectedSegments[0].segmentId, absoluteTime);
                // if (closestPose) {
                //     this.processPointCloud(selectedSegments[0].deviceId, colorImageUrl, depthImageUrl, closestPose);
                // }
                // // this.processPointCloud(selectedSegments[0].deviceId, colorImageUrl, depthImageUrl, [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
                //
                // // this function triggers in two cases: scrolling and playing the video.
                // // in the case of playing the video, we need to match the scroll playhead with video progress
                // // if (this.isPlaying) {
                // //     this.movePlayheadToTime(absoluteTime);
                // //     this.setPlayheadTimestamp(absoluteTime);
                // // }
            });
        }
        getSelectedSegments() {
            // key = deviceId, value = segmentId
            return Object.keys(this.selectedSegments).map(function(deviceId) {
                return {
                    deviceId: deviceId,
                    segmentId: this.selectedSegments[deviceId]
                };
            }.bind(this)).filter(info => !!info.segmentId);
        }
        buildHTMLElements() {
            // [x] create a timeline
            // [x] create a playhead on the timeline for scrolling
            // [x] create a play and pause button
            this.timelineContainer = this.createTimelineElement();
            document.body.appendChild(this.timelineContainer);

            // [x] create two preview videos
            let firstColorSrc = ''; //'http://' + this.ip + ':8080/virtualizer_recording/' + info.color[0];
            let firstDepthSrc = ''; //'http://' + this.ip + ':8080/virtualizer_recording/' + info.depth[0];

            console.log('create video HTML elements');
            let colorVideoElement = this.createVideoElement('colorVideoPreview', firstColorSrc);
            let depthVideoElement = this.createVideoElement('depthVideoPreview', firstDepthSrc);
            this.colorVideoPreview = colorVideoElement;
            this.depthVideoPreview = depthVideoElement;

            let videoPreviewContainer = document.getElementById('timelineVideoPreviewContainer');
            videoPreviewContainer.appendChild(colorVideoElement);
            videoPreviewContainer.appendChild(depthVideoElement);
            depthVideoElement.style.left = 256 + 'px';
        }
        createTimelineElement() {
            let container = document.createElement('div');
            container.id = 'timelineContainer';
            // container has a left box to hold the layer visibility toggles, a center box for the timeline, and a right box for playback controls
            let leftBox = document.createElement('div');
            let centerBox = document.createElement('div');
            let rightBox = document.createElement('div');
            [leftBox, centerBox, rightBox].forEach(elt => {
                elt.classList.add('timelineBox');
                container.appendChild(elt);
            });
            leftBox.id = 'timelineVisibilityBox';
            centerBox.id = 'timelineTrackBox';
            rightBox.id = 'timelineControlsBox';

            let timestampDisplay = document.createElement('div');
            timestampDisplay.id = 'timelineTimestampDisplay';
            timestampDisplay.innerText = this.getFormattedTime(new Date(0));
            leftBox.appendChild(timestampDisplay);

            let playhead = document.createElement('img');
            playhead.id = 'timelinePlayhead';
            playhead.src = '/addons/vuforia-spatial-remote-operator-addon/timelinePlayhead.svg';
            centerBox.appendChild(playhead);
            this.playhead = playhead;

            let videoPreviewContainer = document.createElement('div');
            videoPreviewContainer.id = 'timelineVideoPreviewContainer';
            videoPreviewContainer.classList.add('timelineBox');
            centerBox.appendChild(videoPreviewContainer);
            // left = -68px is most left as possible
            // width = 480px for now, to show both, but should change to 240px eventually

            let playButton = document.createElement('img');
            playButton.id = 'timelinePlayButton';
            playButton.src = '/addons/vuforia-spatial-remote-operator-addon/playButton.svg';

            let seekButton = document.createElement('img');
            seekButton.id = 'timelineSeekButton';
            seekButton.src = '/addons/vuforia-spatial-remote-operator-addon/seekButton.svg';

            let speedButton = document.createElement('img');
            speedButton.id = 'timelineSpeedButton';
            speedButton.src = '/addons/vuforia-spatial-remote-operator-addon/speedButton_1x.svg';

            [playButton, seekButton, speedButton].forEach(elt => {
                elt.classList.add('timelineControlButton');
                rightBox.appendChild(elt);
            });
            this.setupControlButtons(playButton, seekButton, speedButton);

            return container;
        }
        setupPlayhead() {
            let playheadElement = this.playhead;
            document.addEventListener('pointermove', e => {
                if (!this.playheadClickedDown) { return; }

                // calculate new X position to follow mouse, constrained to trackBox element
                let pointerX = e.pageX;

                let trackBox = document.getElementById('timelineTrackBox');
                let containerLeft = trackBox.getClientRects()[0].left;
                let containerWidth = trackBox.getClientRects()[0].width;

                let relativeX = pointerX - containerLeft;
                let leftMargin = 20;
                let rightMargin = 20;
                let halfPlayheadWidth = 10;
                playheadElement.style.left = Math.min(containerWidth - halfPlayheadWidth - rightMargin, Math.max(leftMargin, relativeX)) - halfPlayheadWidth + 'px';

                // move timelineVideoPreviewContainer to correct spot (constrained to -68px < left < (innerWidth - 588)
                let videoPreviewContainer = document.getElementById('timelineVideoPreviewContainer');
                if (videoPreviewContainer && videoPreviewContainer.getClientRects()[0]) {
                    let previewWidth = videoPreviewContainer.getClientRects()[0].width;
                    let previewRelativeX = parseInt(playheadElement.style.left) + halfPlayheadWidth - previewWidth / 2;
                    videoPreviewContainer.style.left = Math.min((window.innerWidth - previewWidth) - 160, Math.max(-128, previewRelativeX)) + 'px';
                }

                let playheadTimePercent = (parseInt(playheadElement.style.left) + halfPlayheadWidth - leftMargin) / (containerWidth - halfPlayheadWidth - leftMargin - rightMargin);
                let duration = this.trackInfo.metadata.maxTime - this.trackInfo.metadata.minTime;

                let absoluteTime = this.trackInfo.metadata.minTime + playheadTimePercent * duration;
                this.setPlayheadTimestamp(absoluteTime);
                this.timeScrolledTo(absoluteTime, true);
            });
            playheadElement.addEventListener('pointerdown', _e => {
                this.playheadClickedDown = true;
                playheadElement.classList.add('timelinePlayheadSelected');

                let videoPreview = document.getElementById('timelineVideoPreviewContainer');
                videoPreview.classList.add('timelineVideoPreviewSelected');

                if (this.isPlaying) {
                    this.pauseVideoPlayback();
                }
            });
            document.addEventListener('pointerup', _e => {
                this.playheadClickedDown = false;
                playheadElement.classList.remove('timelinePlayheadSelected');

                let videoPreview = document.getElementById('timelineVideoPreviewContainer');
                videoPreview.classList.remove('timelineVideoPreviewSelected');
            });
            document.addEventListener('pointercancel', _e => {
                this.playheadClickedDown = false;
                playheadElement.classList.remove('timelinePlayheadSelected');

                let videoPreview = document.getElementById('timelineVideoPreviewContainer');
                videoPreview.classList.remove('timelineVideoPreviewSelected');
            });
        }
        forEachTrack(callback) {
            Object.keys(this.trackInfo.tracks).forEach(deviceId => {
                if (this.trackInfo.tracks[deviceId]) {
                    callback(deviceId, this.trackInfo.tracks[deviceId]);
                }
            });
        }
        forEachSegment(deviceId = null, callback) {
            if (!deviceId) {
                this.forEachTrack((deviceId, trackInfo) => {
                    Object.keys(trackInfo.segments).forEach(segmentId => {
                        if (trackInfo.segments[segmentId]) {
                            callback(deviceId, segmentId, trackInfo, trackInfo.segments[segmentId]);
                        }
                    });
                });
            } else {
                if (this.trackInfo.tracks[deviceId]) {
                    Object.keys(this.trackInfo.tracks[deviceId].segments).forEach(segmentId => {
                        if (this.trackInfo.tracks[deviceId].segments[segmentId]) {
                            callback(deviceId, segmentId, this.trackInfo.tracks[deviceId], this.trackInfo.tracks[deviceId].segments[segmentId]);
                        }
                    });
                }
            }
        }
        segmentSelected(deviceId, segmentId, trackInfo, segment) {
            this.callbacks.onSegmentSelected.forEach(callback => {
                callback();
            });

            // load that video into the video players,
            let colorVideoSourceElement = this.colorVideoPreview.querySelector('source');
            let filename = segment.colorVideo.replace(/^.*[\\\/]/, '');
            colorVideoSourceElement.src = '/virtualizer_recording/' + deviceId + '/color/' + filename;
            // colorVideoSourceElement.src = 'http://localhost:8080/recordings/' + deviceId + '/session_videos/color/' + filename;
            this.colorVideoPreview.addEventListener('loadedmetadata', (_e) => {
                if (typeof segment.timeMultiplier === 'undefined') {
                    let videoDuration = this.colorVideoPreview.duration;
                    let intendedDuration = (segment.end - segment.start) / 1000;
                    segment.timeMultiplier = videoDuration / intendedDuration;
                    console.log('timeMultiplier for ' + filename + ' set to ' + segment.timeMultiplier);
                }
                this.colorVideoPreview.playbackRate = this.playbackSpeed * segment.timeMultiplier;
            });
            this.colorVideoPreview.load();
            console.log('src = ' + colorVideoSourceElement.src);

            let depthVideoSourceElement = this.depthVideoPreview.querySelector('source');
            filename = segment.depthVideo.replace(/^.*[\\\/]/, '');
            depthVideoSourceElement.src = '/virtualizer_recording/' + deviceId + '/depth/' + filename;
            // depthVideoSourceElement.src = 'http://localhost:8080/recordings/' + deviceId + '/session_videos/depth/' + filename;
            this.colorVideoPreview.addEventListener('loadedmetadata', (_e) => {
                if (typeof segment.timeMultiplier === 'undefined') {
                    let videoDuration = this.depthVideoPreview.duration;
                    let intendedDuration = (segment.end - segment.start) / 1000;
                    segment.timeMultiplier = videoDuration / intendedDuration;
                    console.log('timeMultiplier for ' + filename + ' set to ' + segment.timeMultiplier);
                }
                this.depthVideoPreview.playbackRate = this.playbackSpeed * segment.timeMultiplier;
            });
            this.depthVideoPreview.load();
            console.log('src = ' + depthVideoSourceElement.src);

            if (this.isPlaying) {
                this.playVideoPlayback(); // actually play the videos
            }
        }
        segmentDeselected(deviceId, segmentId) {
            console.log('deselected segment ' + segmentId + ' on track ' + deviceId);

            this.callbacks.onSegmentSelected.forEach(callback => {
                callback();
            });
        }
        onTimeUpdated(deviceId, segmentId, timestamp) {
            let segment = this.trackInfo.tracks[deviceId].segments[segmentId];
            let currentTime = (segment.timeMultiplier || 1) * (timestamp - segment.start) / 1000;
            // console.log(currentTime);
            this.colorVideoPreview.currentTime = currentTime;
            this.depthVideoPreview.currentTime = currentTime;
        }
        timeScrolledTo(timestamp, interaction) {
            // check if timestamp is within [start,end] for any of the segments on all of the tracks
            let anySegmentSelected = false;

            this.forEachTrack((deviceId, _trackInfo) => {
                let deviceHasSelectedSegment = false;
                this.forEachSegment(deviceId, (deviceId, segmentId, trackInfo, segment) => {
                    if (timestamp >= segment.start && timestamp <= segment.end) {
                        deviceHasSelectedSegment = true;
                        if (this.selectedSegments[deviceId] !== segmentId) {
                            this.segmentSelected(deviceId, segmentId, trackInfo, segment);
                        }
                        this.selectedSegments[deviceId] = segmentId;
                        anySegmentSelected = true; // this makes sure we stick with first track's segment

                        //  and set the currentTime to the correct converted timestamp
                        if (interaction) {
                            this.onTimeUpdated(deviceId, segmentId, timestamp);
                        }
                    }
                });
                if (!deviceHasSelectedSegment) {
                    if (this.selectedSegments[deviceId]) {
                        this.segmentDeselected(deviceId, this.selectedSegments[deviceId]);
                    }
                    this.selectedSegments[deviceId] = null;
                }
            });

            if (anySegmentSelected) {
                let videoPreview = document.getElementById('timelineVideoPreviewContainer');
                videoPreview.classList.remove('timelineVideoPreviewNoSource');
            } else {
                let videoPreview = document.getElementById('timelineVideoPreviewContainer');
                videoPreview.classList.add('timelineVideoPreviewNoSource');
            }
        }
        setPlayheadTimestamp(timestamp) {
            this.playheadTimestamp = timestamp;
            let relativeTime = timestamp - this.trackInfo.metadata.minTime;
            let textfield = document.getElementById('timelineTimestampDisplay');
            textfield.innerText = this.getFormattedTime(relativeTime);
        }
        setupControlButtons(playButton, seekButton, speedButton) {
            playButton.addEventListener('pointerup', _e => {
                if (this.isPlaying) {
                    this.pauseVideoPlayback();
                } else {
                    if (this.playheadTimestamp === this.trackInfo.metadata.maxTime) {
                        this.playheadTimestamp = this.trackInfo.metadata.minTime;
                    }
                    this.playVideoPlayback();
                }
            });
            // TODO: what does seek button do?
            speedButton.addEventListener('pointerup', _e => {
                this.playbackSpeed *= 2;
                if (this.playbackSpeed > 64) {
                    this.playbackSpeed = 1;
                }
                speedButton.src = '/addons/vuforia-spatial-remote-operator-addon/speedButton_' + this.playbackSpeed + 'x.svg';

                // let selectedSegments = this.getSelectedSegments();
                // if (selectedSegments.length > 0) {
                //     let segment = this.selectedSegments[0];
                //     this.colorVideoPreview.playbackRate = this.playbackSpeed * segment.timeMultiplier;
                //     this.colorVideoPreview.playbackRate = this.playbackSpeed * segment.timeMultiplier;
                // }
            });
        }
        createVideoElement(id, src) {
            let video = document.createElement('video');
            video.id = id;
            video.classList.add('videoPreview');
            video.setAttribute('width', '256');
            video.setAttribute('controls', 'controls'); // TODO: remove this after done debugging
            video.setAttribute('muted', 'muted');
            let source = document.createElement('source');
            source.src = src;
            video.appendChild(source);
            return video;
        }
        playVideoPlayback() {
            this.colorVideoPreview.play();
            this.depthVideoPreview.play();
            this.isPlaying = true;

            let playheadElement = document.getElementById('timelinePlayhead');
            playheadElement.classList.add('timelinePlayheadPlaying');

            let videoPreview = document.getElementById('timelineVideoPreviewContainer');
            videoPreview.classList.add('timelineVideoPreviewPlaying');

            let playButton = document.getElementById('timelinePlayButton');
            playButton.src = '/addons/vuforia-spatial-remote-operator-addon/pauseButton.svg';
        }
        pauseVideoPlayback() {
            this.colorVideoPreview.pause();
            this.depthVideoPreview.pause();
            this.isPlaying = false;

            let playheadElement = document.getElementById('timelinePlayhead');
            playheadElement.classList.remove('timelinePlayheadPlaying');

            let videoPreview = document.getElementById('timelineVideoPreviewContainer');
            videoPreview.classList.remove('timelineVideoPreviewPlaying');

            let playButton = document.getElementById('timelinePlayButton');
            playButton.src = '/addons/vuforia-spatial-remote-operator-addon/playButton.svg';
        }
        createVideoTracks() {
            let numTracks = Object.keys(this.trackInfo.tracks).length;

            // each track gets a row
            // each segment gets a rectangle within that row
            for (let i = 0; i < numTracks; i++) {
                let thisTrackId = Object.keys(this.trackInfo.tracks)[i];
                console.log('creating elements for track: ' + thisTrackId);
                let trackElement = document.createElement('div');
                trackElement.classList.add('timelineTrack');
                document.getElementById('timelineTrackBox').appendChild(trackElement);

                let trackInfo = this.trackInfo.tracks[thisTrackId];
                this.positionAndScaleTrack(trackElement, trackInfo, i, numTracks);

                let segments = trackInfo.segments;
                Object.keys(segments).forEach(segmentId => {
                    console.log('creating elements for segment ' + segmentId + ' in track ' + thisTrackId);
                    let segmentElement = document.createElement('div');
                    segmentElement.classList.add('timelineSegment');
                    trackElement.appendChild(segmentElement);
                    this.positionAndScaleSegment(segmentElement, segments[segmentId], trackInfo);
                });
            }
        }
        positionAndScaleTrack(trackElement, trackInfo, index, numTracks) {
            console.log('position and scale track:');
            // console.log(trackElement, trackInfo, index, numTracks);
            let heightPercent = (80.0 / numTracks);
            let marginPercent = (20.0 / (numTracks + 1));
            trackElement.style.top = ((marginPercent * (index + 1)) + (heightPercent * index)) + '%';
            trackElement.style.height = heightPercent + '%';
        }
        positionAndScaleSegment(segmentElement, segmentInfo, trackInfo) {
            console.log('position and scale segment:');
            console.log(segmentElement, segmentInfo, trackInfo);
            let segmentDuration = segmentInfo.end - segmentInfo.start;

            let maxTime = this.trackInfo.metadata.maxTime; // Math.max(Date.now(), this.trackInfo.metadata.maxTime);
            let trackDuration = maxTime - this.trackInfo.metadata.minTime;
            let lengthPercent = segmentDuration / trackDuration * 100.0;
            let startPercent = (segmentInfo.start - this.trackInfo.metadata.minTime) / trackDuration * 100.0;
            segmentElement.style.width = lengthPercent + '%';
            segmentElement.style.left = startPercent + '%';
        }
        getFormattedTime(relativeTimestamp) {
            let timeSeconds = relativeTimestamp / 1000;
            let hours = Math.floor((timeSeconds / (60 * 60)) % 24);
            let minutes = Math.floor((timeSeconds / 60) % 60);
            let seconds = Math.floor(timeSeconds % 60);
            const zeroPad = (num, places) => String(num).padStart(places, '0');
            return zeroPad(hours, 2) + ':' + zeroPad(minutes, 2) + ':' + zeroPad(seconds, 2);
        }
        onVideoFrame(callback) {
            this.callbacks.onVideoFrame.push(callback);
        }
        onSegmentSelected(callback) {
            this.callbacks.onSegmentSelected.push(callback);
        }
        onSegmentDeselected(callback) {
            this.callbacks.onSegmentDeselected.push(callback);
        }
    }

    exports.Timeline = Timeline;
})(realityEditor.videoPlayback);
