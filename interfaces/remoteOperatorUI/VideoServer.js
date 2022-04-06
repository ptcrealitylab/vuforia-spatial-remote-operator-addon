const fs = require('fs');
const path = require('path');
const ffmpegInterface = require('./ffmpegInterface');
const VideoFileManager = require('./VideoFileManager');
const VideoProcessManager = require('./VideoProcessManager');
const constants = require('./videoConstants');

// TODO: listen to when the ffmpeg process fully finishes writing data to disk, so that process can be killed/freed/etc

class VideoServer {
    constructor(outputPath) {
        // configurable constants
        this.outputPath = outputPath;

        VideoFileManager.initWithOutputPath(outputPath);
        VideoFileManager.buildPersistentInfo();
        VideoFileManager.savePersistentInfo();
        VideoProcessManager.setRecordingDoneCallback(this.onRecordingDone.bind(this));

        console.log('Created a VideoServer with path: ' + this.outputPath);

        // this.checkPersistentInfoIntegrity();

        Object.keys(VideoFileManager.persistentInfo).forEach(deviceId => {
            this.concatExisting(deviceId);
        });

        Object.keys(VideoFileManager.persistentInfo).forEach(deviceId => {
            this.evaluateAndRescaleVideosIfNeeded(deviceId, constants.RESCALE_VIDEOS);
        });
    }
    startRecording(deviceId) {
        VideoProcessManager.startRecording(deviceId);
    }
    stopRecording(deviceId) {
        VideoProcessManager.stopRecording(deviceId);
    }
    onConnection(deviceId) {
        VideoProcessManager.onConnection(deviceId);
    }
    onDisconnection(deviceId) {
        VideoProcessManager.onDisconnection(deviceId);
    }
    onFrame(rgb, depth, pose, deviceId) {
        VideoProcessManager.onFrame(rgb, depth, pose, deviceId);
    }
    onRecordingDone(deviceId, sessionId, lastChunkIndex) {
        setTimeout(() => { // wait for final video to finish processing
            if (!fs.existsSync(path.join(this.outputPath, deviceId, 'tmp'))) {
                fs.mkdirSync(path.join(this.outputPath, deviceId, 'tmp'));
            }
            let tmpOutputPath = path.join(this.outputPath, deviceId, 'tmp', sessionId + '_done_' + lastChunkIndex + '.json');
            fs.writeFileSync(tmpOutputPath, JSON.stringify({ success: true}));

            // process chunks
            this.evaluateAndRescaleVideosIfNeeded(deviceId, constants.RESCALE_VIDEOS);

            // try concatenating after a longer delay. if not all chunks have finished processing by then, ...
            // ... the chunk count won't match up and it will skip concatenating for now
            // it will also reattempt each time you restart the server.
            setTimeout(() => {
                console.log('try to concat rescaled videos upon disconnect');
                VideoFileManager.buildPersistentInfo(); // recompile persistent info so session metadata contains new chunks
                this.concatExisting(deviceId);
            }, 1000 * (lastChunkIndex + 1)); // delay 1 second per chunk we need to process, should give plenty of time
        }, 5000);
    }
    concatExisting(deviceId) {
        if (!fs.existsSync(path.join(this.outputPath, deviceId))) {
            console.log('concat, dir doesnt exist', path.join(this.outputPath, deviceId));
            return;
        }

        let tmpFiles = [];
        if (fs.existsSync(path.join(this.outputPath, deviceId, 'tmp'))) {
            tmpFiles = fs.readdirSync(path.join(this.outputPath, deviceId, 'tmp'));
            console.log(tmpFiles);
        }

        let sessions = VideoFileManager.persistentInfo[deviceId];
        Object.keys(sessions).forEach(sessionId => {
            let s = sessions[sessionId];
            if (s.color && s.depth && s.pose) { return; }
            if (s.processed_chunks && s.processed_chunks.length > 0) {
                let matchingFiles = tmpFiles.filter(filename => { return filename.includes(sessionId + '_done'); });
                let tmpFilename = matchingFiles.length > 0 ? matchingFiles[0] : null;
                if (tmpFilename) {
                    let numberOfChunks = parseInt(tmpFilename.match(/_\d+.json/)[0].match(/\d+/)[0]) + 1;
                    console.log(deviceId + ':' + sessionId + ' should have ' + numberOfChunks + ' chunks');
                    if (s.processed_chunks.length !== numberOfChunks && s.unprocessed_chunks.length === numberOfChunks) {
                        console.log('there are some unprocessed chunks not present in the processed chunks', s.processed_chunks.length, s.unprocessed_chunks.length);
                        return; // skip concatenating this session
                    }
                }

                console.log('time to concatenate!');

                if (!s.color) { s.color = this.concatFiles(deviceId, sessionId, constants.DIR_NAMES.color, s.processed_chunks); }
                if (!s.depth) { s.depth = this.concatFiles(deviceId, sessionId, constants.DIR_NAMES.depth, s.processed_chunks); }
                if (!s.pose) { s.pose = this.concatPosesIfNeeded(deviceId, sessionId); }
            }
        });

        console.log('UPDATED INFO:');
        console.log(VideoFileManager.persistentInfo);
        VideoFileManager.savePersistentInfo();
    }
    extractTimeInformation(fileList) { // TODO: we can probably just use the SEGMENT_LENGTH * fileList.length?
        let fileRecordingTimes = fileList.map(filename => parseInt(filename.match(/[0-9]{13,}/))); // extract timestamp
        let firstTimestamp = Math.min(...fileRecordingTimes) - constants.SEGMENT_LENGTH; // estimate, since this is at the end of the first video
        let lastTimestamp = Math.max(...fileRecordingTimes);
        return {
            start: firstTimestamp,
            end: lastTimestamp,
            duration: lastTimestamp - firstTimestamp
        };
    }
    concatFiles(deviceId, sessionId, colorOrDepth = constants.DIR_NAMES.color, files) {
        let fileText = '';
        for (let i = 0; i < files.length; i++) {
            fileText += 'file \'' + path.join(this.outputPath, deviceId, constants.DIR_NAMES.processed_chunks, colorOrDepth, files[i]) + '\'\n';
        }

        let timeInfo = this.extractTimeInformation(files);

        // write file list to txt file so it can be used by ffmpeg as input
        let txt_filename = colorOrDepth + '_filenames_' + sessionId + '.txt';
        if (!fs.existsSync(path.join(this.outputPath, deviceId, 'tmp'))) {
            fs.mkdirSync(path.join(this.outputPath, deviceId, 'tmp'));
        }
        let txtFilePath = path.join(this.outputPath, deviceId, 'tmp', txt_filename);
        if (fs.existsSync(txtFilePath)) {
            fs.unlinkSync(txtFilePath);
        }
        fs.writeFileSync(txtFilePath, fileText);

        let filetype = (colorOrDepth === constants.DIR_NAMES.depth) ? constants.DEPTH_FILETYPE : constants.COLOR_FILETYPE;
        let filename = 'device_' + deviceId + '_session_' + sessionId + '_start_' + timeInfo.start + '_end_' + timeInfo.end + '.' + filetype; // path.join(this.outputPath, output_name + '_' + timestamp + '.mp4');
        let outputPath = path.join(this.outputPath, deviceId, constants.DIR_NAMES.session_videos, colorOrDepth, filename);
        ffmpegInterface.ffmpeg_concat_mp4s(outputPath, txtFilePath);

        return filename;
    }
    concatPosesIfNeeded(deviceId, sessionId) {
        // check if output file exists for this device/session pair
        let filename = 'device_' + deviceId + '_session_' + sessionId + '.json'; // path.join(this.outputPath, output_name + '_' + timestamp + '.mp4');
        let outputPath = path.join(this.outputPath, deviceId, constants.DIR_NAMES.session_videos, 'pose', filename);
        if (fs.existsSync(outputPath)) {
            return filename; // already exists, return early
        }
        console.log('we still need to process poses for ' + deviceId + ' (session ' + sessionId + ')');
        // load all chunks
        let files = fs.readdirSync(path.join(this.outputPath, deviceId, constants.DIR_NAMES.unprocessed_chunks, 'pose'));
        files = files.filter(filename => {
            return filename.includes(sessionId);
        });
        console.log('unprocessed pose chunks: ', files);

        let poseData = [];
        files.forEach(filename => {
            let filePath = path.join(this.outputPath, deviceId, constants.DIR_NAMES.unprocessed_chunks, 'pose', filename);
            // poseData[filename] = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
            poseData.push(JSON.parse(fs.readFileSync(filePath, 'utf-8')));
        });
        let flattened = poseData.flat();
        fs.writeFileSync(outputPath, JSON.stringify(flattened));

        return filename;
    }
    pose2pgm(pose, width = 8, height = 8) { // conforms to http://netpbm.sourceforge.net/doc/pgm.html
        const CR = '\n';
        let header = 'P2'; // required
        header += CR; // add whitespace char
        header += width;
        header += CR; // add whitespace char
        header += height;
        header += CR; // add whitespace char
        for (let y = 0; y < height; y++) {
            for (let x = 0; x < width; x++) {
                let i = y * width + x;
                header += pose[i] + ' ';
            }
            header += CR;
        }
        return header;
    }
    evaluateAndRescaleVideosIfNeeded(deviceId, rescaleEnabled) {
        let unprocessedPath = path.join(this.outputPath, deviceId, constants.DIR_NAMES.unprocessed_chunks);
        let processedPath = path.join(this.outputPath, deviceId, constants.DIR_NAMES.processed_chunks);

        let fileMap = {
            color: {
                processed: VideoFileManager.getProcessedChunkFilePaths(deviceId, constants.DIR_NAMES.color),
                unprocessed: VideoFileManager.getUnprocessedChunkFilePaths(deviceId, constants.DIR_NAMES.color)
            },
            depth: {
                processed: VideoFileManager.getProcessedChunkFilePaths(deviceId, constants.DIR_NAMES.depth),
                unprocessed: VideoFileManager.getUnprocessedChunkFilePaths(deviceId, constants.DIR_NAMES.depth)
            }
        };

        Object.keys(fileMap).forEach(colorOrDepth => {
            let filesToScale = [];
            fileMap[colorOrDepth].unprocessed.forEach(filename => {
                let timestamp = filename.match(/[0-9]{13,}/);
                if (!fileMap[colorOrDepth].processed.some(resizedFilename => resizedFilename.includes(timestamp))) {
                    let colorFilename = filename.replace(/\.[^/.]+$/, '') + '.' + constants.COLOR_FILETYPE;
                    let depthFilename = filename.replace(/\.[^/.]+$/, '') + '.' + constants.DEPTH_FILETYPE;
                    let colorFilePath = path.join(unprocessedPath, constants.DIR_NAMES.color, colorFilename);
                    let depthFilePath = path.join(unprocessedPath, constants.DIR_NAMES.depth, depthFilename);
                    if (fs.existsSync(colorFilePath) && fs.existsSync(depthFilePath)) {
                        let byteSizeColor = fs.statSync(colorFilePath).size;
                        let byteSizeDepth = fs.statSync(depthFilePath).size;
                        if (byteSizeColor > 48 && byteSizeDepth > 48) {
                            filesToScale.push(filename);
                        } else {
                            console.log('skipping ' + filename + ' due to incomplete size');
                        }
                    }
                }
            });
            filesToScale.forEach(filename => {
                let inputPath = path.join(unprocessedPath, colorOrDepth, filename);
                let outputPath = path.join(processedPath, colorOrDepth, filename);
                if (rescaleEnabled) {
                    ffmpegInterface.ffmpeg_adjust_length(outputPath, inputPath, constants.SEGMENT_LENGTH / 1000);
                } else {
                    fs.copyFileSync(inputPath, outputPath, fs.constants.COPYFILE_EXCL);
                }
            });
        });
    }
    /**
     * Generates a random 8 character unique identifier using uppercase, lowercase, and numbers (e.g. "jzY3y338")
     * @return {string}
     */
    uuidTimeShort() {
        var dateUuidTime = new Date();
        var abcUuidTime = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
        var stampUuidTime = parseInt('' + dateUuidTime.getMilliseconds() + dateUuidTime.getMinutes() + dateUuidTime.getHours() + dateUuidTime.getDay()).toString(36);
        while (stampUuidTime.length < 8) stampUuidTime = abcUuidTime.charAt(Math.floor(Math.random() * abcUuidTime.length)) + stampUuidTime;
        return stampUuidTime;
    }
}

module.exports = VideoServer;
