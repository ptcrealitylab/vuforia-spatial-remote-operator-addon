const fs = require('fs');
const path = require('path');

class VideoFileManager {
    constructor(outputPath, colorFiletype, depthFiletype) {
        this.outputPath = outputPath;
        this.DIR_NAMES = Object.freeze({
            unprocessed_chunks: 'unprocessed_chunks',
            processed_chunks: 'processed_chunks',
            session_videos: 'session_videos',
            color: 'color',
            depth: 'depth',
            pose: 'pose'
        });
        this.COLOR_FILETYPE = colorFiletype;
        this.DEPTH_FILETYPE = depthFiletype;
        this.mkdirIfNeeded(this.outputPath, true);
        this.persistentInfo = this.buildPersistentInfo();
        this.savePersistentInfo();

        console.log('BUILT PERSISTENT INFO:');
        console.log(this.persistentInfo);

        // TODO: do this in videoserver?
        // Object.keys(this.persistentInfo).forEach(deviceId => {
        //     this.concatExisting(deviceId);
        // });
        // TODO: do this in videoserver?
        // Object.keys(this.persistentInfo).forEach(deviceId => {
        //     this.evaluateAndRescaleVideosIfNeeded(deviceId, this.RESCALE_VIDEOS);
        // });
    }
    mkdirIfNeeded(path, recursive) {
        let options = recursive ? { recursive: true } : undefined;
        if (!fs.existsSync(path)) {
            fs.mkdirSync(path, options);
            console.log('VideoFileManager created directory: ' + path);
        }
    }
    buildPersistentInfo() {
        let info = {};
        // each folder in this.outputPath is a device
        // check that folder's session_videos, processed_chunks, and unprocessed_chunks to determine how many sessions there are and what state they're in
        fs.readdirSync(this.outputPath).filter((filename) => {
            let isHidden = filename[0] === '.';
            return fs.statSync(path.join(this.outputPath, filename)).isDirectory() && !isHidden;
        }).forEach(deviceDirName => {
            info[deviceDirName] = this.parseDeviceDirectory(path.join(this.outputPath, deviceDirName));
        });
        return info;
    }
    savePersistentInfo() {
        let jsonPath = path.join(this.outputPath, 'videoInfo.json');
        fs.writeFileSync(jsonPath, JSON.stringify(this.persistentInfo, null, 4));
        console.log('saved videoInfo');
    }
    createMissingDirs(devicePath) {
        this.mkdirIfNeeded(devicePath);
        let dir = this.DIR_NAMES;

        let sessionVideosPath = path.join(devicePath, dir.session_videos);
        let unprocessedChunksPath = path.join(devicePath, dir.unprocessed_chunks);
        let processedChunksPath = path.join(devicePath, dir.processed_chunks);

        [dir.color, dir.depth, dir.pose].forEach(name => {
            this.mkdirIfNeeded(path.join(sessionVideosPath, name), true);
            this.mkdirIfNeeded(path.join(unprocessedChunksPath, name), true);
            this.mkdirIfNeeded(path.join(processedChunksPath, name), true);
        });
    }
    parseDeviceDirectory(devicePath) {
        let info = {};

        this.createMissingDirs(devicePath);

        let sessionVideosPath = path.join(devicePath, this.DIR_NAMES.session_videos);
        let unprocessedChunksPath = path.join(devicePath, this.DIR_NAMES.unprocessed_chunks);
        let processedChunksPath = path.join(devicePath, this.DIR_NAMES.processed_chunks);

        // add color and depth videos
        fs.readdirSync(path.join(sessionVideosPath, 'color')).forEach(filepath => {
            let sessionId = this.getSessionIdFromFilename(filepath, 'session_');
            if (sessionId && sessionId.length === 8) {
                if (typeof info[sessionId] === 'undefined') {
                    info[sessionId] = {};
                }
                info[sessionId].color = filepath;
                if (fs.existsSync(path.join(sessionVideosPath, 'depth', filepath))) {
                    info[sessionId].depth = filepath;
                }
            }
        });
        // append pose data separately from logic for color, since pose may be available before color & depth
        fs.readdirSync(path.join(sessionVideosPath, 'pose')).forEach(filepath => {
            let sessionId = this.getSessionIdFromFilename(filepath, 'session_');
            if (sessionId && sessionId.length === 8) {
                if (typeof info[sessionId] === 'undefined') {
                    info[sessionId] = {};
                }
                info[sessionId].pose = filepath;
            }
        });

        // add an array of processed chunk files
        fs.readdirSync(path.join(processedChunksPath, 'color')).forEach(filepath => {
            let sessionId = this.getSessionIdFromFilename(filepath, 'chunk_');
            if (sessionId && sessionId.length === 8) {
                if (typeof info[sessionId] === 'undefined') {
                    info[sessionId] = {};
                }
                if (typeof info[sessionId].processed_chunks === 'undefined') {
                    info[sessionId].processed_chunks = [];
                }
                if (fs.existsSync(path.join(processedChunksPath, 'depth', filepath))) {
                    info[sessionId].processed_chunks.push(filepath);
                }
            }
        });

        // add an array of unprocessed chunk files
        fs.readdirSync(path.join(unprocessedChunksPath, 'color')).forEach(filepath => {
            let sessionId = this.getSessionIdFromFilename(filepath, 'chunk_');
            if (sessionId && sessionId.length === 8) {
                if (typeof info[sessionId] === 'undefined') {
                    info[sessionId] = {};
                }
                if (typeof info[sessionId].unprocessed_chunks === 'undefined') {
                    info[sessionId].unprocessed_chunks = [];
                }
                if (fs.existsSync(path.join(unprocessedChunksPath, 'depth', filepath))) {
                    // TODO: also check that matching pose json file exists
                    info[sessionId].unprocessed_chunks.push(filepath);
                }
            }
        });

        return info;
    }
    getSessionIdFromFilename(filename, prefix) {
        let re = new RegExp(prefix + '[a-zA-Z0-9]{8}');
        let matches = filename.match(re);
        if (!matches || matches.length === 0) { return null; }
        return (prefix ? matches[0].replace(prefix, '') : matches[0]);
    }
    getUnprocessedChunkFilePaths(deviceId, colorOrDepth = 'color') {
        let unprocessedPath = path.join(this.outputPath, deviceId, this.DIR_NAMES.unprocessed_chunks, colorOrDepth);
        if (!fs.existsSync(unprocessedPath)) {
            fs.mkdirSync(unprocessedPath, { recursive: true });
        }
        let filetype = '.' + ((colorOrDepth === 'depth') ? this.DEPTH_FILETYPE : this.COLOR_FILETYPE);
        return fs.readdirSync(unprocessedPath).filter(filename => filename.includes(filetype));
    }
    getProcessedChunkFilePaths(deviceId, colorOrDepth = 'color') {
        let processedPath = path.join(this.outputPath, deviceId, this.DIR_NAMES.processed_chunks, colorOrDepth);
        if (!fs.existsSync(processedPath)) {
            fs.mkdirSync(processedPath, { recursive: true });
        }
        let filetype = '.' + ((colorOrDepth === 'depth') ? this.DEPTH_FILETYPE : this.COLOR_FILETYPE);
        return fs.readdirSync(processedPath).filter(filename => filename.includes(filetype));
    }
    getSessionFilePaths(deviceId, colorOrDepth = 'color') {
        let sessionPath = path.join(this.outputPath, deviceId, this.DIR_NAMES.session_videos, colorOrDepth);
        if (!fs.existsSync(sessionPath)) {
            fs.mkdirSync(sessionPath, { recursive: true });
        }
        let filetype = '.' + ((colorOrDepth === 'depth') ? this.DEPTH_FILETYPE : this.COLOR_FILETYPE);
        return fs.readdirSync(sessionPath).filter(filename => filename.includes(filetype));
    }
}

module.exports = VideoFileManager;
