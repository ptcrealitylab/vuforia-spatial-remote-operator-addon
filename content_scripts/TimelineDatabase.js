createNameSpace('realityEditor.videoPlayback');

(function (exports) {
    const TRACK_TYPES = Object.freeze({
        VIDEO_2D: 'VIDEO_2D',
        VIDEO_3D: 'VIDEO_3D',
        POSE: 'POSE',
        IOT: 'IOT'
    });
    exports.TRACK_TYPES = TRACK_TYPES;
    const DATA_PIECE_TYPES = Object.freeze({
        VIDEO_URL: 'VIDEO_URL',
        TIME_SERIES: 'TIME_SERIES'
    });
    exports.DATA_PIECE_TYPES = DATA_PIECE_TYPES;

    class TimelineDatabase {
        constructor() {
            this.tracks = {};
        }
        addTrack(track) {
            this.tracks[track.id] = track;
            // console.log('added ' + track.id + ' to database');
        }
        // applyDataView(start, end) {
        //     let filteredTracks = JSON.parse(JSON.stringify(this.tracks));
        //     // console.log(filteredTracks);
        //     return filteredTracks;
        // }
        getBounds() {
            let minStart = null;
            let maxEnd = null;
            for (const [_id, track] of Object.entries(this.tracks)) {
                let trackBounds = track.getBounds();
                if (minStart === null || trackBounds.start < minStart) {
                    minStart = trackBounds.start;
                }
                if (maxEnd === null || trackBounds.end > maxEnd) {
                    maxEnd = trackBounds.end;
                }
            }
            return {
                start: minStart,
                end: maxEnd
            };
        }
        getFilteredData(minTimestamp, maxTimestamp) {
            if (typeof minTimestamp !== 'number' || typeof maxTimestamp !== 'number') {
                return this.tracks;
            }

            let filteredDatabase = {
                tracks: {}
            };
            for (const [trackId, track] of Object.entries(this.tracks)) {
                let includeTrack = false;
                let segmentsToInclude = [];
                for (const [_segmentId, segment] of Object.entries(track.segments)) {
                    let includeSegment = segment.start >= minTimestamp && segment.end <= maxTimestamp;
                    if (includeSegment) {
                        includeTrack = true;
                        segmentsToInclude.push(segment);
                    }
                }

                if (includeTrack) {
                    filteredDatabase.tracks[trackId] = new DataTrack(trackId, track.type);
                    segmentsToInclude.forEach(segment => {
                        filteredDatabase.tracks[trackId].addSegment(segment);
                    });
                }
            }
            return filteredDatabase;
        }
    }

    class DataTrack {
        constructor(id, type) {
            this.id = id;
            if (typeof TRACK_TYPES[type] === 'undefined') {
                console.warn('trying to create an unknown track type');
            }
            this.type = type;
            this.segments = {};
        }
        addSegment(segment) {
            if (segment.type !== this.type) {
                console.warn('trying to add incompatible segment to track');
                return;
            }
            this.segments[segment.id] = segment;
            segment.trackId = this.id;
            // console.log('added ' + segment.id + ' to track ' + this.id);
        }
        getBounds() {
            // compute the min/max of segments' starts/ends
            let minStart = null;
            let maxEnd = null;
            for (const [_id, segment] of Object.entries(this.segments)) {
                if (minStart === null || segment.start < minStart) {
                    minStart = segment.start;
                }
                if (maxEnd === null || segment.end > maxEnd) {
                    maxEnd = segment.end;
                }
            }
            return {
                start: minStart,
                end: maxEnd
            };
        }
    }

    class DataSegment {
        constructor(id, type, start, end) {
            this.id = id;
            if (typeof TRACK_TYPES[type] === 'undefined') {
                console.warn('trying to create an unknown segment type');
            }
            this.type = type;
            this.start = start;
            this.end = end;
            this.dataPieces = {};
        }
        addDataPiece(dataPiece) {
            this.dataPieces[dataPiece.id] = dataPiece;
            dataPiece.segmentId = this.id;
            // console.log('added ' + dataPiece.id + ' to segment ' + this.id);
        }
        getTimestampAsPercent(timestamp) {
            return (timestamp - this.start) / (this.end - this.start);
        }
    }

    class DataPiece {
        constructor(id, type) {
            this.id = id;
            if (typeof DATA_PIECE_TYPES[type] === 'undefined') {
                console.warn('trying to create an unknown data piece type');
            }
            this.type = type;
        }
        setVideoUrl(url) {
            if (this.type !== DATA_PIECE_TYPES.VIDEO_URL) { return; }
            this.videoUrl = url;
        }
        setTimeSeriesData(data) {
            if (this.type !== DATA_PIECE_TYPES.TIME_SERIES) { return; }
            if (data.length > 0) {
                let valid = typeof data[0].data !== 'undefined' && typeof data[0].time !== 'undefined';
                if (!valid) {
                    console.warn('A TIME_SERIES DataPiece needs the format [{data: _, time: _}, ...]', data[0]);
                    return;
                }
            }
            this.timeSeriesData = data;
        }
        getClosestData(timestamp) {
            if (this.type !== DATA_PIECE_TYPES.TIME_SERIES) { return null; }
            // TODO: store newer and older so that in future we can have option to interpolate
            // let min_older_dt = Date.now();
            // let min_newer_dt = Date.now();
            let min_dt = Date.now(); // initialize with ~Infinity
            let closestEntry = null;
            this.timeSeriesData.forEach(entry => {
                let dt = timestamp - entry.time;
                if (Math.abs(dt) < min_dt) {
                    min_dt = Math.abs(dt);
                    closestEntry = entry;
                }
            });
            return closestEntry;
        }
        getDataAtIndex(index) {
            if (this.type !== DATA_PIECE_TYPES.TIME_SERIES) { return null; }

            let clampedIndex = Math.max(0, Math.min(this.timeSeriesData.length - 1, index));
            return this.timeSeriesData[clampedIndex].data;
        }
    }

    class DataView {
        constructor(database) {
            this.start = null;
            this.end = null;
            this.database = database;
            this.filteredDatabase = database;
        }
        processTimeBounds(start, end) {
            this.start = start;
            this.end = end;
            // filter the database, keeping only pointers to segments within the data range
            this.filteredDatabase = this.database.getFilteredData(start, end);
        }
        processTimestamp(timestamp) {
            if (!this.filteredDatabase) { return []; }
            let currentSegments = [];
            for (const [trackId, track] of Object.entries(this.filteredDatabase.tracks)) {
                for (const [segmentId, segment] of Object.entries(track.segments)) {
                    if (segment.start <= timestamp && segment.end >= timestamp) {
                        currentSegments.push(segment);
                    }
                }
            }
            return currentSegments;
        }
        // getTrack(trackId) {
        //     if (!this.filteredDatabase) { return null; }
        //     return this.filteredDatabase.tracks[trackId];
        // }
        // getSegment(trackId, segmentId) {
        //     let track = this.getTrack(trackId);
        //     if (!track) { return null; }
        //     return track.segments[segmentId];
        // }
    }

    exports.TimelineDatabase = TimelineDatabase;
    exports.DataTrack = DataTrack;
    exports.DataSegment = DataSegment;
    exports.DataPiece = DataPiece;
    exports.DataView = DataView;
})(realityEditor.videoPlayback);
