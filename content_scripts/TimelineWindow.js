createNameSpace('realityEditor.videoPlayback');

(function (exports) {
    const DAY_LENGTH = 1000 * 60 * 60 * 24;
    class TimelineWindow {
        constructor() {
            this.bounds = {
                withoutZoom: {
                    min: 0,
                    max: 1,
                },
                current: {
                    min: 0,
                    max: 1
                }
            };
            this.callbacks = {
                onWithoutZoomUpdated: [],
                onCurrentWindowUpdated: []
            };
        }
        setWithoutZoomFromDate(dateObject) {
            this.bounds.withoutZoom.min = dateObject.getTime();
            this.bounds.withoutZoom.max = dateObject.getTime() + DAY_LENGTH - 1; // remove 1ms so that day ends at 11:59:59.99

            // TODO: update current bounds separately, just doing this temporarily
            this.bounds.current.min = this.bounds.withoutZoom.min;
            this.bounds.current.max = this.bounds.withoutZoom.max;

            this.callbacks.onWithoutZoomUpdated.forEach(cb => {
                cb(this);
            });
        }
        setCurrentFromPercent(minPercent, maxPercent) {
            let fullLength = this.bounds.withoutZoom.max - this.bounds.withoutZoom.min;
            this.bounds.current.min = this.bounds.withoutZoom.min + minPercent * fullLength;
            this.bounds.current.max = this.bounds.withoutZoom.min + maxPercent * fullLength;
            // TODO: do we trigger callbacks??

            this.callbacks.onCurrentWindowUpdated.forEach(cb => {
                cb(this);
            });
        }
        getZoomPercent() { // 0 if not zoomed at all (see 100%), 1 if current window is 0% of the withoutZoom window
            return 1.0 - (this.bounds.current.max - this.bounds.current.min) / (this.bounds.withoutZoom.max - this.bounds.withoutZoom.min);
        }
        getScrollLeftPercent() {
            return (this.bounds.current.min - this.bounds.withoutZoom.min) / (this.bounds.withoutZoom.max - this.bounds.withoutZoom.min);
        }
        onWithoutZoomUpdated(callback) {
            this.callbacks.onWithoutZoomUpdated.push(callback);
        }
        onCurrentWindowUpdated(callback) {
            this.callbacks.onCurrentWindowUpdated.push(callback);
        }
    }
    exports.TimelineWindow = TimelineWindow;
})(realityEditor.videoPlayback);
