createNameSpace('realityEditor.videoPlayback');

(function (exports) {

    class TimelineController {
        constructor() {
            this.callbacks = {
                onVideoFrame: [],
                onDataFrame: [],
                onSegmentDeselected: []
            };

            this.model = new realityEditor.videoPlayback.TimelineModel();
            this.model.onDataLoaded(this.handleDataLoaded.bind(this));
            this.model.onDataViewUpdated(this.handleDataViewUpdated.bind(this));
            this.model.onWindowUpdated(this.handleWindowUpdated.bind(this));
            this.model.onTimestampUpdated(this.handleTimestampUpdated.bind(this));
            this.model.onPlaybackToggled(this.handlePlaybackToggled.bind(this));
            this.model.onSpeedUpdated(this.handleSpeedUpdated.bind(this));
            this.model.onSegmentSelected(this.handleSegmentSelected.bind(this));
            this.model.onSegmentDeselected(this.handleSegmentDeselected.bind(this));
            this.model.onSegmentData(this.handleSegmentData.bind(this));

            this.view = new realityEditor.videoPlayback.TimelineView(document.body);

            this.setupCalendarView();
            this.setupUserInteractions();
        }
        setupCalendarView() {
            this.calendar = new realityEditor.videoPlayback.Calendar(this.view.timelineContainer, false);
            this.calendar.onDateSelected(this.handleCalendarDateSelected.bind(this));
            this.calendar.selectDay(Date.now()); // TODO: do this when timeline visibility toggled, too
            // TODO: calendar.highlightDates(datesWithVideos)
        }
        setupUserInteractions() {
            this.view.playButton.addEventListener('pointerup', e => {
                // TODO: better way to retrieve button state?
                let isPlayButton = e.currentTarget.src.includes('playButton.svg');
                this.model.togglePlayback(isPlayButton);
            });
            this.view.speedButton.addEventListener('pointerup', _e => {
                this.multiplySpeed(2, true);
            });
            this.view.calendarButton.addEventListener('pointerup', _e => {
                if (this.calendar.dom.classList.contains('timelineCalendarVisible')) {
                    this.calendar.hide();
                } else {
                    this.calendar.show();
                }
            });
            this.view.onZoomHandleChanged(percentZoom => {
                // onZoomChanged(percentZoom)
                // --> as a result, updates window which re-renders the view
                // console.log('onZoomHandleChanged', percentZoom);
                let playheadTimePercent = this.model.getPlayheadTimePercent();
                this.view.onZoomChanged(percentZoom, playheadTimePercent);
            });
            // this.view.zoomHandle.addEventListener('pointerdown', _e => { });
            // this.view.zoomHandle.addEventListener('pointermove', _e => { });
            // this.view.zoomHandle.addEventListener('pointerup', _e => { });
            this.view.onPlayheadSelected(_ => {
                // stop video playback if needed
                // console.log('onPlayheadSelected');
                this.model.togglePlayback(false);
            });
            this.view.onPlayheadChanged(positionInWindow => {
                // calculate timestamp, update video frame
                // --> as a result, setPlayheadTimestamp which re-renders the view
                // console.log('onPlayheadChanged', positionInWindow);
                this.model.setTimestampFromPositionInWindow(positionInWindow);
                // todo: determine which data tracks / segments / pieces use this time, and process them

                // update the currentTime of each of the selected videos
                // we do this specifically in response to user interaction because..
                // if timestamp changes just due to time passing, the video will already play and update
                
                if (this.model.selectedSegments.length === 0) { return; }

                // console.log('set currentTime of each video');
                this.model.selectedSegments.forEach(segment => {
                    let currentTime = (segment.timeMultiplier || 1) * (this.model.currentTimestamp - segment.start) / 1000;

                    let videoElements = this.view.getVideoElementsForTrack(segment.trackId);
                    if (videoElements.color && videoElements.depth) {
                        videoElements.color.currentTime = currentTime;
                        videoElements.depth.currentTime = currentTime;
                    }
                });
            });
            // potentially add onTrackSelected / onSegmentSelected
            this.view.onScrollbarChanged((zoomPercent, leftPercent, rightPercent) => {
                // calculate timeline window
                // console.log('onScrollbarChanged', zoomPercent, leftPercent, rightPercent);
                this.model.adjustCurrentWindow(leftPercent, rightPercent);
            });
            this.view.onVideoElementAdded(videoElement => {
                let videoSegments = this.model.selectedSegments.filter(segment => segment.type === 'VIDEO_3D');
                let isColor = videoElement.id.includes('color');
                let isDepth = videoElement.id.includes('depth');
                if (!isColor && !isDepth) {
                    console.warn('unable to parse segment id from video element - not color or depth');
                }
                // let segmentId = videoElement.src.split('_session_')[1].split('_start_')[0];
                let segmentId = videoElement.querySelector('source').src.split('_session_')[1].split('_start_')[0];

                // let segmentId = isColor ? videoElement.id.split('_color')[0] : videoElement.id.split('_depth')[0];
                let matchingSegment = videoSegments.find(segment => segment.id === segmentId);
                console.log('found segment for video ' + videoElement.id, matchingSegment);

                videoElement.addEventListener('loadedmetadata', _e => {
                    console.log('videoElement loaded metadata');
                    if (typeof matchingSegment.timeMultiplier === 'undefined') {
                        let videoDuration = videoElement.duration;
                        let intendedDuration = (matchingSegment.end - matchingSegment.start) / 1000;
                        matchingSegment.timeMultiplier = videoDuration / intendedDuration;
                        // console.log('timeMultiplier for ' + filename + ' set to ' + segment.timeMultiplier);
                    }
                    videoElement.playbackRate = this.model.playbackSpeed * matchingSegment.timeMultiplier;
                });
                
                if (isColor) {
                    console.log('add timeupdate listener');
                    videoElement.addEventListener('timeupdate', _e => {
                        // console.log('timeupdate');
                        let videoElements = this.view.getVideoElementsForTrack(matchingSegment.trackId);
                        this.callbacks.onVideoFrame.forEach(cb => {
                            cb(videoElements.color, videoElements.depth, matchingSegment);
                        });
                    });
                }
            });
        }
        handleCalendarDateSelected(dateObject) {
            console.log('calendar date selected: ', dateObject);
            this.model.timelineWindow.setWithoutZoomFromDate(dateObject);
        }
        setDatabase(database) {
            this.model.setDatabase(database);
        }
        handleDataLoaded(data) {
            console.log(data); // the tracks that were loaded. triggers again if more data loaded?
        }
        handleDataViewUpdated(dataView) {
            // console.log('displayTracks, dataViewUpdated', dataView); // which date is selected, can be used to filter the database
            let simplifiedTracks = this.generateSimplifiedTracks(dataView);

            this.view.render({
                tracks: simplifiedTracks,
                tracksFullUpdate: true
            });
        }
        generateSimplifiedTracks(dataView) {
            if (!dataView || !dataView.filteredDatabase) { return {}; }
            // process filtered tracks into just the info needed by the view
            let simplifiedTracks = {};
            for (const [trackId, track] of Object.entries(dataView.filteredDatabase.tracks)) {
                simplifiedTracks[trackId] = {
                    id: trackId,
                    type: track.type,
                    segments: {}
                };
                for (const [segmentId, segment] of Object.entries(track.segments)) {
                    simplifiedTracks[trackId].segments[segmentId] = {
                        id: segmentId,
                        type: segment.type,
                        // start: segment.start,
                        // end: segment.end
                        start: this.model.getTimestampAsPercent(segment.start),
                        end: this.model.getTimestampAsPercent(segment.end)
                    };
                }
            }
            return simplifiedTracks;
        }
        handleWindowUpdated(window) {
            // console.log('displayTracks, windowUpdated', window); // the withoutZoom and current .min and .max timestamp on the visible timeline window

            this.view.render({
                zoomPercent: window.getZoomPercent(),
                scrollLeftPercent: window.getScrollLeftPercent(),
                tracks: this.generateSimplifiedTracks(this.model.currentDataView),
                // tracksFullUpdate: true
                // we don't include tracksFullUpdate, since all the view needs to do is move the current segments based on the new window
            });
        }
        handleTimestampUpdated(timestamp) {
            let percentInWindow = this.model.getPlayheadTimePercent(true);
            let percentInDay = this.model.getPlayheadTimePercent(false);
            // console.log(timestamp, percentInWindow); // what timestamp of data is selected

            this.view.render({
                playheadTimePercent: percentInWindow,
                playheadWithoutZoomPercent: percentInDay,
                timestamp: timestamp
            });
        }
        onVideoFrame(callback) {
            this.callbacks.onVideoFrame.push(callback);
        }
        onDataFrame(callback) {
            this.callbacks.onDataFrame.push(callback);
        }
        onSegmentDeselected(callback) {
            this.callbacks.onSegmentDeselected.push(callback);
        }
        multiplySpeed(factor = 2, allowLoop = true) {
            // update the playback speed, which subsequently re-renders the view (button image)
            this.model.multiplySpeed(factor, allowLoop);
        }
        handlePlaybackToggled(isPlaying) {
            console.log('handle playback toggled');
            this.view.render({
                isPlaying: isPlaying
            });
            // play each of the videos in the view
            let tracks = this.generateSimplifiedTracks(this.model.currentDataView);
            Object.keys(tracks).forEach(trackId => {
                let videoElements = this.view.getVideoElementsForTrack(trackId);
                if (videoElements.color && videoElements.depth) {
                    if (isPlaying) {
                        console.log('play videos');
                        videoElements.color.play();
                        videoElements.depth.play();
                    } else {
                        console.log('pause videos');
                        videoElements.color.pause();
                        videoElements.depth.pause();
                    }
                }
            });
        }
        handleSpeedUpdated(playbackSpeed) {
            this.view.render({
                playbackSpeed: playbackSpeed
            });

            this.model.selectedSegments.forEach(segment => {
                let colorVideo = this.view.getVideoElement(segment.id + '_color', segment.trackId);
                let depthVideo = this.view.getVideoElement(segment.id + '_depth', segment.trackId);
                [colorVideo, depthVideo].forEach(video => {
                    video.playbackRate = playbackSpeed * (segment.timeMultiplier || 1)
                });
            });
        }
        toggleVisibility(isNowVisible) {
            // toggle timeline visibility
            if (isNowVisible) {
                this.view.show();

                // TODO - zoom to show the most recent date on the timeline
                /*
                let mostRecentDate = this.datesWithVideos.sort((a, b) => {
                    return a.getTime() - b.getTime();
                })[this.datesWithVideos.length - 1];
                this.showDataForDate(mostRecentDate, true);
                 */
            } else {
                this.view.hide();
            }
        }
        handleSegmentSelected(selectedSegment) {
            console.log('selected segment', selectedSegment);
            this.renderSelectedSegments();
        }
        handleSegmentDeselected(deselectedSegment) {
            console.log('deselected segment', deselectedSegment);
            this.renderSelectedSegments();

            this.callbacks.onSegmentDeselected.forEach(cb => {
                cb(deselectedSegment);
            });
        }
        renderSelectedSegments() {
            // get the set of video segments and re-render
            let videoSegments = this.model.selectedSegments.filter(segment => segment.type === 'VIDEO_3D');
            let videoElements = videoSegments.map(segment => {
                return [
                    { videoId: segment.id + '_color', trackId: segment.trackId, src: segment.dataPieces.colorVideo.videoUrl },
                    { videoId: segment.id + '_depth', trackId: segment.trackId, src: segment.dataPieces.depthVideo.videoUrl },
                ];
            }).flat();

            this.view.render({
                videoElements: videoElements
            });
        }
        handleSegmentData(segment, timestamp, _data) {
            if (segment.type === 'VIDEO_3D') {
                // console.log('processing a 3d video segment', segment, timestamp);
                let cameraPoseMatrix = segment.dataPieces.poses.getClosestData(timestamp).data;
                let colorVideoUrl = segment.dataPieces.colorVideo.videoUrl;
                let depthVideoUrl = segment.dataPieces.depthVideo.videoUrl;
                let timePercent = segment.getTimestampAsPercent(timestamp);
                // this.callbacks.onVideoFrame.forEach(cb => {
                //     cb(colorVideoUrl, depthVideoUrl, timePercent, cameraPoseMatrix);
                // });
                this.callbacks.onDataFrame.forEach(cb => {
                    cb(colorVideoUrl, depthVideoUrl, timePercent, cameraPoseMatrix);
                });
            }
            // TODO: process other data types (IoT, Human Pose) and trigger other callbacks
        }
    }

    exports.TimelineController = TimelineController;
})(realityEditor.videoPlayback);
