/*
* Copyright © 2022 PTC
*/

createNameSpace('realityEditor.device');

(function(exports) {
    class VideoPlayback {
        constructor(serverIp) {
            this.ip = serverIp;
            this.videoInfo = null;
            this.trackInfo = {};
            this.visible = true;
            this.selectedSegmentId = null;
            this.selectedSegments = {};
            this.isPlaying = false;
            this.playbackSpeed = 1;
            this.loadAvailableVideos().then(info => {
                console.log(this.videoInfo);
                if (Object.keys(this.videoInfo).length > 0) {
                    this.createHTMLElements();
                }
                // if (info.color && info.color.length > 0 && info.depth && info.depth.length > 0) {
                //     this.createHTMLElements(info);
                // }
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
            let info = this.videoInfo;

            // [x] create a timeline
            // [x] create a playhead on the timeline for scrolling
            // [x] create a play and pause button
            this.timelineContainer = this.createTimelineElement();
            document.body.appendChild(this.timelineContainer);

            // [x] create a track on the timeline for each pair of videos – vertically spaced per device – horizontally per timestamp
            this.createVideoTracks(this.videoInfo);

            // [x] create two preview videos

            // TODO: BEN LOOK AT THIS!!
            // TODO: MONDAY MORNING – I just updated the server.js to have a new endpoint for the APIs: /virtualizer_recording/:deviceId/:colorOrDepth/:filename
            // TODO: update these videos to load from the correct new endpoints
            // TODO: next, the this.videoInfo has a new structure: { deviceId: { sessionId: { finalColorVideo: {}, finalDepthVideo: {} } }
            // TODO: load and populate the tracks and segments using this data structure instead of parsing that info from the color and depth filenames in old structure

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
                depthCtx.drawImage(this.depthVideoPreview, 0, 0, 256, 144);
                // TODO: getImageData and pass buffers to point cloud renderer

                if (!this.isPlaying) { return; } // ignore timeupdates due to user scrolling interactions
                let selectedSegments = this.getSelectedSegments();
                if (selectedSegments.length === 0) { return; } // TODO: make it work even if no selected segment
                // console.log('timeupdate: ', colorVideoElement.currentTime);
                let timeMs = colorVideoElement.currentTime * 1000;
                let segmentInfo = this.trackInfo.tracks[selectedSegments[0].deviceId].segments[selectedSegments[0].segmentId];
                let absoluteTime = segmentInfo.start + timeMs;
                this.movePlayheadToTime(absoluteTime);
            });

            let videoPreviewContainer = document.getElementById('timelineVideoPreviewContainer');
            videoPreviewContainer.appendChild(colorVideoElement);
            videoPreviewContainer.appendChild(depthVideoElement);
            depthVideoElement.style.left = 240 + 'px';

            // [x] create a canvas for the video to be written to so its pixel data can be extracted
            // TODO: move to OffscreenCanvas and worker thread (https://developers.google.com/web/updates/2018/08/offscreen-canvas)
            let colorVideoCanvas = document.createElement('canvas');
            colorVideoCanvas.id = 'colorVideoCanvas';
            colorVideoCanvas.width = 960;
            colorVideoCanvas.height = 540;
            document.body.appendChild(colorVideoCanvas);
            this.colorVideoCanvas = colorVideoCanvas;

            let depthVideoCanvas = document.createElement('canvas');
            depthVideoCanvas.id = 'depthVideoCanvas';
            depthVideoCanvas.width = 256;
            depthVideoCanvas.height = 144;
            document.body.appendChild(depthVideoCanvas);
            this.depthVideoCanvas = depthVideoCanvas;
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
            playButton.addEventListener('pointerup', e => {
                if (this.isPlaying) {
                    this.pauseVideoPlayback();
                } else {
                    this.playVideoPlayback();
                }
            });
            // TODO: what does seek button do?
            speedButton.addEventListener('pointerup', e => {
                this.playbackSpeed *= 2;
                if (this.playbackSpeed > 8) {
                    this.playbackSpeed = 1;
                }
                speedButton.src = '/addons/vuforia-spatial-remote-operator-addon/speedButton_' + this.playbackSpeed + 'x.svg';
            });
        }
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
                let previewWidth = videoPreviewContainer.getClientRects()[0].width;
                let previewRelativeX = parseInt(playheadElement.style.left) + halfPlayheadWidth - previewWidth / 2;
                videoPreviewContainer.style.left = Math.min(window.innerWidth - 588, Math.max(-68, previewRelativeX)) + 'px';

                let playheadTimePercent = (parseInt(playheadElement.style.left) + halfPlayheadWidth) / (containerWidth - leftMargin - rightMargin);

                let duration = this.trackInfo.metadata.maxTime - this.trackInfo.metadata.minTime;
                this.timeScrolledTo(this.trackInfo.metadata.minTime + playheadTimePercent * duration);
            });
            playheadElement.addEventListener('pointerdown', e => {
                this.playheadClickedDown = true;
                playheadElement.classList.add('timelinePlayheadSelected');

                let videoPreview = document.getElementById('timelineVideoPreviewContainer');
                videoPreview.classList.add('timelineVideoPreviewSelected');

                if (this.isPlaying) {
                    this.pauseVideoPlayback();
                }
            });
            document.addEventListener('pointerup', e => {
                this.playheadClickedDown = false;
                playheadElement.classList.remove('timelinePlayheadSelected');

                let videoPreview = document.getElementById('timelineVideoPreviewContainer');
                videoPreview.classList.remove('timelineVideoPreviewSelected');
            });
            document.addEventListener('pointercancel', e => {
                this.playheadClickedDown = false;
                playheadElement.classList.remove('timelinePlayheadSelected');

                let videoPreview = document.getElementById('timelineVideoPreviewContainer');
                videoPreview.classList.remove('timelineVideoPreviewSelected');
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
        timeScrolledTo(timestamp) {
            // console.log('time scrolled to ' + timestamp);

            // check if timestamp is within [start,end] for any of the segments on all of the tracks
            Object.keys(this.trackInfo.tracks).forEach(deviceId => {
                Object.keys(this.trackInfo.tracks[deviceId].segments).forEach(segmentId => {
                    let segment = this.trackInfo.tracks[deviceId].segments[segmentId];
                    if (timestamp > segment.start && timestamp < segment.end) {
                        // console.log('Scrolling on top of ' + segmentId);
                        if (this.selectedSegments[deviceId] !== segmentId) {
                            this.selectedSegments[deviceId] = segmentId;

                            let colorVideoSourceElement = this.colorVideoPreview.querySelector('source');
                            let filename = segment.colorVideo.replace(/^.*[\\\/]/, '');
                            colorVideoSourceElement.src = 'http://' + this.ip + ':8080/virtualizer_recording/' + deviceId + '/color/' + filename;
                            this.colorVideoPreview.load();
                            console.log('src = ' + colorVideoSourceElement.src);

                            let depthVideoSourceElement = this.depthVideoPreview.querySelector('source');
                            filename = segment.depthVideo.replace(/^.*[\\\/]/, '');
                            depthVideoSourceElement.src = 'http://' + this.ip + ':8080/virtualizer_recording/' + deviceId + '/depth/' + filename;
                            this.depthVideoPreview.load();
                            console.log('src = ' + depthVideoSourceElement.src);
                        }
                        // calculate currentTime
                        // console.log((timestamp - segment.start) / 1000);
                        this.colorVideoPreview.currentTime = (timestamp - segment.start) / 1000;
                        this.depthVideoPreview.currentTime = (timestamp - segment.start) / 1000;
                    }
                });
            });

            // if it is, load that video into the video players, and set the currentTime to the correct converted timestamp
        }
        movePlayheadToTime(timestamp) {
            // calculate new X position of playhead based on timestamp relative to full time range
            let trackBox = document.getElementById('timelineTrackBox');
            let containerWidth = trackBox.getClientRects()[0].width;
            let leftMargin = 20;
            let halfPlayheadWidth = 10;

            // calculate normalized time based on absolute timestamp
            let duration = this.trackInfo.metadata.maxTime - this.trackInfo.metadata.minTime;
            let timePercent = Math.max(0, Math.min(1, (timestamp - this.trackInfo.metadata.minTime) / duration));

            let playheadElement = document.getElementById('timelinePlayhead');
            playheadElement.style.left = (timePercent * containerWidth) + leftMargin + halfPlayheadWidth + 'px';

            // move timelineVideoPreviewContainer to correct spot (constrained to -68px < left < (innerWidth - 588)
            let videoPreviewContainer = document.getElementById('timelineVideoPreviewContainer');
            let previewWidth = videoPreviewContainer.getClientRects()[0].width;
            let previewRelativeX = parseInt(playheadElement.style.left) + halfPlayheadWidth - previewWidth / 2;
            videoPreviewContainer.style.left = Math.min(window.innerWidth - 588, Math.max(-68, previewRelativeX)) + 'px';

        }
        createVideoTracks(videoInfo) {
            console.log('create track elements for', videoInfo);

            this.trackInfo = {
                tracks: {
                    // defaultDevice: { // TODO: give each video the uuid of its author device
                    //     segments: {},
                    //     index: 0
                    // }
                }, // each device gets its own track. more than one segment can be on that track
                metadata: {
                    minTime: 0,
                    maxTime: 1
                }
            };

            let earliestTime = Date.now();
            let latestTime = 0;

            Object.keys(videoInfo).forEach(deviceId => {
                Object.keys(videoInfo[deviceId]).forEach(sessionId => {
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

            // Object.keys(videoInfo.mergedFiles.color).forEach(filePath => {
            //     let info = videoInfo.mergedFiles.color[filePath];
            //     this.trackInfo.tracks.defaultDevice.segments[filePath] = {
            //         colorVideo: filePath,
            //         depthVideo: this.getMatchingDepthVideo(filePath),
            //         start: info.startTime,
            //         end: info.endTime,
            //         visible: true,
            //     };
            //     earliestTime = Math.min(earliestTime, info.startTime);
            //     latestTime = Math.max(latestTime, info.endTime);
            // });

            // only go back at most 30 mins from the most recent video
            const MAX_TIMELINE_LENGTH = 1000 * 60 * 30;
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
        createVideoElement(id, src) {
            let video = document.createElement('video');
            video.id = id;
            video.classList.add('videoPreview');
            video.setAttribute('width', '240');
            // video.setAttribute('controls', 'controls');
            video.setAttribute('muted', 'muted');
            // video.setAttribute('autoplay', 'autoplay');

            let source = document.createElement('source');
            source.src = src;
            video.appendChild(source);

            /*
                <video id="videoPlayer" width="650" controls muted="muted" autoplay>
                    <source src="/video/depth_stream_1643050443659.mp4" type="video/mp4" />
                </video>
             */

            return video;
        }
        loadAvailableVideos() {
            return new Promise((resolve, reject) => {
                // this.downloadVideoInfo().then(info => console.log(info));
                // httpGet('http://' + this.ip + ':31337/videoInfo').then(info => {
                httpGet('http://' + this.ip + ':8080/virtualizer_recordings').then(info => {
                    console.log(info);
                    this.videoInfo = info;
                    resolve();

                    // let rgbVideos = Object.keys(info.mergedFiles.color).map(absolutePath => absolutePath.replace(/^.*[\\\/]/, ''));
                    // let depthVideos = Object.keys(info.mergedFiles.depth).map(absolutePath => absolutePath.replace(/^.*[\\\/]/, ''));

                    // console.log(rgbVideos);
                    // console.log(depthVideos);

                    // resolve({
                    //     color: rgbVideos,
                    //     depth: depthVideos
                    // });
                }).catch(reason => {
                    console.warn(reason);
                    reject(reason);
                });
            });
        }
    }

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
