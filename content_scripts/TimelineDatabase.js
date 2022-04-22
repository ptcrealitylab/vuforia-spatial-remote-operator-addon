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
            console.log('added ' + track.id + ' to database');
        }
        applyDataView(start, end) {
            let filteredTracks = JSON.parse(JSON.stringify(this.tracks));
            console.log(filteredTracks);
            return filteredTracks;
        }
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
            console.log('added ' + segment.id + ' to track ' + this.id);
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
            console.log('added ' + dataPiece.id + ' to segment ' + this.id);
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
            this.timeSeriesData = data;
        }
    }

    class DataView {
        constructor(start, end) {
            this.start = start;
            this.end = end;
        }
    }

    exports.TimelineDatabase = TimelineDatabase;
    exports.DataTrack = DataTrack;
    exports.DataSegment = DataSegment;
    exports.DataPiece = DataPiece;
    exports.DataView = DataView;
})(realityEditor.videoPlayback);
