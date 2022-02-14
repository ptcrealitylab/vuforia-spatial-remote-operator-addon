createNameSpace('realityEditor.videoPlayback');

(function (exports) {
    /**
     * The Timeline is a fairly complex class that creates and renders the UI for a timeline with playback controls.
     * It is designed to handle a source that provides both color and depth information as separate videos.
     * If provided trackInfo from a VideoSource, calling timeline.load(trackInfo) will populate the timeline with a number
     * of "tracks" and "segments". Each track represents a different device, and each segment is a single video from that device.
     * When scrolling or playing, the timeline will play all videos invisibly, and trigger the onVideoFrame callback for each
     * so that an external module can do something with the color and depth videos.
     */
    class Timeline {
        constructor() {
            this.playheadTimestamp = Date.now();
            this.MAX_SPEED = 256;
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
            this.videoElements = {};

            this.buildHTMLElements();

            window.addEventListener('resize', () => {
                this.onWindowResized();
            });
            this.onWindowResized();
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

            // this.addPlaybackListeners();

            this.playLoop(); // only after DOM is built can we start the loop
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

            // create containers for two preview videos
            let videoPreviewContainer = document.getElementById('timelineVideoPreviewContainer');

            let colorPreviewContainer = document.createElement('div');
            colorPreviewContainer.classList.add('videoPreviewContainer');
            colorPreviewContainer.id = 'timelineColorPreviewContainer';

            let depthPreviewContainer = document.createElement('div');
            depthPreviewContainer.classList.add('videoPreviewContainer');
            depthPreviewContainer.id = 'timelineDepthPreviewContainer';
            depthPreviewContainer.style.left = 256 + 'px';

            videoPreviewContainer.appendChild(colorPreviewContainer);
            // videoPreviewContainer.appendChild(depthPreviewContainer);
        }
        onWindowResized() {
            let timelineContainer = document.getElementById('timelineContainer');

            let maxWidth = window.innerWidth - 40;
            let minWidth = (window.innerWidth * 0.7) - 40;
            let maxHeight = 180;
            let minHeight = 115; //derived from control button heights: 3 * 5 + 2 * (60 - 2 * 5);

            // as window aspect ratio changes, scale timeline (centered horizontally on bottom of screen)
            let windowAspect = window.innerWidth / window.innerHeight;
            let excessRatio = Math.min(1, Math.max(0, windowAspect - 1.5));

            // if excess is 0, maxWidth. if excess is 1, minWidth.
            let newWidth = maxWidth - excessRatio * (maxWidth - minWidth);
            let newHeight = maxHeight - excessRatio * (maxHeight - minHeight);

            timelineContainer.style.width = newWidth + 'px';
            timelineContainer.style.left = 0.5 * (window.innerWidth - newWidth) + 'px';
            timelineContainer.style.height = newHeight + 'px';
            timelineContainer.style.top = window.innerHeight - newHeight - 20 + 'px';
        }
        getVideoElement(trackId, colorOrDepth) {
            if (colorOrDepth !== 'color' && colorOrDepth !== 'depth') { console.warn('passing invalid colorOrDepth to getVideoElement', colorOrDepth); }

            if (typeof this.videoElements[trackId] === 'undefined') {
                this.videoElements[trackId] = {};
            }
            if (typeof this.videoElements[trackId].depth === 'undefined') {
                this.videoElements[trackId].depth = this.createVideoElement('depth_video_' + trackId);
            }
            if (typeof this.videoElements[trackId].color === 'undefined') {
                this.videoElements[trackId].color = this.createVideoElement('color_video_' + trackId);

                this.videoElements[trackId].color.addEventListener('timeupdate', () => {
                    let selectedSegments = this.getSelectedSegments();
                    selectedSegments.filter((info) => {
                        return info.deviceId === trackId;
                    }).forEach(selected => { // there should only be one, assuming segments on the same track can't overlap
                        // trigger the external callbacks for each video
                        this.callbacks.onVideoFrame.forEach(callback => {
                            callback(this.videoElements[trackId].color, this.videoElements[trackId].depth, selected.deviceId, selected.segmentId);
                        });
                    });
                });
            }

            return this.videoElements[trackId][colorOrDepth];
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
            videoPreviewContainer.classList.add('timelineVideoPreviewNoTrack'); // need to click on timeline to select
            centerBox.appendChild(videoPreviewContainer);
            // left = -68px is most left as possible
            // width = 480px for now, to show both, but should change to 240px eventually

            let playButton = document.createElement('img');
            playButton.id = 'timelinePlayButton';
            playButton.src = '/addons/vuforia-spatial-remote-operator-addon/playButton.svg';

            // let seekButton = document.createElement('img');
            // seekButton.id = 'timelineSeekButton';
            // seekButton.src = '/addons/vuforia-spatial-remote-operator-addon/seekButton.svg';

            let speedButton = document.createElement('img');
            speedButton.id = 'timelineSpeedButton';
            speedButton.src = '/addons/vuforia-spatial-remote-operator-addon/speedButton_1x.svg';

            [playButton, /*seekButton,*/ speedButton].forEach(elt => {
                elt.classList.add('timelineControlButton');
                rightBox.appendChild(elt);
            });
            this.setupControlButtons(playButton, /*seekButton,*/ speedButton);

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
            // TODO: if we drop this segment on top of another segment on this track, reset this segment position to previous
            // TODO: also save timeOffsets into window.localStorage so we can persist them on this client? if so, have a reset button too
            // TODO: also have a lock/unlock button that allows editing the timeline, so we can't do it by default
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

            let trackInfo = this.trackInfo.tracks[this.interactingWithSegment.trackId];
            let segmentInfo = trackInfo.segments[this.interactingWithSegment.segmentId];
            if (segmentInfo.start + this.initialTimeOffset + dTime < this.trackInfo.metadata.minTime) {
                dTime = this.trackInfo.metadata.minTime - segmentInfo.start - this.initialTimeOffset;
            } else if (segmentInfo.end + this.initialTimeOffset + dTime > this.trackInfo.metadata.maxTime) {
                dTime = this.trackInfo.metadata.maxTime - segmentInfo.end - this.initialTimeOffset;
            }

            console.log('dTime = ' + dTime + ', initial = ' + this.initialTimeOffset + ', result = ' + (dTime + this.initialTimeOffset));
            this.timeOffsets[this.interactingWithSegment.trackId][this.interactingWithSegment.segmentId] = (dTime + this.initialTimeOffset);

            this.positionAndScaleSegment(segmentElement, this.interactingWithSegment.trackId, this.interactingWithSegment.segmentId);
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
                callback(deviceId, segmentId); // TODO: do we need this? if so, pass in deviceId and segmentId too
            });

            ['color', 'depth'].forEach(colorOrDepth => {
                let videoElement = this.getVideoElement(deviceId, colorOrDepth);
                // load that video into the video players
                let videoSourceElement = videoElement.querySelector('source');
                let filename = segment.colorVideo.replace(/^.*[\\\/]/, '');
                videoSourceElement.src = '/virtualizer_recording/' + deviceId + '/' + colorOrDepth + '/' + filename;
                videoElement.addEventListener('loadedmetadata', (_e) => {
                    if (typeof segment.timeMultiplier === 'undefined') {
                        let videoDuration = videoElement.duration;
                        let intendedDuration = (segment.end - segment.start) / 1000;
                        segment.timeMultiplier = videoDuration / intendedDuration;
                        console.log('timeMultiplier for ' + filename + ' set to ' + segment.timeMultiplier);
                    }
                    videoElement.playbackRate = this.playbackSpeed * segment.timeMultiplier;
                });
                videoElement.load();
                console.log('src = ' + videoSourceElement.src);
            });

            // visually highlight the segments that are currently playing
            let segmentElement = document.getElementById(this.getSegmentElementId(deviceId, segmentId));
            segmentElement.classList.add('timelineSegmentPlaying');

            if (this.isPlaying) {
                this.playVideoPlayback(); // actually play the videos
            }
        }
        segmentDeselected(deviceId, segmentId) {
            console.log('deselected segment ' + segmentId + ' on track ' + deviceId);

            let segmentElement = document.getElementById(this.getSegmentElementId(deviceId, segmentId));
            segmentElement.classList.remove('timelineSegmentPlaying');

            this.callbacks.onSegmentDeselected.forEach(callback => {
                callback(deviceId, segmentId);
            });
        }
        onTimeUpdated(deviceId, segmentId, timestamp) {
            let timeOffset = this.timeOffsets[deviceId][segmentId];
            let segment = this.trackInfo.tracks[deviceId].segments[segmentId];
            let currentTime = (segment.timeMultiplier || 1) * (timestamp - (segment.start + timeOffset)) / 1000;
            // console.log(currentTime);
            this.getVideoElement(deviceId, 'color').currentTime = currentTime;
            this.getVideoElement(deviceId, 'depth').currentTime = currentTime;
        }
        timeScrolledTo(timestamp, interaction) {
            // check if timestamp is within [start,end] for any of the segments on all of the tracks

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

                        //  and set the currentTime to the correct converted timestamp
                        if (interaction) {
                            this.onTimeUpdated(deviceId, segmentId, timestamp);
                        }
                    }
                });
                // TODO: fix this so segmentDeselected gets called even if two segments on same track are right next to eachother
                if (!deviceHasSelectedSegment) {
                    if (this.selectedSegments[deviceId]) {
                        this.segmentDeselected(deviceId, this.selectedSegments[deviceId]);
                    }
                    this.selectedSegments[deviceId] = null;
                }

                let videoPreviewContainer = document.getElementById('timelineVideoPreviewContainer');
                if (deviceHasSelectedSegment) {
                    this.getVideoElement(deviceId, 'color').classList.remove('timelineInnerVideoNoSource');
                    this.getVideoElement(deviceId, 'depth').classList.remove('timelineInnerVideoNoSource');
                    if (this.selectedTrack === deviceId) {
                        videoPreviewContainer.classList.remove('timelineVideoPreviewNoSource');
                    }
                } else {
                    this.getVideoElement(deviceId, 'color').classList.add('timelineInnerVideoNoSource');
                    this.getVideoElement(deviceId, 'depth').classList.add('timelineInnerVideoNoSource');
                    if (this.selectedTrack === deviceId) {
                        videoPreviewContainer.classList.add('timelineVideoPreviewNoSource');
                    }
                }
            });
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
        setupControlButtons(playButton, /*seekButton,*/ speedButton) {
            playButton.addEventListener('pointerup', _e => {
                this.togglePlayback();
            });
            // TODO: what does seek button do?
            speedButton.addEventListener('pointerup', _e => {
                this.multiplySpeed(2.0, true);
            });
        }
        createVideoElement(id) {
            let video = document.createElement('video');
            video.id = id;
            video.classList.add('videoPreview');
            video.setAttribute('width', '256');
            // video.setAttribute('controls', 'controls');
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
            this.forEachTrack((deviceId, _trackInfo) => {
                this.getVideoElement(deviceId, 'color').play();
                this.getVideoElement(deviceId, 'depth').play();
            });
            this.isPlaying = true;

            let playheadElement = document.getElementById('timelinePlayhead');
            playheadElement.classList.add('timelinePlayheadPlaying');

            let videoPreview = document.getElementById('timelineVideoPreviewContainer');
            videoPreview.classList.add('timelineVideoPreviewPlaying');

            let playButton = document.getElementById('timelinePlayButton');
            playButton.src = '/addons/vuforia-spatial-remote-operator-addon/pauseButton.svg';
        }
        pauseVideoPlayback() {
            this.forEachTrack((deviceId, _trackInfo) => {
                this.getVideoElement(deviceId, 'color').pause();
                this.getVideoElement(deviceId, 'depth').pause();
            });
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

            let colorContainer = document.getElementById('timelineColorPreviewContainer');
            while (colorContainer.firstChild) {
                colorContainer.removeChild(colorContainer.firstChild);
            }
            colorContainer.appendChild(this.getVideoElement(trackId, 'color'));

            // let depthContainer = document.getElementById('timelineDepthPreviewContainer');
            // while (depthContainer.firstChild) {
            //     depthContainer.removeChild(depthContainer.firstChild);
            // }
            // depthContainer.appendChild(this.getVideoElement(trackId, 'depth'));

            let videoPreviewContainer = document.getElementById('timelineVideoPreviewContainer');
            videoPreviewContainer.classList.remove('timelineVideoPreviewNoTrack');

            if (this.isPlaying) {
                this.pauseVideoPlayback();
                setTimeout(() => {
                    this.playVideoPlayback();
                }, 100);
            }
        }
        deselectTrack(trackId) {
            if (!this.selectedTrack) { return; }
            let element = document.getElementById(this.getTrackElementId(trackId));
            element.classList.remove('selectedTrack');
            this.selectedTrack = null;

            let videoPreviewContainer = document.getElementById('timelineVideoPreviewContainer');
            videoPreviewContainer.classList.add('timelineVideoPreviewNoTrack');
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
        togglePlayback() {
            if (this.isPlaying) {
                this.pauseVideoPlayback();
            } else {
                if (this.playheadTimestamp === this.trackInfo.metadata.maxTime) {
                    this.playheadTimestamp = this.trackInfo.metadata.minTime;
                }
                this.playVideoPlayback();
            }
        }
        toggleVisibility(isNowVisible) {
            if (typeof isNowVisible === 'undefined') { // toggle if no value provided
                if (this.timelineContainer.classList.contains('hiddenTimeline')) {
                    this.timelineContainer.classList.remove('hiddenTimeline');
                } else {
                    this.timelineContainer.classList.add('hiddenTimeline');
                }
                return;
            }

            if (isNowVisible) {
                this.timelineContainer.classList.remove('hiddenTimeline');
            } else {
                this.timelineContainer.classList.add('hiddenTimeline');
            }
        }
        multiplySpeed(factor = 2, allowLoop = true) {
            this.playbackSpeed *= factor;
            if (this.playbackSpeed > this.MAX_SPEED) {
                this.playbackSpeed = allowLoop ? 1 : this.MAX_SPEED;
            } else if (this.playbackSpeed < 1) {
                this.playbackSpeed = allowLoop ? this.MAX_SPEED : 1;
            }

            let speedButton = document.getElementById('timelineSpeedButton');
            speedButton.src = '/addons/vuforia-spatial-remote-operator-addon/speedButton_' + this.playbackSpeed + 'x.svg';

            let selectedSegments = this.getSelectedSegments();
            selectedSegments.forEach(info => {
                let segment = this.trackInfo.tracks[info.deviceId].segments[info.segmentId];
                this.getVideoElement(info.deviceId, 'color').playbackRate = this.playbackSpeed * segment.timeMultiplier;
                this.getVideoElement(info.deviceId, 'depth').playbackRate = this.playbackSpeed * segment.timeMultiplier;
            });

            if (!this.isPlaying) { return; }

            this.pauseVideoPlayback();
            this.playVideoPlayback();
        }
    }

    exports.Timeline = Timeline;
})(realityEditor.videoPlayback);
