createNameSpace('realityEditor.videoPlayback');

(function (exports) {

    class TimelineModel {
        constructor() {
            this.database = null;
            this.currentView = new realityEditor.videoPlayback.DataView();
            this.selectedDate = null;
            this.currentTimestamp = null;
            this.isPlaying = false;
            this.timelineWindow = new realityEditor.videoPlayback.TimelineWindow();
            this.timelineWindow.onWithoutZoomUpdated(this.handleWindowUpdated.bind(this));
            this.callbacks = {
                onDataLoaded: [],
                onDataViewUpdated: [],
                onWindowUpdated: [],
                onTimestampUpdated: []
            };
        }
        handleWindowUpdated(window) {
            // TODO: update data view
            console.log('new bounds', window.bounds);
            // update the timestamp based on its percent position and the new date
            this.setTimestamp(window.bounds.current.min, true);

            this.callbacks.onWindowUpdated.forEach(cb => {
                cb(window);
            });
        }
        setDatabase(database) {
            this.database = database;
            this.callbacks.onDataLoaded.forEach(cb => {
                cb('todo add data here');
            });
        }
        setTimestamp(newTimestamp, triggerCallbacks) {
            if (this.currentTimestamp === newTimestamp) { return; } // don't update if no change
            this.currentTimestamp = newTimestamp;
            if (triggerCallbacks) {
                this.callbacks.onTimestampUpdated.forEach(cb => {
                    cb(this.currentTimestamp);
                });
            }
        }
        getPlayheadTimePercent(inWindow) {
            let min, max;
            if (inWindow) {
                min = this.timelineWindow.bounds.current.min;
                max = this.timelineWindow.bounds.current.max;
            } else {
                min = this.timelineWindow.bounds.withoutZoom.min;
                max = this.timelineWindow.bounds.withoutZoom.max;
            }
            return (this.currentTimestamp - min) / (max - min);
        }
        setTimestampFromPositionInWindow(percentInWindow) {
            let min = this.timelineWindow.bounds.current.min;
            let max = this.timelineWindow.bounds.current.max;
            let current = min + (max - min) * percentInWindow;
            this.setTimestamp(current, true);
        }
        onDataLoaded(callback) {
            this.callbacks.onDataLoaded.push(callback);
        }
        onDataViewUpdated(callback) {
            this.callbacks.onDataViewUpdated.push(callback);
        }
        onWindowUpdated(callback) {
            this.callbacks.onWindowUpdated.push(callback);
        }
        onTimestampUpdated(callback) {
            this.callbacks.onTimestampUpdated.push(callback);
        }
    }

    exports.TimelineModel = TimelineModel;
})(realityEditor.videoPlayback);
