createNameSpace('realityEditor.videoPlayback');

(function (exports) {

    class TimelineView {
        constructor(parent) {
            this.playButton = null;
            this.speedButton = null;
            this.calendarButton = null;
            this.callbacks = {
                onZoomHandleChanged: [],
                onPlayheadSelected: [],
                onPlayheadChanged: [],
                onScrollbarChanged: []
            };
            this.buildDomElement(parent);
        }
        onZoomHandleChanged(callback) {
            this.callbacks.onZoomHandleChanged.push(callback);
        }
        onPlayheadSelected(callback) {
            this.callbacks.onPlayheadSelected.push(callback);
        }
        onPlayheadChanged(callback) {
            this.callbacks.onPlayheadChanged.push(callback);
        }
        onScrollbarChanged(callback) {
            this.callbacks.onScrollbarChanged.push(callback);
        }
        buildDomElement(parent) {
            // create a timeline, a playhead on the timeline for scrolling, and play/pause/controls
            this.timelineContainer = this.createTimelineElement();
            parent.appendChild(this.timelineContainer);

            // create containers for two preview videos
            let videoPreviewContainer = document.getElementById('timelineVideoPreviewContainer');

            let colorPreviewContainer = document.createElement('div');
            colorPreviewContainer.classList.add('videoPreviewContainer');
            colorPreviewContainer.id = 'timelineColorPreviewContainer';

            let depthPreviewContainer = document.createElement('div');
            depthPreviewContainer.classList.add('videoPreviewContainer');
            depthPreviewContainer.id = 'timelineDepthPreviewContainer';
            depthPreviewContainer.style.left = 256 + 'px';

            videoPreviewContainer.appendChild(colorPreviewContainer);
            // videoPreviewContainer.appendChild(depthPreviewContainer);
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
            timestampDisplay.innerText = this.getFormattedTime(new Date(0));
            leftBox.appendChild(timestampDisplay);

            let dateDisplay = document.createElement('div');
            dateDisplay.id = 'timelineDateDisplay';
            dateDisplay.innerText = this.getFormattedDate(Date.now());
            leftBox.appendChild(dateDisplay);

            let calendarButton = document.createElement('img');
            calendarButton.id = 'timelineCalendarButton';
            calendarButton.src = '/addons/vuforia-spatial-remote-operator-addon/calendarButton.svg';
            leftBox.appendChild(calendarButton);
            this.calendarButton = calendarButton;

            let zoomBar = this.createZoomBar();
            zoomBar.id = 'timelineZoomBar';
            leftBox.appendChild(zoomBar);

            let playhead = document.createElement('img');
            playhead.id = 'timelinePlayhead';
            playhead.src = '/addons/vuforia-spatial-remote-operator-addon/timelinePlayhead.svg';
            centerBox.appendChild(playhead);
            this.playhead = playhead;

            let videoPreviewContainer = document.createElement('div');
            videoPreviewContainer.id = 'timelineVideoPreviewContainer';
            videoPreviewContainer.classList.add('timelineBox');
            videoPreviewContainer.classList.add('timelineVideoPreviewNoTrack'); // need to click on timeline to select
            centerBox.appendChild(videoPreviewContainer);
            // left = -68px is most left as possible
            // width = 480px for now, to show both, but should change to 240px eventually

            let scrollBar = this.createScrollBar();
            scrollBar.id = 'timelineScrollBar';
            centerBox.appendChild(scrollBar);

            let playButton = document.createElement('img');
            playButton.id = 'timelinePlayButton';
            playButton.src = '/addons/vuforia-spatial-remote-operator-addon/playButton.svg';
            this.playButton = playButton;

            // let seekButton = document.createElement('img');
            // seekButton.id = 'timelineSeekButton';
            // seekButton.src = '/addons/vuforia-spatial-remote-operator-addon/seekButton.svg';

            let speedButton = document.createElement('img');
            speedButton.id = 'timelineSpeedButton';
            speedButton.src = '/addons/vuforia-spatial-remote-operator-addon/speedButton_1x.svg';
            this.speedButton = speedButton;

            [playButton, speedButton].forEach(elt => {
                elt.classList.add('timelineControlButton');
                rightBox.appendChild(elt);
            });

            this.setupPlayhead();

            return container;
        }
        createZoomBar() {
            let container = document.createElement('div');
            let slider = document.createElement('img');
            slider.id = 'zoomSliderBackground';
            slider.src = '/addons/vuforia-spatial-remote-operator-addon/zoomSliderBackground.svg';
            container.appendChild(slider);
            let handle = document.createElement('img');
            handle.id = 'zoomSliderHandle';
            handle.src = '/addons/vuforia-spatial-remote-operator-addon/zoomSliderHandle.svg';
            container.appendChild(handle);
            let isDown = false;
            handle.addEventListener('pointerdown', _e => {
                isDown = true;
            });
            document.addEventListener('pointerup', _e => {
                isDown = false;
            });
            document.addEventListener('pointercancel', _e => {
                isDown = false;
            });
            document.addEventListener('pointermove', e => {
                if (!isDown) { return; }
                let pointerX = e.pageX;
                let sliderLeft = slider.getClientRects()[0].left; // 34
                let sliderRight = slider.getClientRects()[0].right;
                let sliderWidth = slider.getClientRects()[0].width;
                let leftMargin = 15;
                let _handleX = handle.getClientRects()[0].left; // 49 at min
                let handleWidth = handle.getClientRects()[0].width;

                if (pointerX < (sliderLeft + leftMargin)) {
                    handle.style.left = leftMargin - (handleWidth / 2) + 'px';
                } else if (pointerX > (sliderRight - leftMargin)) {
                    handle.style.left = (sliderWidth - leftMargin - handleWidth / 2) + 'px';
                } else {
                    handle.style.left = pointerX - sliderLeft - (handleWidth / 2) + 'px';
                }

                // we scale from linear to sqrt so that it zooms in faster when it is further zoomed out than when it is already zoomed in a lot
                let linearZoom = (parseFloat(handle.style.left) - handleWidth / 2) / ((sliderRight - leftMargin) - (sliderLeft + leftMargin));
                let percentZoom = Math.pow(Math.max(0, linearZoom), 0.25);
                let MAX_ZOOM = 1.0 - (1.0 / 48); // max zoom level is 48x (0.5hr vs 1 day)

                // trigger callbacks to respond to the updated GUI
                this.callbacks.onZoomHandleChanged.forEach(cb => {
                    cb(Math.max(0, Math.min(MAX_ZOOM, percentZoom)));
                });

                // update the scrollbar, which in return will update the model dataview
            });
            return container;
        }
        onZoomChanged(zoomPercent, playheadTimePercent, scrollbarLeftPercent) {
            // make the zoom bar handle fill 1.0 - zoomPercent of the overall bar
            let scrollBar = document.getElementById('timelineScrollBar');
            let handle = scrollBar.querySelector('.timelineScrollBarHandle');
            handle.style.width = (1.0 - zoomPercent) * 100 + '%';

            if (zoomPercent < 0.01) {
                scrollBar.classList.add('timelineScrollBarFadeout');
            } else {
                scrollBar.classList.remove('timelineScrollBarFadeout');
            }

            let newWidth = handle.getClientRects()[0].width;
            let maxLeft = scrollBar.getClientRects()[0].width - newWidth;

            if (typeof scrollbarLeftPercent === 'undefined') {
                // keep the timeline playhead at the same timestamp and zoom around that
                let trackBox = document.getElementById('timelineTrackBox');
                let containerWidth = trackBox.getClientRects()[0].width;
                let playheadElement = document.getElementById('timelinePlayhead');
                let leftMargin = 20;
                let rightMargin = 20;
                let halfPlayheadWidth = 10;
                let playheadLeft = parseInt(playheadElement.style.left) || halfPlayheadWidth;
                let playheadTimePercentWindow = (playheadLeft + halfPlayheadWidth - leftMargin) / (containerWidth - halfPlayheadWidth - leftMargin - rightMargin);

                // let absoluteTime = this.dayBounds.min + playheadTimePercentDay * this.DAY_LENGTH;

                // TODO: separate metadata time from window time from day length so we can perform these calculations
                // let playheadTimePercent = (this.playheadTimestamp - this.trackInfo.metadata.minTime) / (this.trackInfo.metadata.maxTime - this.trackInfo.metadata.minTime);
                // console.log('timepercent = ' + playheadTimePercent);

                // reposition the scrollbar handle left so that it would keep the playhead at the same spot.

                // if previous leftPercent is 0, new leftPercent is 0
                // move scrollbar handle to playheadTimePercent, then move it so playhead is playheadTimePercent within the handle width
                let newLeft = (playheadTimePercent * scrollBar.getClientRects()[0].width) - (playheadTimePercentWindow * handle.getClientRects()[0].width);
                // TODO: this is off if you scroll in halfway, move playhead sideways, then continue scrolling
                handle.style.left = Math.max(0, Math.min(maxLeft, newLeft)) + 'px';

            } else {
                let newLeft = scrollbarLeftPercent * scrollBar.getClientRects()[0].width;
                handle.style.left = Math.max(0, Math.min(maxLeft, newLeft)) + 'px';
            }

            let startPercent = (handle.getClientRects()[0].left - scrollBar.getClientRects()[0].left) / scrollBar.getClientRects()[0].width;
            let endPercent = (handle.getClientRects()[0].right - scrollBar.getClientRects()[0].left) / scrollBar.getClientRects()[0].width;
            // this.onTimelineWindowChanged(zoomPercent, startPercent, endPercent);

            this.callbacks.onScrollbarChanged.forEach(cb => {
                cb(zoomPercent, startPercent, endPercent);
            });
        }
        createScrollBar() {
            let container = document.createElement('div');
            let handle = document.createElement('div');
            container.appendChild(handle);
            // container.classList.add('hiddenScrollBar'); // TODO: add this after a few seconds of not interacting or hovering over the scrollable panel
            container.classList.add('timelineScrollBarContainer');
            handle.classList.add('timelineScrollBarHandle');
            let isDown = false;
            let pointerOffset = 0;
            handle.addEventListener('pointerdown', e => {
                isDown = true;
                let handleX = handle.getClientRects()[0].left; // 49 at min
                let handleWidth = handle.getClientRects()[0].width;
                pointerOffset = e.pageX - (handleX + handleWidth / 2);
            });
            document.addEventListener('pointerup', _e => {
                isDown = false;
            });
            document.addEventListener('pointercancel', _e => {
                isDown = false;
            });
            document.addEventListener('pointermove', e => {
                if (!isDown) { return; }
                let pointerX = e.pageX;
                let sliderLeft = container.getClientRects()[0].left; // 34
                let sliderRight = container.getClientRects()[0].right;
                let sliderWidth = container.getClientRects()[0].width;
                let _handleX = handle.getClientRects()[0].left; // 49 at min
                let handleWidth = handle.getClientRects()[0].width;

                if (pointerX < sliderLeft + handleWidth / 2) {
                    handle.style.left = '0px';
                } else if (pointerX > sliderRight - handleWidth / 2) {
                    handle.style.left = (sliderWidth - handleWidth) + 'px';
                } else {
                    handle.style.left = (pointerX - pointerOffset) - (sliderLeft + handleWidth / 2) + 'px';
                }

                let startPercent = (handle.getClientRects()[0].left - container.getClientRects()[0].left) / container.getClientRects()[0].width;
                let endPercent = (handle.getClientRects()[0].right - container.getClientRects()[0].left) / container.getClientRects()[0].width;
                let zoomPercent = 1.0 - handle.getClientRects()[0].width / container.getClientRects()[0].width;

                this.callbacks.onScrollbarChanged.forEach(cb => {
                    cb(zoomPercent, startPercent, endPercent);
                });
            });
            return container;
        }
        setupPlayhead() {
            let playheadElement = this.playhead;
            // document.addEventListener('pointerdown', e => {
            //     this.pointerStart = {
            //         x: e.pageX,
            //         y: e.pageY
            //     };
            // });
            document.addEventListener('pointermove', e => {
                this.onDocumentPointerMove(e);
            });
            playheadElement.addEventListener('pointerdown', _e => {
                this.playheadClickedDown = true;
                playheadElement.classList.add('timelinePlayheadSelected');

                let videoPreview = document.getElementById('timelineVideoPreviewContainer');
                videoPreview.classList.add('timelineVideoPreviewSelected');

                this.callbacks.onPlayheadSelected.forEach(cb => {
                    cb();
                });
            });
            document.addEventListener('pointerup', e => {
                this.onDocumentPointerUp(e);
            });
            document.addEventListener('pointercancel', e => {
                this.onDocumentPointerUp(e);
            });

            // TODO: controller or model needs to set up initial timestamp
            /*
            setTimeout(() => {
                // console.log('move playhead to beginning');
                this.setPlayheadTimestamp(this.trackInfo.metadata.minTime);
                this.timeScrolledTo(this.trackInfo.metadata.minTime, true);
            }, 100);
            */
        }
        onDocumentPointerUp(_e) {
            // reset playhead selection
            this.playheadClickedDown = false;
            let playheadElement = document.getElementById('timelinePlayhead');
            playheadElement.classList.remove('timelinePlayheadSelected');

            let videoPreview = document.getElementById('timelineVideoPreviewContainer');
            videoPreview.classList.remove('timelineVideoPreviewSelected');

            // this.pointerStart = null;
        }
        onDocumentPointerMove(e) {
            if (this.playheadClickedDown) {
                this.onPointerMovePlayhead(e);
            }
        }
        onPointerMovePlayhead(e) {
            let playheadElement = document.getElementById('timelinePlayhead');

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
            let playheadLeft = parseInt(playheadElement.style.left) || halfPlayheadWidth;
            // move timelineVideoPreviewContainer to correct spot (constrained to -68px < left < (innerWidth - 588)
            let videoPreviewContainer = document.getElementById('timelineVideoPreviewContainer');
            if (videoPreviewContainer && videoPreviewContainer.getClientRects()[0]) {
                let previewWidth = videoPreviewContainer.getClientRects()[0].width;
                let previewRelativeX = playheadLeft + halfPlayheadWidth - previewWidth / 2;
                videoPreviewContainer.style.left = Math.min((window.innerWidth - previewWidth) - 160, Math.max(-128, previewRelativeX)) + 'px';
            }

            let playheadTimePercentWindow = (playheadLeft + halfPlayheadWidth - leftMargin) / (containerWidth - halfPlayheadWidth - leftMargin - rightMargin);

            // TODO: do the calculations from percent -> absolute timestamp in the controller or model
            /*
            let windowDuration = this.windowBounds.max - this.windowBounds.min;
            let absoluteTimeWindow = this.windowBounds.min + playheadTimePercentWindow * windowDuration;
             */

            // console.log('absoluteTime = ' + absoluteTimeWindow);
            // TODO: controller / model needs to trigger these eventually to re-render timestamp and render the video
            /*
            this.setPlayheadTimestamp(absoluteTimeWindow);
            this.timeScrolledTo(absoluteTimeWindow, true);
            */

            this.callbacks.onPlayheadChanged.forEach(cb => {
                cb(playheadTimePercentWindow);
            });
        }

        /**
         * Update the GUI in response to new data from the model/controller
         * @param {{playheadTimePercent: number, timestamp: number, zoomPercent: number, scrollLeftPercent: number}} props
         */
        render(props) {
            if (typeof props.playheadTimePercent !== 'undefined') {
                this.displayPlayhead(props.playheadTimePercent);
            }
            if (typeof props.timestamp !== 'undefined') {
                this.displayTime(props.timestamp);
            }
            if (typeof props.zoomPercent !== 'undefined') {
                this.displayZoom(props.zoomPercent);
                if (typeof props.scrollLeftPercent !== 'undefined') {
                    this.displayScroll(props.scrollLeftPercent, props.zoomPercent);
                }
            }
        }
        displayPlayhead(percentInWindow) {
            // calculate and set playheadLeft
            let trackBox = document.getElementById('timelineTrackBox');
            let containerWidth = trackBox.getClientRects()[0].width;
            let halfPlayheadWidth = 10;
            let leftMargin = 20;
            let rightMargin = 20;
            let playheadLeft = (percentInWindow * (containerWidth - halfPlayheadWidth - leftMargin - rightMargin)) - (halfPlayheadWidth - leftMargin);
            let playheadElement = document.getElementById('timelinePlayhead');
            playheadElement.style.left = playheadLeft + 'px';

            // TODO: update video preview container too? are we keeping that?
            /*
            // // calculate new X position to follow mouse, constrained to trackBox element
            // let containerLeft = trackBox.getClientRects()[0].left;
            //
            // let relativeX = pointerX - containerLeft;
            // playheadElement.style.left = Math.min(containerWidth - halfPlayheadWidth - rightMargin, Math.max(leftMargin, relativeX)) - halfPlayheadWidth + 'px';
            // let playheadLeft = parseInt(playheadElement.style.left) || halfPlayheadWidth;
            // // move timelineVideoPreviewContainer to correct spot (constrained to -68px < left < (innerWidth - 588)
            // let videoPreviewContainer = document.getElementById('timelineVideoPreviewContainer');
            // if (videoPreviewContainer && videoPreviewContainer.getClientRects()[0]) {
            //     let previewWidth = videoPreviewContainer.getClientRects()[0].width;
            //     let previewRelativeX = playheadLeft + halfPlayheadWidth - previewWidth / 2;
            //     videoPreviewContainer.style.left = Math.min((window.innerWidth - previewWidth) - 160, Math.max(-128, previewRelativeX)) + 'px';
            // }
            */
        }
        displayTime(timestamp) {
            // let timezoneOffsetMs = new Date().getTimezoneOffset() * 60 * 1000; // getTimezoneOffset() returns minutes
            // let localTime = timestamp - timezoneOffsetMs;
            let textfield = document.getElementById('timelineTimestampDisplay');
            textfield.innerText = this.getFormattedTime(timestamp); // requires timezone offset
            // textfield.innerText = this.getFormattedTime(localTime); // requires timezone offset

            let dateTextfield = document.getElementById('timelineDateDisplay');
            dateTextfield.innerText = this.getFormattedDate(timestamp);
        }
        displayZoom(zoomPercent) {
            // TODO: move zoom handle based on zoom percent
            console.log('render zoom', zoomPercent);
        }
        displayScroll(scrollLeftPercent, zoomPercent) {
            // TODO: move scrollbar based on scroll and zoom percent
            console.log('render scrollbar', scrollLeftPercent, zoomPercent);
        }
        getFormattedTime(relativeTimestamp) {
            return new Date(relativeTimestamp).toLocaleTimeString();
        }
        getFormattedDate(timestamp) { // Format: 'Mon, Apr 18, 2022'
            return new Date(timestamp).toLocaleDateString('en-us', {
                weekday: 'short', year: 'numeric', month: 'short', day: 'numeric'
            });
        }
        show() {
            this.timelineContainer.classList.remove('hiddenTimeline');
        }
        hide() {
            this.timelineContainer.classList.add('hiddenTimeline');
        }
    }

    exports.TimelineView = TimelineView;
})(realityEditor.videoPlayback);
