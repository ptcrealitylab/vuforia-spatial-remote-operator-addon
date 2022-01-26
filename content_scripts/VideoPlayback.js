/*
* Copyright © 2022 PTC
*/

createNameSpace('realityEditor.device');

(function(exports) {
    class VideoPlayback {
        constructor(serverIp) {
            this.ip = serverIp;
            this.videoInfo = null;
            this.visible = true;
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
            // [ ] create a timeline
            // [ ] create a playhead on the timeline for scrolling
            // [ ] create a play and pause button
            this.timelineContainer = this.createTimelineElement();
            document.body.appendChild(this.timelineContainer);

            // [ ] create a track on the timeline for each pair of videos – vertically spaced per device – horizontally per timestamp

            // [x] create two preview videos

            let firstColorSrc = 'http://' + this.ip + ':8080/virtualizer_recording/' + info.color[0];
            let firstDepthSrc = 'http://' + this.ip + ':8080/virtualizer_recording/' + info.depth[0];

            console.log('create HTML elements');
            let colorVideoElement = this.createVideoElement('colorVideoPreview', firstColorSrc);
            let depthVideoElement = this.createVideoElement('depthVideoPreview', firstDepthSrc);

            colorVideoElement.style.top = 100 + 'px';
            colorVideoElement.style.left = 50 + 'px';
            depthVideoElement.style.top = 100 + 'px';
            depthVideoElement.style.left = 340 + 'px';

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

            return container;
        }
        createVideoElement(id, src) {
            let video = document.createElement('video');
            video.id = id;
            video.classList.add('videoPreview');
            video.setAttribute('width', '240');
            video.setAttribute('controls', 'controls');
            video.setAttribute('muted', 'muted');
            video.setAttribute('autoplay', 'autoplay');

            let source = document.createElement('source');
            source.src = src;
            video.appendChild(source);

            /*
                <video id="videoPlayer" width="650" controls muted="muted" autoplay>
                    <source src="/video/depth_stream_1643050443659.mp4" type="video/mp4" />
                    <!--        <source src="/video/color_stream_1643050443650.mp4" type="video/mp4" />-->
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
                // console.log(this.videoInfo);

                // sendRequest('http://' + this.ip + ':31337/videoInfo', 'GET', function (response) {
                //     console.log('response', response);
                // });
            });
        }
        // async downloadVideoInfo() {
        //     // download the object data from its server
        //     let url = 'http://' + this.ip + ':31337/videoInfo';
        //     let response = null;
        //     try {
        //         response = await httpGet(url);
        //         return response;
        //     } catch (_e) {
        //         return null;
        //     }
        // }
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
