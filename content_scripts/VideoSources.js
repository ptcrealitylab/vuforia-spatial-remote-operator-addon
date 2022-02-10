createNameSpace('realityEditor.videoPlayback');

(function (exports) {
    class VideoSources {
        constructor(onDataLoaded) {
            this.onDataLoaded = onDataLoaded;
            this.loadAvailableVideos().then(info => {
                this.videoInfo = info;
                if (this.videoInfo && Object.keys(this.videoInfo).length > 0) {
                    this.createTrackInfo(this.videoInfo);
                }
            }).catch(error => {
                console.log(error);
            });
        }
        createTrackInfo(videoInfo) {
            this.trackInfo = {
                tracks: {}, // each device gets its own track. more than one segment can be on that track
                metadata: {
                    minTime: 0,
                    maxTime: 1
                }
            };

            let earliestTime = Date.now();
            let latestTime = 0;
            let trackIndex = 0;

            Object.keys(videoInfo).forEach(deviceId => {
                console.log('loading track for device: ' + deviceId);
                Object.keys(videoInfo[deviceId]).forEach(sessionId => {
                    console.log('loading ' + deviceId + ' session ' + sessionId);
                    let sessionInfo = videoInfo[deviceId][sessionId];
                    if (typeof sessionInfo.color === 'undefined' || typeof sessionInfo.depth === 'undefined') {
                        return; // skip entries that don't have both videos
                    }
                    if (typeof this.trackInfo.tracks[deviceId] === 'undefined') {
                        this.trackInfo.tracks[deviceId] = {
                            segments: {},
                            index: trackIndex
                        };
                        trackIndex++;
                    }
                    let timeInfo = this.parseTimeInfo(sessionInfo.color);
                    this.trackInfo.tracks[deviceId].segments[sessionId] = {
                        colorVideo: sessionInfo.color,
                        depthVideo: sessionInfo.depth, // this.getMatchingDepthVideo(filePath),
                        start: parseInt(timeInfo.start),
                        end: parseInt(timeInfo.end),
                        visible: true,
                    };
                    earliestTime = Math.min(earliestTime, timeInfo.start);
                    latestTime = Math.max(latestTime, timeInfo.end);
                });
            });

            this.trackInfo.metadata.minTime = earliestTime;
            this.trackInfo.metadata.maxTime = latestTime > 0 ? latestTime : Date.now();
            console.log('trackInfo', this.trackInfo);

            this.addPoseInfoToTracks().then(response => {
                console.log('addPoseInfoToTracks', response);
                this.onDataLoaded(this.videoInfo, this.trackInfo);
            }).catch(error => {
                console.warn('error in addPoseInfoToTracks', error);
            });
        }
        parseTimeInfo(filename) {
            let re_start = new RegExp('start_[0-9]{13,}');
            let re_end = new RegExp('end_[0-9]{13,}');
            let startMatches = filename.match(re_start);
            let endMatches = filename.match(re_end);
            if (!startMatches || !endMatches || startMatches.length === 0 || endMatches.length === 0) { return null; }
            return {
                start: startMatches[0].replace('start_', ''),
                end: endMatches[0].replace('end_', '')
            };
        }
        getTrackInfo(deviceId) {
            return this.trackInfo.tracks[deviceId];
        }
        getSegmentInfo(deviceId, segmentId) {
            return this.getTrackInfo(deviceId).segments[segmentId];
        }
        getClosestPose(deviceId, segmentId, absoluteTime) {
            let segmentPoses = this.getSegmentInfo(deviceId, segmentId).poses;
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
        loadAvailableVideos() {
            return new Promise((resolve, reject) => {
                // this.downloadVideoInfo().then(info => console.log(info));
                // httpGet('http://' + this.ip + ':31337/videoInfo').then(info => {
                this.httpGet('/virtualizer_recordings').then(info => {
                    console.log(info);
                    resolve(info);
                }).catch(reason => {
                    console.warn(reason);
                    reject(reason);
                });
            });
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
                this.httpGet('/virtualizer_recording/' + deviceId + '/pose/device_' + deviceId + '_session_' + segmentId + '.json').then(poseInfo => {
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
        httpGet(url) {
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
    }

    exports.VideoSources = VideoSources;
})(realityEditor.videoPlayback);
