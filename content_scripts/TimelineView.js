createNameSpace('realityEditor.videoPlayback');

(function (exports) {
    const ZOOM_EXPONENT = 0.5;
    const MAX_ZOOM_FACTOR = 96; // 24 hours -> 15 minutes

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
            // container has a left box to hold date/time, a center box for the timeline, and a right box for playback controls
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

            // extra div added to box with slightly different dimensions, to hide the horizontal overflow
            let centerScrollBox = document.createElement('div');
            centerScrollBox.id = 'timelineTrackScrollBox';
            centerBox.appendChild(centerScrollBox);

            // the element that will actually hold the data tracks and segments
            let timelineTracksContainer = document.createElement('div');
            timelineTracksContainer.id = 'timelineTracksContainer';
            centerScrollBox.appendChild(timelineTracksContainer);

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
            centerScrollBox.appendChild(playhead);
            this.playhead = playhead;

            let playheadDot = document.createElement('div');
            playheadDot.id = 'timelinePlayheadDot';
            centerScrollBox.appendChild(playheadDot);

            let videoPreviewContainer = document.createElement('div');
            videoPreviewContainer.id = 'timelineVideoPreviewContainer';
            videoPreviewContainer.classList.add('timelineBox');
            videoPreviewContainer.classList.add('timelineVideoPreviewNoTrack'); // need to click on timeline to select
            centerScrollBox.appendChild(videoPreviewContainer);
            // left = -68px is most left as possible
            // width = 480px for now, to show both, but should change to 240px eventually

            let scrollBar = this.createScrollBar();
            scrollBar.id = 'timelineScrollBar';
            centerScrollBox.appendChild(scrollBar);

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
                let percentZoom = Math.pow(Math.max(0, linearZoom), ZOOM_EXPONENT);
                let MAX_ZOOM = 1.0 - (1.0 / MAX_ZOOM_FACTOR); // max zoom level is 96x (15 minutes vs 1 day)

                // trigger callbacks to respond to the updated GUI
                this.callbacks.onZoomHandleChanged.forEach(cb => {
                    cb(Math.max(0, Math.min(MAX_ZOOM, percentZoom)));
                });

                // update the scrollbar, which in return will update the model dataview
            });
            return container;
        }
        onZoomChanged(zoomPercent, playheadTimePercent, scrollbarLeftPercent) { // TODO: make use of render functions to simplify
            // make the zoom bar handle fill 1.0 - zoomPercent of the overall bar
            let scrollBar = document.getElementById('timelineScrollBar');
            let handle = scrollBar.querySelector('.timelineScrollBarHandle');
            let playheadDot = document.getElementById('timelinePlayheadDot');
            handle.style.width = (1.0 - zoomPercent) * 100 + '%';

            if (zoomPercent < 0.01) {
                scrollBar.classList.add('timelineScrollBarFadeout');
                playheadDot.classList.add('timelineScrollBarFadeout');
            } else {
                scrollBar.classList.remove('timelineScrollBarFadeout');
                playheadDot.classList.remove('timelineScrollBarFadeout');
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

                let playheadDot = document.getElementById('timelinePlayheadDot');
                playheadDot.classList.add('timelinePlayheadSelected');

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

            let playheadDot = document.getElementById('timelinePlayheadDot');
            playheadDot.classList.remove('timelinePlayheadSelected');

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
         * @param {{playheadTimePercent: number, timestamp: number, zoomPercent: number, scrollLeftPercent: number,
         * isPlaying: boolean, playbackSpeed: number, tracks: {}}} props
         */
        render(props) {
            if (typeof props.playheadTimePercent !== 'undefined') {
                this.displayPlayhead(props.playheadTimePercent);
            }
            if (typeof props.playheadWithoutZoomPercent !== 'undefined') {
                this.displayPlayheadDot(props.playheadWithoutZoomPercent);
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
            if (typeof props.isPlaying !== 'undefined') {
                this.displayIsPlaying(props.isPlaying);
            }
            if (typeof props.playbackSpeed !== 'undefined') {
                this.displayPlaybackSpeed(props.playbackSpeed);
            }
            // TODO: add a more optimized pathway if we know the filtered database hasn't changed
            // e.g. (no new tracks/segments, just repositioning them within the changing window)
            if (typeof props.tracks !== 'undefined') {
                let fullUpdate = props.tracksFullUpdate;
                this.displayTracks(props.tracks, fullUpdate);
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
        displayPlayheadDot(percentInDay) {
            // put a little dot on the scrollbar showing the currentWindow-agnostic position of the playhead
            let playheadDot = document.getElementById('timelinePlayheadDot');
            // let scrollBar = document.getElementById('timelineScrollBar');
            let trackBox = document.getElementById('timelineTrackBox');
            let containerWidth = trackBox.getClientRects()[0].width;
            let leftMargin = 20;
            let rightMargin = 20;
            let halfPlayheadWidth = 10;
            let halfDotWidth = 5;

            playheadDot.style.left = (leftMargin - halfDotWidth) + percentInDay * (containerWidth - halfPlayheadWidth - leftMargin - rightMargin) + 'px';

            // handle.style.width = (1.0 - zoomPercent) * 100 + '%';
            // handle.style.left = scrollLeftPercent * (containerWidth - halfPlayheadWidth - leftMargin - rightMargin) + 'px';

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

            let slider = document.getElementById('zoomSliderBackground');
            let handle = document.getElementById('zoomSliderHandle');
            let leftMargin = 15;
            let sliderLeft = slider.getClientRects()[0].left;
            let sliderRight = slider.getClientRects()[0].right;
            let handleWidth = handle.getClientRects()[0].width;

            // percentZoom = Math.pow(Math.max(0, linearZoom), 0.25)
            let linearZoom = Math.pow(zoomPercent, 1.0 / ZOOM_EXPONENT);
            let handleLeft = linearZoom * ((sliderRight - leftMargin) - (sliderLeft + leftMargin)) + (handleWidth / 2);
            handle.style.left = handleLeft + 'px';
        }
        displayScroll(scrollLeftPercent, zoomPercent) {
            // TODO: move scrollbar based on scroll and zoom percent
            console.log('render scrollbar', scrollLeftPercent, zoomPercent);

            // make the zoom bar handle fill 1.0 - zoomPercent of the overall bar
            let scrollBar = document.getElementById('timelineScrollBar');
            let handle = scrollBar.querySelector('.timelineScrollBarHandle');
            let trackBox = document.getElementById('timelineTrackBox');
            let containerWidth = trackBox.getClientRects()[0].width;
            let leftMargin = 20;
            let rightMargin = 20;
            let halfPlayheadWidth = 10;

            handle.style.width = (1.0 - zoomPercent) * 100 + '%';
            handle.style.left = scrollLeftPercent * (containerWidth - halfPlayheadWidth - leftMargin - rightMargin) + 'px';

            if (zoomPercent < 0.01) {
                scrollBar.classList.add('timelineScrollBarFadeout');
            } else {
                scrollBar.classList.remove('timelineScrollBarFadeout');
            }
        }
        displayIsPlaying(isPlaying) {
            let playButton = document.getElementById('timelinePlayButton');
            let playheadElement = document.getElementById('timelinePlayhead');
            let playheadDot = document.getElementById('timelinePlayheadDot');
            if (isPlaying) {
                playButton.src = '/addons/vuforia-spatial-remote-operator-addon/pauseButton.svg';
                playheadElement.classList.add('timelinePlayheadPlaying');
                playheadDot.classList.add('timelinePlayheadPlaying');
            } else {
                playButton.src = '/addons/vuforia-spatial-remote-operator-addon/playButton.svg';
                playheadElement.classList.remove('timelinePlayheadPlaying');
                playheadDot.classList.remove('timelinePlayheadPlaying');
            }

            // TODO: does this happen here? probably not - probably in controller
            // this.forEachTrack((deviceId, _trackInfo) => {
            //     this.getVideoElement(deviceId, 'color').play();
            //     this.getVideoElement(deviceId, 'depth').play();
            // });
        }
        displayPlaybackSpeed(playbackSpeed) {
            let supportedSpeeds = [1, 2, 4, 8, 16, 32, 64, 128, 256]; // TODO: support more? programmatically?
            if (!supportedSpeeds.includes(playbackSpeed)) {
                console.warn('no SVG button for playback speed ' + playbackSpeed);
            }
            let speedButton = document.getElementById('timelineSpeedButton');
            speedButton.src = '/addons/vuforia-spatial-remote-operator-addon/speedButton_' + playbackSpeed + 'x.svg';
        }
        getFormattedTime(relativeTimestamp) {
            return new Date(relativeTimestamp).toLocaleTimeString();
        }
        getFormattedDate(timestamp) { // Format: 'Mon, Apr 18, 2022'
            return new Date(timestamp).toLocaleDateString('en-us', {
                weekday: 'short', year: 'numeric', month: 'short', day: 'numeric'
            });
        }
        displayTracks(tracks, fullUpdate) {
            console.log('displayTracks: ' + !!fullUpdate, tracks);
            let numTracks = Object.keys(tracks).length;
            let container = document.getElementById('timelineTracksContainer');
            let tracksToUpdate = {};

            if (!fullUpdate) { // we're guaranteed to have the same tracks as before in this use-case
                tracksToUpdate = tracks;
                // compute a quick checksum to ensure we have the right data to update
                let childrenChecksum = Array.from(container.children).map(elt => elt.id).reduce((a, b) => a + b, '');
                let tracksChecksum = Object.keys(tracks).map(id => this.getTrackElementId(id)).reduce((a, b) => a + b, '');
                if (childrenChecksum !== tracksChecksum) {
                    console.warn('tracks needs a full update before we can do a quick update');
                    return;
                }
            } else { // do this when changing dates, to add and remove tracks as needed
                let tracksToRemove = [];
                let tracksToAdd = {};
                Array.from(container.children).forEach(trackElement => {
                    // check if any of the tracks' ids match this element
                    let keep = Object.keys(tracks).map(trackId => this.getTrackElementId(trackId)).includes(trackElement.id);
                    if (!keep) {
                        tracksToRemove.push(trackElement);
                    }
                });
                console.log('tracks to remove', tracksToRemove);
                tracksToRemove.forEach(trackElement => {
                    trackElement.parentElement.removeChild(trackElement);
                });

                Object.keys(tracks).forEach(trackId => {
                    let elementId = this.getTrackElementId(trackId);
                    if (container.querySelector('#' + elementId)) {
                        tracksToUpdate[trackId] = tracks[trackId];
                    } else {
                        tracksToAdd[trackId] = tracks[trackId];
                    }
                });

                console.log('tracksToAdd', tracksToAdd);
                console.log('tracksToUpdate', tracksToUpdate);

                Object.entries(tracksToAdd).forEach(([trackId, track]) => {
                    let index = Object.keys(tracks).indexOf(trackId); // get a consistent index across both for-each loops
                    console.log('creating elements for track: ' + trackId);
                    let trackElement = document.createElement('div');
                    trackElement.classList.add('timelineTrack');
                    trackElement.id = this.getTrackElementId(trackId);
                    container.appendChild(trackElement);
                    this.positionAndScaleTrack(trackElement, track, index, numTracks);

                    Object.entries(track.segments).forEach(([segmentId, segment]) => {
                        let segmentElement = document.createElement('div');
                        segmentElement.classList.add('timelineSegment');
                        segmentElement.id = this.getSegmentElementId(trackId, segmentId);
                        trackElement.appendChild(segmentElement);
                        // this.positionAndScaleSegment(segmentElement, thisTrackId, segmentId);
                        this.positionAndScaleSegment(segmentElement, segment);
                    });
                });
            }

            Object.entries(tracksToUpdate).forEach(([trackId, track]) => {
                let index = Object.keys(tracks).indexOf(trackId); // get a consistent index across both for-each loops
                let elementId = this.getTrackElementId(trackId);
                let trackElement = document.getElementById(elementId);
                this.positionAndScaleTrack(trackElement, track, index, numTracks);

                let segmentsToUpdate = {};

                if (!fullUpdate) {
                    segmentsToUpdate = track.segments;
                    // compute a quick checksum to ensure we have the right data to update
                    let childrenChecksum = Array.from(trackElement.children).map(elt => elt.id).reduce((a, b) => a + b, '');
                    let segmentsChecksum = Object.keys(track.segments).map(id => this.getSegmentElementId(trackId, id)).reduce((a, b) => a + b, '');
                    if (childrenChecksum !== segmentsChecksum) {
                        console.warn('segments needs a full update before we can do a quick update');
                        return;
                    }
                } else {
                    let segmentsToRemove = [];
                    Array.from(trackElement.children).forEach(segmentElement => {
                        // check if any of the tracks' ids match this element
                        let keep = Object.keys(track.segments).map(segmentId => this.getSegmentElementId(trackId, segmentId)).includes(segmentElement.id);
                        if (!keep) {
                            segmentsToRemove.push(segmentElement);
                        }
                    });
                    console.log('segments to remove', segmentsToRemove);
                    segmentsToRemove.forEach(segmentElement => {
                        segmentElement.parentElement.removeChild(segmentElement);
                    });

                    let segmentsToAdd = {};
                    Object.keys(track.segments).forEach(segmentId => {
                        let elementId = this.getSegmentElementId(trackId, segmentId);
                        if (container.querySelector('#' + elementId)) {
                            segmentsToUpdate[segmentId] = track.segments[segmentId];
                        } else {
                            segmentsToAdd[segmentId] = track.segments[segmentId];
                        }
                    });
                    console.log('segmentsToAdd', segmentsToAdd);
                    console.log('segmentsToUpdate', segmentsToUpdate);

                    Object.entries(segmentsToAdd).forEach(([segmentId, segment]) => {
                        let segmentElement = document.createElement('div');
                        segmentElement.classList.add('timelineSegment');
                        segmentElement.id = this.getSegmentElementId(trackId, segmentId);
                        trackElement.appendChild(segmentElement);
                        // this.positionAndScaleSegment(segmentElement, thisTrackId, segmentId);
                        this.positionAndScaleSegment(segmentElement, segment);
                    });
                }

                Object.entries(segmentsToUpdate).forEach(([segmentId, segment]) => {
                    // let index = Object.keys(tracks).indexOf(trackId); // get a consistent index across both for-each loops
                    let elementId = this.getSegmentElementId(trackId, segmentId);
                    let segmentElement = document.getElementById(elementId);
                    this.positionAndScaleSegment(segmentElement, segment);
                });
            });
        }
        positionAndScaleTrack(trackElement, track, index, numTracks) {
            // TODO: color-code based on track.type
            let heightPercent = (80.0 / numTracks);
            let marginPercent = (20.0 / (numTracks + 1));
            trackElement.style.top = ((marginPercent * (index + 1)) + (heightPercent * index)) + '%';
            trackElement.style.height = heightPercent + '%';
        }
        positionAndScaleSegment(segmentElement, segment) { //, trackId, segmentId) {
            // let trackInfo = this.trackInfo.tracks[trackId];
            // let segmentInfo = trackInfo.segments[segmentId];
            // let segmentDuration = segmentInfo.end - segmentInfo.start;

            // let durationPercentWithoutZoom = segment.end.withoutZoom - segment.start.withoutZoom;
            let durationPercentCurrentWindow = segment.end.currentWindow - segment.start.currentWindow;

            // let maxTime = this.windowBounds.max; // Math.max(Date.now(), this.trackInfo.metadata.maxTime);
            // let trackDuration = maxTime - this.windowBounds.min;
            // let lengthPercent = segmentDuration / trackDuration * 100.0;
            // let startPercent = ((segmentInfo.start + this.timeOffsets[trackId][segmentId]) - this.windowBounds.min) / trackDuration * 100.0;
            // segmentElement.style.width = lengthPercent + '%';
            // segmentElement.style.left = startPercent + '%';

            segmentElement.style.width = Math.max(0.1, (durationPercentCurrentWindow * 100)) + '%';
            segmentElement.style.left = (segment.start.currentWindow * 100) + '%';
        }
        getTrackElementId(trackId) {
            return 'timelineTrack_' + trackId;
        }
        getSegmentElementId(trackId, segmentId) {
            return 'timelineSegment_' + trackId + '_' + segmentId;
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
