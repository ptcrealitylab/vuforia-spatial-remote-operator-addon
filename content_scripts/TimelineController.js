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

            this.view = new realityEditor.videoPlayback.TimelineView(document.body);

            this.setupUserInteractions();
        }
        setupUserInteractions() {
            this.view.playButton.addEventListener('pointerup', _e => {
                // toggle playback
            });
            this.view.speedButton.addEventListener('pointerup', _e => {
                // multiply speed by 2
            });
            this.view.calendarButton.addEventListener('pointerup', _e => {
                // present the calendar
                if (!this.calendar) {
                    this.calendar = new realityEditor.videoPlayback.Calendar(this.view.timelineContainer);
                    this.calendar.onDateSelected(this.handleCalendarDateSelected.bind(this));
                    // TODO: re-enable calendar functionality (highlight dates, select date to set dataview)
                    /*
                    this.calendar.highlightDates(this.datesWithVideos);
                    this.calendar.onDateSelected(dateObject => {
                        this.showDataForDate(dateObject, true);
                    });
                    this.calendar.selectDay(this.dayBounds.min);
                    */
                }
                if (this.calendar.dom.classList.contains('timelineCalendarVisible')) {
                    this.calendar.dom.classList.remove('timelineCalendarVisible');
                    this.calendar.dom.classList.add('timelineCalendarHidden');
                } else {
                    this.calendar.dom.classList.add('timelineCalendarVisible');
                    this.calendar.dom.classList.remove('timelineCalendarHidden');
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
                // if (this.isPlaying) {
                //     this.pauseVideoPlayback();
                // }
                console.log('onPlayheadSelected');
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
            console.log(dataView); // which date is selected, can be used to filter the database
        }
        handleWindowUpdated(window) {
            console.log(window); // the withoutZoom and current .min and .max timestamp on the visible timeline window

            this.view.render({
                zoomPercent: window.getZoomPercent(),
                scrollLeftPercent: window.getScrollLeftPercent()
            });
        }
        handleTimestampUpdated(timestamp) {
            console.log(timestamp); // what timestamp of data is selected
            // this.view.displayTime(timestamp);
            let percentInWindow = this.model.getPlayheadTimePercent(true);
            // this.view.setPlayheadByPercent(percentInWindow);

            this.view.render({
                playheadTimePercent: percentInWindow,
                timestamp: timestamp
            });
        }
        onVideoFrame(callback) {
            this.callbacks.onVideoFrame.push(callback);
        }
        togglePlayback(_toggled) {
            // toggle playback
        }
        multiplySpeed(_factor = 2, _allowLoop = true) {
            // update the playback speed, which subsequently re-renders the view (button image)
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
