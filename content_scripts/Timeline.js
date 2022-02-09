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
            this.selectedTrack = null;
            this.interactingWithSegment = null;
            this.timeOffsets = {};
            this.pointerStart = null;

            this.buildHTMLElements();
        }
        loadTracks(trackInfo) {
            this.trackInfo = trackInfo;

            // populate timeOffsets with default values
            console.log('create default timeOffsets');
            this.forEachSegment(null, (deviceId, segmentId, _trackInfo, _segmentInfo) => {
                if (typeof this.timeOffsets[deviceId] === 'undefined') {
                    this.timeOffsets[deviceId] = {};
                }
                if (typeof this.timeOffsets[deviceId][segmentId] === 'undefined') {
                    this.timeOffsets[deviceId][segmentId] = 0;
                }
            });

            this.setupPlayhead();

            // [x] create a track on the timeline for each pair of videos – vertically spaced per device – horizontally per timestamp
            this.createVideoTracks();
            this.playheadTimestamp = this.trackInfo.metadata.minTime;

            this.addPlaybackListeners();

            this.playLoop(); // only after DOM is built can we start the loop
        }
        addPlaybackListeners() {
            // TODO: how to handle video preview of multiple parallel tracks?
            this.colorVideoPreview.addEventListener('timeupdate', () => {
                let selectedSegments = this.getSelectedSegments();
                selectedSegments.forEach(selected => {
                    // trigger the external callbacks for each video
                    this.callbacks.onVideoFrame.forEach(callback => {
                        // TODO: associate a different video element with each track
                        callback(this.colorVideoPreview, this.depthVideoPreview, selected.deviceId, selected.segmentId);
                    });
                });
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
            // create a timeline, a playhead on the timeline for scrolling, and play/pause/controls
            this.timelineContainer = this.createTimelineElement();
            document.body.appendChild(this.timelineContainer);

            // create two preview videos
            console.log('create video HTML elements');
            let colorVideoElement = this.createVideoElement('colorVideoPreview');
            let depthVideoElement = this.createVideoElement('depthVideoPreview');
            this.colorVideoPreview = colorVideoElement;
            this.depthVideoPreview = depthVideoElement;

            // for now, add the video previews to move with the scrolling playhead
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
            document.addEventListener('pointerdown', e => {
                this.pointerStart = {
                    x: e.pageX,
                    y: e.pageY
                };
            });
            document.addEventListener('pointermove', e => {
                this.onDocumentPointerMove(e);
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
            document.addEventListener('pointerup', e => {
                this.onDocumentPointerUp(e);
            });
            document.addEventListener('pointercancel', e => {
                this.onDocumentPointerUp(e);
            });

            setTimeout(() => {
                console.log('move playhead to beginning');
                this.setPlayheadTimestamp(this.trackInfo.metadata.minTime);
                this.timeScrolledTo(this.trackInfo.metadata.minTime, true);
            }, 100);
        }
        forEachTrack(callback) {
            Object.keys(this.trackInfo.tracks).forEach(deviceId => {
                if (this.trackInfo.tracks[deviceId]) {
                    callback(deviceId, this.trackInfo.tracks[deviceId]);
                }
            });
        }
        onDocumentPointerUp(_e) {
            // reset playhead selection
            this.playheadClickedDown = false;
            let playheadElement = document.getElementById('timelinePlayhead');
            playheadElement.classList.remove('timelinePlayheadSelected');

            let videoPreview = document.getElementById('timelineVideoPreviewContainer');
            videoPreview.classList.remove('timelineVideoPreviewSelected');

            // reset track/segment selection
            if (this.interactingWithSegment) {
                // move segment if its timeOffset was changed
                let segmentElement = document.getElementById(this.getSegmentElementId(this.interactingWithSegment.trackId, this.interactingWithSegment.segmentId));
                if (segmentElement) {
                    this.positionAndScaleSegment(segmentElement, this.interactingWithSegment.trackId, this.interactingWithSegment.segmentId);
                }

                // this will cause the time of the video preview to update, if any is still under the playhead
                let timeOffset = this.timeOffsets[this.interactingWithSegment.trackId][this.interactingWithSegment.segmentId];
                let segment = this.trackInfo.tracks[this.interactingWithSegment.trackId].segments[this.interactingWithSegment.segmentId];
                if (this.playheadTimestamp >= (segment.start + timeOffset) && this.playheadTimestamp <= (segment.end + timeOffset)) {
                    this.onTimeUpdated(this.interactingWithSegment.trackId, this.interactingWithSegment.segmentId, this.playheadTimestamp);
                }

                this.deselectSegment(this.interactingWithSegment.trackId, this.interactingWithSegment.segmentId);
            }

            this.pointerStart = null;
        }
        onDocumentPointerMove(e) {
            if (this.playheadClickedDown) {
                this.onPointerMovePlayhead(e);
            } else if (this.interactingWithSegment) {
                this.onPointerMoveSegment(e);
            }
        }
        onPointerMovePlayhead(e) {
            let playheadElement = document.getElementById('timelinePlayhead');

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
        }
        onPointerMoveSegment(e) {
            let segmentElement = document.getElementById(this.getSegmentElementId(this.interactingWithSegment.trackId, this.interactingWithSegment.segmentId));
            if (!segmentElement) { return; }

            // calculate new X position to follow mouse, constrained to trackBox element
            let pointerX = e.pageX;
            let dx = pointerX - this.pointerStart.x;
            console.log('dx = ' + dx);

            let trackBox = document.getElementById('timelineTrackBox');
            // let containerLeft = trackBox.getClientRects()[0].left;
            let widthPixels = trackBox.getClientRects()[0].width;
            let widthTime = this.trackInfo.metadata.maxTime - this.trackInfo.metadata.minTime;
            let dTime = dx * (widthTime / widthPixels);

            console.log('dTime = ' + dTime + ', initial = ' + this.initialTimeOffset + ', result = ' + (dTime + this.initialTimeOffset));
            this.timeOffsets[this.interactingWithSegment.trackId][this.interactingWithSegment.segmentId] = (dTime + this.initialTimeOffset);

            this.positionAndScaleSegment(segmentElement, this.interactingWithSegment.trackId, this.interactingWithSegment.segmentId);

            // let relativeX = pointerX - containerLeft;
            // let leftMargin = 20;
            // let rightMargin = 20;
            // let halfPlayheadWidth = 10;
            // playheadElement.style.left = Math.min(containerWidth - halfPlayheadWidth - rightMargin, Math.max(leftMargin, relativeX)) - halfPlayheadWidth + 'px';
            //
            // // move timelineVideoPreviewContainer to correct spot (constrained to -68px < left < (innerWidth - 588)
            // let videoPreviewContainer = document.getElementById('timelineVideoPreviewContainer');
            // if (videoPreviewContainer && videoPreviewContainer.getClientRects()[0]) {
            //     let previewWidth = videoPreviewContainer.getClientRects()[0].width;
            //     let previewRelativeX = parseInt(playheadElement.style.left) + halfPlayheadWidth - previewWidth / 2;
            //     videoPreviewContainer.style.left = Math.min((window.innerWidth - previewWidth) - 160, Math.max(-128, previewRelativeX)) + 'px';
            // }
            //
            // let playheadTimePercent = (parseInt(playheadElement.style.left) + halfPlayheadWidth - leftMargin) / (containerWidth - halfPlayheadWidth - leftMargin - rightMargin);
            // let duration = this.trackInfo.metadata.maxTime - this.trackInfo.metadata.minTime;
            //
            // let absoluteTime = this.trackInfo.metadata.minTime + playheadTimePercent * duration;
            // this.setPlayheadTimestamp(absoluteTime);
            // this.timeScrolledTo(absoluteTime, true);
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

            // TODO: we need a video element for each device, but only display the one in the playhead preview if it's the selectedTrack

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
            let timeOffset = this.timeOffsets[deviceId][segmentId];
            let segment = this.trackInfo.tracks[deviceId].segments[segmentId];
            let currentTime = (segment.timeMultiplier || 1) * (timestamp - (segment.start + timeOffset)) / 1000;
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
                    let timeOffset = this.timeOffsets[deviceId][segmentId];
                    if (timestamp >= (segment.start + timeOffset) && timestamp <= (segment.end + timeOffset)) {
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
        movePlayheadToTime(timestamp) {
            // calculate new X position of playhead based on timestamp relative to full time range
            let trackBox = document.getElementById('timelineTrackBox');
            let containerWidth = trackBox.getClientRects()[0].width;
            let leftMargin = 20;
            let rightMargin = 20;
            let halfPlayheadWidth = 10;

            // calculate normalized time based on absolute timestamp
            let duration = this.trackInfo.metadata.maxTime - this.trackInfo.metadata.minTime;
            let timePercent = Math.max(0, Math.min(1, (timestamp - this.trackInfo.metadata.minTime) / duration));

            let playheadElement = document.getElementById('timelinePlayhead');
            // playheadElement.style.left = (timePercent * containerWidth) + leftMargin + halfPlayheadWidth + 'px';
            playheadElement.style.left = leftMargin - halfPlayheadWidth + (timePercent * (containerWidth  - halfPlayheadWidth - leftMargin - rightMargin)) + 'px';

            // move timelineVideoPreviewContainer to correct spot (constrained to -68px < left < (innerWidth - 588)
            let videoPreviewContainer = document.getElementById('timelineVideoPreviewContainer');
            if (videoPreviewContainer && videoPreviewContainer.getClientRects()[0]) {
                let previewWidth = videoPreviewContainer.getClientRects()[0].width;
                let previewRelativeX = parseInt(playheadElement.style.left) + halfPlayheadWidth - previewWidth / 2;
                videoPreviewContainer.style.left = Math.min((window.innerWidth - previewWidth) - 160, Math.max(-68, previewRelativeX)) + 'px';
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

                let selectedSegments = this.getSelectedSegments();
                selectedSegments.forEach(info => {
                    let segment = this.trackInfo.tracks[info.deviceId].segments[info.segmentId];
                    this.colorVideoPreview.playbackRate = this.playbackSpeed * segment.timeMultiplier;
                    this.depthVideoPreview.playbackRate = this.playbackSpeed * segment.timeMultiplier;
                });

                if (!this.isPlaying) { return; }

                this.pauseVideoPlayback();
                this.playVideoPlayback();
            });
        }
        createVideoElement(id) {
            let video = document.createElement('video');
            video.id = id;
            video.classList.add('videoPreview');
            video.setAttribute('width', '256');
            video.setAttribute('controls', 'controls'); // TODO: remove this after done debugging
            video.setAttribute('muted', 'muted');
            let source = document.createElement('source');
            video.appendChild(source);
            return video;
        }
        playLoop() {
            if (this.isPlaying) {
                let dt = Date.now() - this.lastTime;
                let newTime = this.playheadTimestamp + (dt * this.playbackSpeed);
                if (newTime > this.trackInfo.metadata.maxTime) {
                    this.pauseVideoPlayback();
                    newTime = this.trackInfo.metadata.maxTime;
                }
                this.movePlayheadToTime(newTime);
                this.setPlayheadTimestamp(newTime);
                this.timeScrolledTo(newTime, false);
            }
            this.lastTime = Date.now();
            requestAnimationFrame(() => {
                this.playLoop();
            });
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
                trackElement.id = this.getTrackElementId(thisTrackId);
                document.getElementById('timelineTrackBox').appendChild(trackElement);

                let trackInfo = this.trackInfo.tracks[thisTrackId];
                this.positionAndScaleTrack(trackElement, trackInfo, i, numTracks);

                let segments = trackInfo.segments;
                Object.keys(segments).forEach(segmentId => {
                    console.log('creating elements for segment ' + segmentId + ' in track ' + thisTrackId);
                    let segmentElement = document.createElement('div');
                    segmentElement.classList.add('timelineSegment');
                    segmentElement.id = this.getSegmentElementId(thisTrackId, segmentId);
                    trackElement.appendChild(segmentElement);
                    this.positionAndScaleSegment(segmentElement, thisTrackId, segmentId);

                    segmentElement.addEventListener('pointerdown', () => {
                        console.log('segment down');
                        this.selectSegment(thisTrackId, segmentId);

                        if (this.isPlaying) {
                            this.pauseVideoPlayback();
                        }
                    });
                });

                // clicking on the track (row background) toggles it as the selected track 
                trackElement.addEventListener('pointerdown', () => {
                    console.log('track down');
                    if (this.selectedTrack === thisTrackId) {
                        if (!this.interactingWithSegment) {
                            this.deselectTrack(thisTrackId);
                        }
                    } else {
                        this.selectTrack(thisTrackId);
                    }
                });
            }
        }
        getTrackElementId(trackId) {
            return 'timelineTrack_' + trackId;
        }
        getSegmentElementId(trackId, segmentId) {
            return 'timelineSegment_' + trackId + '_' + segmentId;
        }
        selectTrack(trackId) {
            this.deselectTrack(this.selectedTrack);
            this.selectedTrack = trackId;
            let element = document.getElementById(this.getTrackElementId(trackId));
            element.classList.add('selectedTrack');
        }
        deselectTrack(trackId) {
            if (!this.selectedTrack) { return; }
            let element = document.getElementById(this.getTrackElementId(trackId));
            element.classList.remove('selectedTrack');
            this.selectedTrack = null;
        }
        selectSegment(trackId, segmentId) {
            console.log('select segment', trackId, segmentId);
            if (this.interactingWithSegment) {
                this.deselectSegment(this.interactingWithSegment.trackId, this.interactingWithSegment.segmentId);
            }
            this.interactingWithSegment = {
                trackId: trackId,
                segmentId: segmentId
            };
            let element = document.getElementById(this.getSegmentElementId(trackId, segmentId));
            element.classList.add('selectedSegment');
            this.initialTimeOffset = this.timeOffsets[trackId][segmentId];
        }
        deselectSegment(trackId, segmentId) {
            if (!this.interactingWithSegment) { return; }
            let element = document.getElementById(this.getSegmentElementId(trackId, segmentId));
            element.classList.remove('selectedSegment');
            this.interactingWithSegment = null;
        }
        positionAndScaleTrack(trackElement, trackInfo, index, numTracks) {
            console.log('position and scale track:');
            // console.log(trackElement, trackInfo, index, numTracks);
            let heightPercent = (80.0 / numTracks);
            let marginPercent = (20.0 / (numTracks + 1));
            trackElement.style.top = ((marginPercent * (index + 1)) + (heightPercent * index)) + '%';
            trackElement.style.height = heightPercent + '%';
        }
        positionAndScaleSegment(segmentElement, trackId, segmentId) {
            console.log('position and scale segment:');
            let trackInfo = this.trackInfo.tracks[trackId];
            let segmentInfo = trackInfo.segments[segmentId];
            console.log(segmentElement, segmentInfo, trackInfo);
            let segmentDuration = segmentInfo.end - segmentInfo.start;

            let maxTime = this.trackInfo.metadata.maxTime; // Math.max(Date.now(), this.trackInfo.metadata.maxTime);
            let trackDuration = maxTime - this.trackInfo.metadata.minTime;
            let lengthPercent = segmentDuration / trackDuration * 100.0;
            let startPercent = ((segmentInfo.start + this.timeOffsets[trackId][segmentId]) - this.trackInfo.metadata.minTime) / trackDuration * 100.0;
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
