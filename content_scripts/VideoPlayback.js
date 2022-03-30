/*
* Copyright © 2022 PTC
*/

createNameSpace('realityEditor.device');

(function(exports) {
    class VideoPlayback {
        constructor(serverIp) {
            this.ip = serverIp;
            this.videoInfo = null;
            this.poseInfo = null;
            this.trackInfo = {};
            this.visible = true;
            this.selectedSegments = {};
            this.isPlaying = false;
            this.playbackSpeed = 1;
            this.displayPointClouds = true;
            this.playheadTimestamp = Date.now();
            this.loadAvailableVideos().then(info => {
                this.videoInfo = info;
                if (this.videoInfo && Object.keys(this.videoInfo).length > 0) {
                    this.createHTMLElements();
                }
            }).catch(error => {
                console.log(error);
            });
        }
        toggleVisibility(newValue) {
            if (typeof newValue !== 'undefined') {
                this.visible = newValue;
            } else {
                this.visible = !this.visible;
            }
            this.updateVisibility();
        }
        updateVisibility() {
            if (this.visible) {
                this.timelineContainer.classList.remove('hiddenTimeline');
            } else {
                this.timelineContainer.classList.add('hiddenTimeline');
            }
        }
        createHTMLElements() {
            // [x] create a timeline
            // [x] create a playhead on the timeline for scrolling
            // [x] create a play and pause button
            this.timelineContainer = this.createTimelineElement();
            document.body.appendChild(this.timelineContainer);

            // [x] create a track on the timeline for each pair of videos – vertically spaced per device – horizontally per timestamp
            this.createVideoTracks(this.videoInfo);

            this.playheadTimestamp = this.trackInfo.metadata.minTime;

            // [x] create two preview videos
            let firstColorSrc = ''; //'http://' + this.ip + ':8080/virtualizer_recording/' + info.color[0];
            let firstDepthSrc = ''; //'http://' + this.ip + ':8080/virtualizer_recording/' + info.depth[0];

            console.log('create video HTML elements');
            let colorVideoElement = this.createVideoElement('colorVideoPreview', firstColorSrc);
            let depthVideoElement = this.createVideoElement('depthVideoPreview', firstDepthSrc);
            this.colorVideoPreview = colorVideoElement;
            this.depthVideoPreview = depthVideoElement;

            // TODO: how to handle video preview of multiple parallel tracks?
            colorVideoElement.addEventListener('timeupdate', () => {
                let colorCtx = this.colorVideoCanvas.getContext('2d');
                let depthCtx = this.depthVideoCanvas.getContext('2d');
                colorCtx.drawImage(this.colorVideoPreview, 0, 0, 960, 540);
                depthCtx.drawImage(this.depthVideoPreview, 0, 0);

                let selectedSegments = this.getSelectedSegments();
                if (selectedSegments.length === 0) { return; } // TODO: make it work even if no selected segment

                // console.log('timeupdate: ', colorVideoElement.currentTime);
                let timeMs = colorVideoElement.currentTime * 1000;
                let segmentInfo = this.trackInfo.tracks[selectedSegments[0].deviceId].segments[selectedSegments[0].segmentId];
                let absoluteTime = segmentInfo.start + timeMs * segmentInfo.timeMultiplier;

                // TODO: getImageData and pass buffers to point cloud renderer
                // let colorPixels = colorCtx.getImageData(0, 0, 960, 540);
                // let depthPixels = depthCtx.getImageData(0, 0, 256, 144);
                let colorImageUrl = this.colorVideoCanvas.toDataURL('image/jpeg');
                let depthImageUrl = this.depthVideoCanvas.toDataURL('image/png');

                // let depthImageData = this.depthVideoCanvas.getContext('2d').getImageData(0, 0, 256, 144).data;

                // let poseMatrix = this.extractPoseFromDepthCanvas();
                let closestPose = this.getClosestPose(selectedSegments[0].deviceId, selectedSegments[0].segmentId, absoluteTime);
                if (closestPose) {
                    this.processPointCloud(selectedSegments[0].deviceId, colorImageUrl, depthImageUrl, closestPose);
                }
                // this.processPointCloud(selectedSegments[0].deviceId, colorImageUrl, depthImageUrl, [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);

                // this function triggers in two cases: scrolling and playing the video.
                // in the case of playing the video, we need to match the scroll playhead with video progress
                // if (this.isPlaying) {
                //     this.movePlayheadToTime(absoluteTime);
                //     this.setPlayheadTimestamp(absoluteTime);
                // }
            });

            let videoPreviewContainer = document.getElementById('timelineVideoPreviewContainer');
            videoPreviewContainer.appendChild(colorVideoElement);
            videoPreviewContainer.appendChild(depthVideoElement);
            depthVideoElement.style.left = 256 + 'px';

            // [x] create a canvas for the video to be written to so its pixel data can be extracted
            // TODO: move to OffscreenCanvas and worker thread (https://developers.google.com/web/updates/2018/08/offscreen-canvas)
            let colorVideoCanvas = document.createElement('canvas');
            colorVideoCanvas.id = 'colorVideoCanvas';
            colorVideoCanvas.setAttribute('crossOrigin', 'anonymous');
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

            this.playLoop(); // only after DOM is built can we start the loop
        }
        getClosestPose(deviceId, segmentId, absoluteTime) {
            let segmentPoses = this.trackInfo.tracks[deviceId].segments[segmentId].poses;
            // find the pose that minimizes dt
            // this array might contain ~400 values per minute of video. TODO: in future, make more sparse and estimate/interpolate
            let min_older_dt = Date.now();
            let min_newer_dt = Date.now();
            let closestPoseBase64_older = null; //[1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
            let closestPoseBase64_newer = null; //[1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
            segmentPoses.forEach(poseEntry => {
                let this_dt = absoluteTime - poseEntry.time;
                if (this_dt >= 0 && Math.abs(this_dt) < min_newer_dt) {
                    min_newer_dt = Math.abs(this_dt);
                    closestPoseBase64_newer = poseEntry.pose;
                } else if (this_dt <= 0 && Math.abs(this_dt) < min_older_dt) {
                    min_older_dt = Math.abs(this_dt);
                    closestPoseBase64_older = poseEntry.pose;
                }
            });
            // if (closestPoseBase64_older) {
            //     console.log('closest <pose to time ' + absoluteTime + ' is ' + closestPoseBase64_older.substr(0, 5) + ' (dt = ' + min_older_dt + ')');
            // }
            // if (closestPoseBase64_newer) {
            //     console.log('closest >pose to time ' + absoluteTime + ' is ' + closestPoseBase64_newer.substr(0, 5) + ' (dt = ' + min_newer_dt + ')');
            // }
            if (closestPoseBase64_newer || closestPoseBase64_older) {
                let closestPoseBase64 = closestPoseBase64_older || closestPoseBase64_newer;
                let byteCharacters = window.atob(closestPoseBase64);
                const byteNumbers = new Array(byteCharacters.length);
                for (let i = 0; i < byteCharacters.length; i++) {
                    byteNumbers[i] = byteCharacters.charCodeAt(i);
                }
                const byteArray = new Uint8Array(byteNumbers);
                // console.log(byteArray);
                // const blob = new Blob([byteArray]); //, {type: contentType})
                let matrix = new Float32Array(byteArray.buffer);
                // console.log(matrix);
                return matrix;
            }
            return null; //closestPoseBase64;
        }
        // async extractPoseFromDepthCanvas() {
        //     if (typeof this.poseCanvas === 'undefined') {
        //         this.poseCanvas = document.createElement('canvas');
        //         this.poseCanvas.id = 'poseCanvas';
        //         this.poseCanvas.width = 8;
        //         this.poseCanvas.height = 8;
        //         document.body.append(this.poseCanvas);
        //     }
        //     let poseCtx = this.poseCanvas.getContext('2d');
        //     let imageData = this.depthVideoCanvas.getContext('2d').getImageData(0, 0, 8, 8);
        //     poseCtx.putImageData(imageData, 0, 0);
        //     // poseCtx.scale(10, 10);
        //     console.log(imageData.data);
        //
        //     let buffer = new ArrayBuffer(256);
        //     let view = new DataView(buffer);
        //     imageData.data.forEach(function(b, i) {
        //         view.setUint8(i, b);
        //     });
        //     // read bits as floats
        //     let firstNum = view.getFloat32(0);
        //     console.log(firstNum);
        //
        //     let matrix = [];
        //     for (let i = 0; i < 16; i++) {
        //         matrix[i] = view.getFloat32(i * 16);
        //     }
        //
        //     console.log(matrix);
        //
        //     // let matrix = imageData.data; // new Float32Array(await imageData.arrayBuffer());
        //     // console.log(matrix);
        //
        //     return matrix;
        // }
        getSelectedSegments() {
            // key = deviceId, value = segmentId
            return Object.keys(this.selectedSegments).map(function(deviceId) {
                return {
                    deviceId: deviceId,
                    segmentId: this.selectedSegments[deviceId]
                };
            }.bind(this)).filter(info => !!info.segmentId);
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
            // timestampDisplay.classList.add('timelineBox');
            let defaultDate = new Date(0);
            // let dateString = defaultDate.toLocaleTimeString(undefined, {
            //     hour:   '2-digit',
            //     minute: '2-digit',
            //     second: '2-digit',
            // });
            let dateString = this.getFormattedTime(defaultDate);
            // let format1 = new SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS", Locale.ENGLISH).format(now);

            timestampDisplay.innerText = dateString;
            leftBox.appendChild(timestampDisplay);

            let playhead = document.createElement('img');
            playhead.id = 'timelinePlayhead';
            playhead.src = '/addons/vuforia-spatial-remote-operator-addon/timelinePlayhead.svg';
            centerBox.appendChild(playhead);
            this.setupPlayhead(playhead);

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
                if (selectedSegments.length > 0) {
                    let segment = this.selectedSegments[0];
                    this.colorVideoPreview.playbackRate = this.playbackSpeed * segment.timeMultiplier;
                    this.colorVideoPreview.playbackRate = this.playbackSpeed * segment.timeMultiplier;
                }
            });
        } // TODO: make use of requestVideoFrameCallback ? videoElement.duration, etc
        setupPlayhead(playheadElement) {
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
                    videoPreviewContainer.style.left = Math.min((window.innerWidth - previewWidth) - 160, Math.max(-68, previewRelativeX)) + 'px';
                }

                let playheadTimePercent = (parseInt(playheadElement.style.left) + halfPlayheadWidth - leftMargin) / (containerWidth - halfPlayheadWidth - leftMargin - rightMargin);
                // console.log(playheadTimePercent);

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
        getFormattedTime(relativeTimestamp) {
            let timeSeconds = relativeTimestamp / 1000;
            let hours = Math.floor(timeSeconds / (60 * 60));
            let minutes = Math.floor(timeSeconds / 60);
            let seconds = Math.floor(timeSeconds % 60);
            const zeroPad = (num, places) => String(num).padStart(places, '0');
            return zeroPad(hours, 2) + ':' + zeroPad(minutes, 2) + ':' + zeroPad(seconds, 2);
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
        setPlayheadTimestamp(timestamp) {
            this.playheadTimestamp = timestamp;
            // console.log(this.playheadTimestamp);

            // let time = new Date(timestamp);
            // let formatted = time.toISOString();

            let relativeTime = timestamp - this.trackInfo.metadata.minTime;
            let textfield = document.getElementById('timelineTimestampDisplay');
            textfield.innerText = this.getFormattedTime(relativeTime);
        }
        timeScrolledTo(timestamp, interaction) {
            // console.log('time scrolled to ' + timestamp);
            // let thisTime = ((timestamp - this.trackInfo.metadata.minTime) / 1000 / 60);
            // let maxTime = ((this.trackInfo.metadata.maxTime - this.trackInfo.metadata.minTime) / 1000 / 60);
            // console.log('time scrolled to: ' + thisTime + ' out of ' + maxTime);

            // check if timestamp is within [start,end] for any of the segments on all of the tracks
            let anySegmentSelected = false;
            Object.keys(this.trackInfo.tracks).forEach(deviceId => {
                let deviceHasSelectedSegment = false;
                Object.keys(this.trackInfo.tracks[deviceId].segments).forEach(segmentId => {
                    let segment = this.trackInfo.tracks[deviceId].segments[segmentId];
                    if (timestamp > segment.start && timestamp < segment.end) {
                        deviceHasSelectedSegment = true;

                        if (this.selectedSegments[deviceId] !== segmentId && !anySegmentSelected) {
                            // if it is, load that video into the video players,

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

                        this.selectedSegments[deviceId] = segmentId;
                        anySegmentSelected = true; // this makes sure we stick with first track's segment

                        //  and set the currentTime to the correct converted timestamp
                        if (interaction) {
                            let currentTime = (segment.timeMultiplier || 1) * (timestamp - segment.start) / 1000;
                            console.log(currentTime);
                            this.colorVideoPreview.currentTime = currentTime;
                            this.depthVideoPreview.currentTime = currentTime;
                        }
                    }
                });
                if (!deviceHasSelectedSegment) {
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
        createVideoTracks(videoInfo) {
            this.trackInfo = {
                tracks: {}, // each device gets its own track. more than one segment can be on that track
                metadata: {
                    minTime: 0,
                    maxTime: 1
                }
            };

            let earliestTime = Date.now();
            let latestTime = 0;

            Object.keys(videoInfo).forEach(deviceId => {
                console.log('loading track for device: ' + deviceId);
                Object.keys(videoInfo[deviceId]).forEach(sessionId => {
                    console.log('loading ' + deviceId + ' session ' + sessionId);
                    let sessionInfo = videoInfo[deviceId][sessionId];
                    if (typeof this.trackInfo.tracks[deviceId] === 'undefined') {
                        this.trackInfo.tracks[deviceId] = {
                            segments: {},
                            index: 0
                        };
                    }
                    this.trackInfo.tracks[deviceId].segments[sessionId] = {
                        colorVideo: sessionInfo.finalColorVideo.filePath,
                        depthVideo: sessionInfo.finalDepthVideo.filePath, // this.getMatchingDepthVideo(filePath),
                        start: sessionInfo.finalColorVideo.timeInfo.start,
                        end: sessionInfo.finalColorVideo.timeInfo.end,
                        visible: true,
                    };
                    earliestTime = Math.min(earliestTime, sessionInfo.finalColorVideo.timeInfo.start);
                    latestTime = Math.max(latestTime, sessionInfo.finalColorVideo.timeInfo.end);
                });
            });

            // only go back at most 1 hr from the most recent video
            const MAX_TIMELINE_LENGTH = 1000 * 60 * 60 * 1.1;
            let keysToRemove = [];
            let newEarliestTime = latestTime;
            Object.keys(this.trackInfo.tracks).forEach(deviceId => {
                Object.keys(this.trackInfo.tracks[deviceId].segments).forEach(segmentId => {
                    let segment = this.trackInfo.tracks[deviceId].segments[segmentId];
                    if (segment.start < latestTime - MAX_TIMELINE_LENGTH) {
                        keysToRemove.push({
                            deviceId: deviceId,
                            segmentId: segmentId
                        });
                    } else {
                        newEarliestTime = Math.min(newEarliestTime, segment.start);
                    }
                });
            });
            keysToRemove.forEach(keys => {
                console.log(keys.segmentId + ' is too old');
                delete this.trackInfo.tracks[keys.deviceId].segments[keys.segmentId];
                if (Object.keys(this.trackInfo.tracks[keys.deviceId].segments).length < 1) {
                    delete this.trackInfo.tracks[keys.deviceId];
                }
                earliestTime = newEarliestTime; // only apply this effect if we delete at least one segment
            });

            this.trackInfo.metadata.minTime = earliestTime;
            this.trackInfo.metadata.maxTime = latestTime > 0 ? latestTime : Date.now();
            console.log('trackInfo', this.trackInfo);

            this.addPoseInfoToTracks().then(response => {
                console.log('addPoseInfoToTracks', response);
                console.log('tInfo2', this.trackInfo);
            }).catch(error => {
                console.warn('error in addPoseInfoToTracks', error);
            });

            console.log('tInfo1', this.trackInfo);

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
        async addPoseInfoToTracks() {
            return new Promise((resolve, reject) => {
                // add pose info to tracks
                // http://localhost:8081/virtualizer_recording/device_21/pose/device_device_21_session_wE1fcfcd.json
                let promises = [];
                Object.keys(this.trackInfo.tracks).forEach(deviceId => {
                    Object.keys(this.trackInfo.tracks[deviceId].segments).forEach(segmentId => {
                        promises.push(this.loadPoseInfo(deviceId, segmentId));
                    });
                });
                if (promises.length === 0) {
                    resolve();
                    return;
                }
                Promise.all(promises).then((poses) => {
                    poses.forEach(response => {
                        let segment = this.trackInfo.tracks[response.deviceId].segments[response.segmentId];
                        segment.poses = response.poseInfo;
                    });
                    resolve();
                }).catch(error => {
                    console.warn(error);
                    reject();
                });
            });
        }
        loadPoseInfo(deviceId, segmentId) {
            return new Promise((resolve, reject) => {
                // http://localhost:8081/virtualizer_recording/device_21/pose/device_device_21_session_wE1fcfcd.json
                httpGet('/virtualizer_recording/' + deviceId + '/pose/device_' + deviceId + '_session_' + segmentId + '.json').then(poseInfo => {
                    resolve({
                        deviceId: deviceId,
                        segmentId: segmentId,
                        poseInfo: poseInfo
                    });
                }).catch(reason => {
                    console.warn(reason);
                    reject(reason);
                });
            });
        }
        // TODO: update this if the file naming changes to not include the timestamp or if depth+color aren't guaranteed to have identical timestamps
        getMatchingDepthVideo(colorFilePath) {
            // find the depth video by searching filenames for one with the same timestamp
            // "/Users/Ben/Documents/spatialToolbox/.identity/virtualizer_recordings/color_merged_1643228509255.mp4"
            let videoTimestamp = colorFilePath.match(/[0-9]{13,}/); // extract timestamp
            let depthVideoPaths = Object.keys(this.videoInfo.mergedFiles.depth);
            let matchingPathArray = depthVideoPaths.filter(path => path.includes(videoTimestamp));
            if (matchingPathArray.length > 0) {
                return matchingPathArray[0];
            }
            return '';
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
            // console.log('position and scale segment:');
            console.log(segmentElement, segmentInfo, trackInfo);
            let segmentDuration = segmentInfo.end - segmentInfo.start;

            let maxTime = this.trackInfo.metadata.maxTime; // Math.max(Date.now(), this.trackInfo.metadata.maxTime);
            let trackDuration = maxTime - this.trackInfo.metadata.minTime;
            let lengthPercent = segmentDuration / trackDuration * 100.0;
            let startPercent = (segmentInfo.start - this.trackInfo.metadata.minTime) / trackDuration * 100.0;
            segmentElement.style.width = lengthPercent + '%';
            segmentElement.style.left = startPercent + '%';
        }
        createVideoElement(id, src) {
            let video = document.createElement('video');
            video.id = id;
            video.classList.add('videoPreview');
            video.setAttribute('width', '256');
            video.setAttribute('controls', 'controls'); // TODO: remove this after done debugging
            video.setAttribute('muted', 'muted');
            let source = document.createElement('source');
            // source.setAttribute('type', 'video/mp4; codecs=hevc');
            source.src = src;
            video.appendChild(source);
            return video;
        }
        loadAvailableVideos() {
            return new Promise((resolve, reject) => {
                // this.downloadVideoInfo().then(info => console.log(info));
                // httpGet('http://' + this.ip + ':31337/videoInfo').then(info => {
                httpGet('/virtualizer_recordings').then(info => {
                    console.log(info);
                    resolve(info);
                }).catch(reason => {
                    console.warn(reason);
                    reject(reason);
                });
            });
        }
        processPointCloud(deviceId, colorPixels, depthPixels, poseMatrix) {
            if (!this.displayPointClouds) {
                return;
            }
            if (typeof this.loadPointCloud !== 'undefined') {
                let cameraId = parseInt(deviceId.replace('device_', ''));
                // let poseMatrix = [0.14402000606060028,0.9848149418830872,-0.09694764018058777,0,-0.07154643535614014,0.10807616263628006,0.9915645122528076,0,0.9869853258132935,-0.13586850464344025,0.0860244631767273,0,81.54875183105469,685.0294189453125,54.82767105102539,1];

                // let colorBlobUrl = decodeBase64JpgToBlobUrl(colorPixels);
                // let depthBlobUrl = decodeBase64JpgToBlobUrl(depthPixels);
                // console.log(colorBlobUrl, depthBlobUrl);

                this.loadPointCloud(cameraId, colorPixels, depthPixels, poseMatrix);
            }
        }
        setPointCloudCallback(callback) {
            this.loadPointCloud = callback;
        }
        togglePointClouds() {
            this.displayPointClouds = !this.displayPointClouds;
            console.log('displayPointClouds = ' + this.displayPointClouds);
        }
    }

    /*
    function b64toBlob(b64Data, contentType, sliceSize) {
        contentType = contentType || '';
        sliceSize = sliceSize || 512;
        var byteCharacters = atob(b64Data);
        var byteArrays = [];
        for (var offset = 0; offset < byteCharacters.length; offset += sliceSize) {
            var slice = byteCharacters.slice(offset, offset + sliceSize);
            var byteNumbers = new Array(slice.length);
            for (var i = 0; i < slice.length; i++) {
                byteNumbers[i] = slice.charCodeAt(i);
            }
            var byteArray = new Uint8Array(byteNumbers);
            byteArrays.push(byteArray);
        }
        return new Blob(byteArrays, {type: contentType});
    }

    function decodeBase64JpgToBlobUrl(base64String) {
        var blob = b64toBlob(base64String, 'image/jpeg');
        var blobUrl = URL.createObjectURL(blob);
        return blobUrl;

    }
    */

    function httpGet (url) {
        return new Promise((resolve, reject) => {
            let req = new XMLHttpRequest();
            req.open('GET', url, true);
            // req.setRequestHeader('Access-Control-Allow-Headers', '*');
            req.onreadystatechange = function () {
                if (req.readyState === 4) {
                    console.log(req.status);
                    if (req.status === 0) {
                        console.log('status 0');
                        return;
                    }
                    if (req.status !== 200) {
                        reject('Invalid status code <' + req.status + '>');
                    }
                    resolve(JSON.parse(req.responseText));
                }
            };
            req.send();
        });
    }

    exports.VideoPlayback = VideoPlayback;
})(realityEditor.device);
