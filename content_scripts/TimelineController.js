createNameSpace('realityEditor.videoPlayback');

(function (exports) {

    class TimelineController {
        constructor() {
            this.callbacks = {
                onVideoFrame: []
            };

            this.model = new realityEditor.videoPlayback.TimelineModel();
            this.model.onDataLoaded(this.handleDataLoaded.bind(this));
            this.model.onDataViewUpdated(this.handleDataViewUpdated.bind(this));
            this.model.onWindowUpdated(this.handleWindowUpdated.bind(this));
            this.model.onTimestampUpdated(this.handleTimestampUpdated.bind(this));
            this.model.onPlaybackToggled(this.handlePlaybackToggled.bind(this));
            this.model.onSpeedUpdated(this.handleSpeedUpdated.bind(this));

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
                this.togglePlayback(isPlayButton);
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
                console.log('onZoomHandleChanged', percentZoom);
                let playheadTimePercent = this.model.getPlayheadTimePercent();
                this.view.onZoomChanged(percentZoom, playheadTimePercent);
            });
            // this.view.zoomHandle.addEventListener('pointerdown', _e => { });
            // this.view.zoomHandle.addEventListener('pointermove', _e => { });
            // this.view.zoomHandle.addEventListener('pointerup', _e => { });
            this.view.onPlayheadSelected(_ => {
                // stop video playback if needed
                console.log('onPlayheadSelected');
                this.togglePlayback(false);
            });
            this.view.onPlayheadChanged(positionInWindow => {
                // calculate timestamp, update video frame
                // --> as a result, setPlayheadTimestamp which re-renders the view
                console.log('onPlayheadChanged', positionInWindow);
                this.model.setTimestampFromPositionInWindow(positionInWindow);
                // todo: determine which data tracks / segments / pieces use this time, and process them
            });
            // potentially add onTrackSelected / onSegmentSelected
            this.view.onScrollbarChanged((zoomPercent, leftPercent, rightPercent) => {
                // calculate timeline window
                console.log('onScrollbarChanged', zoomPercent, leftPercent, rightPercent);
                this.model.adjustCurrentWindow(leftPercent, rightPercent);
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
            console.log('displayTracks, dataViewUpdated', dataView); // which date is selected, can be used to filter the database
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
            console.log('displayTracks, windowUpdated', window); // the withoutZoom and current .min and .max timestamp on the visible timeline window

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
        togglePlayback(toggled) {
            this.model.togglePlayback(toggled);
        }
        multiplySpeed(factor = 2, allowLoop = true) {
            // update the playback speed, which subsequently re-renders the view (button image)
            this.model.multiplySpeed(factor, allowLoop);
        }
        handlePlaybackToggled(isPlaying) {
            this.view.render({
                isPlaying: isPlaying
            });
        }
        handleSpeedUpdated(playbackSpeed) {
            this.view.render({
                playbackSpeed: playbackSpeed
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
    }

    exports.TimelineController = TimelineController;
})(realityEditor.videoPlayback);
