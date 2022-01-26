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
            this.isPlaying = false;
            this.playbackSpeed = 1;
            this.loadAvailableVideos().then(info => {
                console.log(info);
                if (info.color && info.color.length > 0 && info.depth && info.depth.length > 0) {
                    this.createHTMLElements(info);
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
        createHTMLElements(info) {
            // [x] create a timeline
            // [x] create a playhead on the timeline for scrolling
            // [x] create a play and pause button
            this.timelineContainer = this.createTimelineElement();
            document.body.appendChild(this.timelineContainer);

            // [x] create a track on the timeline for each pair of videos – vertically spaced per device – horizontally per timestamp
            this.createVideoTracks(this.videoInfo);

            // [x] create two preview videos

            let firstColorSrc = 'http://' + this.ip + ':8080/virtualizer_recording/' + info.color[0];
            let firstDepthSrc = 'http://' + this.ip + ':8080/virtualizer_recording/' + info.depth[0];

            console.log('create video HTML elements');
            let colorVideoElement = this.createVideoElement('colorVideoPreview', firstColorSrc);
            let depthVideoElement = this.createVideoElement('depthVideoPreview', firstDepthSrc);
            this.colorVideoPreview = colorVideoElement;
            this.depthVideoPreview = depthVideoElement;

            colorVideoElement.style.top = 100 + 'px';
            colorVideoElement.style.left = 50 + 'px';
            depthVideoElement.style.top = 100 + 'px';
            depthVideoElement.style.left = 340 + 'px';

            colorVideoElement.addEventListener('timeupdate', () => {
                if (!this.isPlaying) { return; } // ignore timeupdates due to user scrolling interactions
                if (!this.selectedSegmentId) { return; } // TODO: make it work even if no selected segment
                // console.log('timeupdate: ', colorVideoElement.currentTime);
                let timeMs = colorVideoElement.currentTime * 1000;
                let segmentInfo = this.trackInfo.tracks.defaultDevice.segments[this.selectedSegmentId];
                let absoluteTime = segmentInfo.start + timeMs;
                this.movePlayheadToTime(absoluteTime);
            });

            document.body.appendChild(colorVideoElement);
            document.body.appendChild(depthVideoElement);
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
                let leftMargin = 5;
                let rightMargin = 5;
                let halfPlayheadWidth = 10;
                playheadElement.style.left = Math.min(containerWidth - halfPlayheadWidth - rightMargin, Math.max(leftMargin, relativeX)) - halfPlayheadWidth + 'px';

                let playheadTimePercent = (parseInt(playheadElement.style.left) + halfPlayheadWidth) / (containerWidth - leftMargin - rightMargin);
                // console.log(playheadTimePercent);

                let duration = this.trackInfo.metadata.maxTime - this.trackInfo.metadata.minTime;
                this.timeScrolledTo(this.trackInfo.metadata.minTime + playheadTimePercent * duration);
            });
            playheadElement.addEventListener('pointerdown', e => {
                this.playheadClickedDown = true;
                playheadElement.classList.add('timelinePlayheadSelected');
                if (this.isPlaying) {
                    this.pauseVideoPlayback();
                }
            });
            document.addEventListener('pointerup', e => {
                this.playheadClickedDown = false;
                playheadElement.classList.remove('timelinePlayheadSelected');
            });
            document.addEventListener('pointercancel', e => {
                this.playheadClickedDown = false;
                playheadElement.classList.remove('timelinePlayheadSelected');
            });
        }
        playVideoPlayback() {
            this.colorVideoPreview.play();
            this.depthVideoPreview.play();
            this.isPlaying = true;

            let playButton = document.getElementById('timelinePlayButton');
            playButton.src = '/addons/vuforia-spatial-remote-operator-addon/pauseButton.svg';
        }
        pauseVideoPlayback() {
            this.colorVideoPreview.pause();
            this.depthVideoPreview.pause();
            this.isPlaying = false;

            let playButton = document.getElementById('timelinePlayButton');
            playButton.src = '/addons/vuforia-spatial-remote-operator-addon/playButton.svg';
        }
        timeScrolledTo(timestamp) {
            // console.log('time scrolled to ' + timestamp);

            // check if timestamp is within [start,end] for any of the segments on all of the tracks
            Object.keys(this.trackInfo.tracks.defaultDevice.segments).forEach(segmentId => {
                let segment = this.trackInfo.tracks.defaultDevice.segments[segmentId];
                if (timestamp > segment.start && timestamp < segment.end) {
                    console.log('Scrolling on top of ' + segmentId);
                    if (this.selectedSegmentId !== segmentId) {
                        this.selectedSegmentId = segmentId;
                        let videoSourceElement = this.colorVideoPreview.querySelector('source');
                        let filename = segmentId.replace(/^.*[\\\/]/, '');
                        videoSourceElement.src = 'http://' + this.ip + ':8080/virtualizer_recording/' + filename;
                        this.colorVideoPreview.load();
                        console.log('src = ' + videoSourceElement.src);
                    }
                    // calculate currentTime
                    console.log((timestamp - segment.start) / 1000);
                    this.colorVideoPreview.currentTime = (timestamp - segment.start) / 1000;
                }
            });

            // if it is, load that video into the video players, and set the currentTime to the correct converted timestamp
        }
        movePlayheadToTime(timestamp) {
            // calculate new X position to follow mouse, constrained to trackBox element
            // let pointerX = e.pageX;

            let trackBox = document.getElementById('timelineTrackBox');
            let containerLeft = trackBox.getClientRects()[0].left;
            let containerWidth = trackBox.getClientRects()[0].width;

            // let relativeX = pointerX - containerLeft;
            let leftMargin = 5;
            let rightMargin = 5;
            let halfPlayheadWidth = 10;
            // playheadElement.style.left = Math.min(containerWidth - halfPlayheadWidth - rightMargin, Math.max(leftMargin, relativeX)) - halfPlayheadWidth + 'px';
            //
            // let playheadTimePercent = (parseInt(playheadElement.style.left) + halfPlayheadWidth) / (containerWidth - leftMargin - rightMargin);
            // // console.log(playheadTimePercent);
            //
            // let duration = this.trackInfo.metadata.maxTime - this.trackInfo.metadata.minTime;
            // this.timeScrolledTo(this.trackInfo.metadata.minTime + playheadTimePercent * duration);

            // calculate normalized time based on absolute timestamp
            let duration = this.trackInfo.metadata.maxTime - this.trackInfo.metadata.minTime;
            let timePercent = Math.max(0, Math.min(1, (timestamp - this.trackInfo.metadata.minTime) / duration));

            let playheadElement = document.getElementById('timelinePlayhead');
            playheadElement.style.left = (timePercent * containerWidth) + rightMargin + halfPlayheadWidth + 'px';

        }
        createVideoTracks(videoInfo) {
            console.log('create track elements for', videoInfo);

            this.trackInfo = {
                tracks: {
                    defaultDevice: { // TODO: give each video the uuid of its author device
                        segments: {},
                        index: 0
                    }
                }, // each device gets its own track. more than one segment can be on that track
                metadata: {
                    minTime: 0,
                    maxTime: 1
                }
            };

            let earliestTime = Date.now();
            let latestTime = 0;

            Object.keys(videoInfo.mergedFiles.color).forEach(filePath => {
                let info = videoInfo.mergedFiles.color[filePath];
                this.trackInfo.tracks.defaultDevice.segments[filePath] = {
                    colorVideo: filePath,
                    depthVideo: 'TODO: get matching depth video',
                    start: info.startTime,
                    end: info.endTime,
                    visible: true,
                };
                earliestTime = Math.min(earliestTime, info.startTime);
                latestTime = Math.max(latestTime, info.endTime);
            });

            // only go back at most 30 mins from the most recent video
            const MAX_TIMELINE_LENGTH = 1000 * 60 * 30;
            let keysToRemove = [];
            let newEarliestTime = latestTime;
            Object.keys(this.trackInfo.tracks.defaultDevice.segments).forEach(segmentId => {
                let segment = this.trackInfo.tracks.defaultDevice.segments[segmentId];
                if (segment.start < latestTime - MAX_TIMELINE_LENGTH) {
                    keysToRemove.push(segmentId);
                } else {
                    newEarliestTime = Math.min(newEarliestTime, segment.start);
                }
            });
            keysToRemove.forEach(segmentId => {
                console.log(segmentId + ' is too old');
                delete this.trackInfo.tracks.defaultDevice.segments[segmentId];
                earliestTime = newEarliestTime;
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

                    let rgbVideos = Object.keys(info.mergedFiles.color).map(absolutePath => absolutePath.replace(/^.*[\\\/]/, ''));
                    let depthVideos = Object.keys(info.mergedFiles.depth).map(absolutePath => absolutePath.replace(/^.*[\\\/]/, ''));

                    console.log(rgbVideos);
                    console.log(depthVideos);

                    resolve({
                        color: rgbVideos,
                        depth: depthVideos
                    });
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

    function sendRequest(url, httpStyle, callback, body) {
        if (!body) { body = ''; }
        let req = new XMLHttpRequest();
        try {
            req.open(httpStyle, url, true);
            if (httpStyle === 'POST') {
                req.setRequestHeader('Access-Control-Allow-Headers', '*');
                req.setRequestHeader('Content-Type', 'application/json;charset=UTF-8');
            }
            // Just like regular ol' XHR
            req.onreadystatechange = function () {
                if (req.readyState === 4) {
                    if (req.status === 200) {
                        // JSON.parse(req.responseText) etc.
                        if (req.responseText)
                            callback(req.responseText);
                    } else {
                        // Handle error case
                        callback('err');
                        console.log('could not load content');
                    }
                }
            };
            if (httpStyle === 'POST') {
                req.send(body);
            } else {
                req.send();
            }

        } catch (e) {
            console.warn(e);
            callback(e);
            callback('err');
            console.log('could not connect to' + url);
        }
    }

    exports.VideoPlayback = VideoPlayback;
})(realityEditor.device);
