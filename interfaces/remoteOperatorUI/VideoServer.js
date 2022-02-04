const fs = require('fs');
const path = require('path');
const cp = require('child_process');
const VideoLib = require('node-video-lib');
const ffmpeg = require('@ffmpeg-installer/ffmpeg');
const ffmpegPath = require('@ffmpeg-installer/ffmpeg').path;

console.log('FFMPEG installer:', ffmpeg.path, ffmpeg.version);

// TODO: write pose matrices so they can be cross-referenced with the video stream
// TODO: listen to when the ffmpeg process fully finishes writing data to disk, so that process can be killed/freed/etc

class VideoServer {
    constructor(outputPath) {
        // configurable constants
        this.SEGMENT_LENGTH = 15000;
        this.RESCALE_VIDEOS = false; // disable to prevent lossy transformation
        this.DEBUG_WRITE_IMAGES = true;

        this.outputPath = outputPath;
        this.PROCESS = Object.freeze({
            COLOR: 'COLOR',
            DEPTH: 'DEPTH',
            POSE: 'POSE'
        });
        this.STATUS = Object.freeze({
            NOT_STARTED: 'NOT_STARTED',
            STARTED: 'STARTED',
            ENDING: 'ENDING',
            ENDED: 'ENDED'
        });
        this.DIR_NAMES = Object.freeze({
            unprocessed_chunks: 'unprocessed_chunks',
            processed_chunks: 'processed_chunks',
            session_videos: 'session_videos'
        });
        this.processes = {};
        this.processStatuses = {};
        this.poses = {};
        this.isRecording = {}; // boolean for each deviceId
        this.anythingReceived = {}; // boolean for each deviceId
        this.sessionId = this.uuidTimeShort(); // each time the server restarts, tag videos from this instance with a unique ID

        this.COLOR_FILETYPE = 'mp4';
        this.DEPTH_FILETYPE = 'webm';

        if (!fs.existsSync(this.outputPath)) {
            fs.mkdirSync(this.outputPath, {recursive: true});
            console.log('Created directory for VideoServer outputPath: ' + this.outputPath);
        }

        console.log('Created a VideoServer with path: ' + this.outputPath);

        this.persistentInfo = this.loadPersistentInfo();
        this.checkPersistentInfoIntegrity(); // TODO: reimplement this with new file structure

        Object.keys(this.persistentInfo).forEach(deviceId => {
            this.concatExisting(deviceId);
        });

        Object.keys(this.persistentInfo).forEach(deviceId => {
            this.evaluateAndRescaleVideosIfNeeded(deviceId, this.RESCALE_VIDEOS);
        });
    }
    loadPersistentInfo() {
        let jsonPath = path.join(this.outputPath, 'videoInfo.json');
        let defaultInfo = {};
        if (!fs.existsSync(jsonPath)) {
            fs.writeFileSync(jsonPath, JSON.stringify(defaultInfo, null, 4));
            return defaultInfo;
        } else {
            return JSON.parse(fs.readFileSync(jsonPath, { encoding: 'utf8', flag: 'r' }));
        }
    }
    checkPersistentInfoIntegrity() {
        // ensure that none of the concatenated video files listed in the json file have been deleted
        let deletedVideos = [];
        let anyChanges = false;

        Object.keys(this.persistentInfo).forEach(deviceId => {
            Object.keys(this.persistentInfo[deviceId]).forEach(sessionId => {
                let session = this.persistentInfo[deviceId][sessionId];
                let videos = [session.finalColorVideo, session.finalDepthVideo];
                videos.forEach(videoInfo => {
                    if (videoInfo && videoInfo.filePath && !fs.existsSync(videoInfo.filePath)) {
                        // if its chunks were also deleted, then delete this, otherwise recover it
                        let colorOrDepth = (videoInfo.filePath.includes('color')) ? 'color' : 'depth';
                        let anyChunkMissing = false;
                        if (!videoInfo.colorChunks) {
                            anyChunkMissing = true;
                        } else {
                            anyChunkMissing = videoInfo.colorChunks.some(filename => {
                                return !fs.existsSync(path.join(this.outputPath, deviceId, this.DIR_NAMES.unprocessed_chunks, colorOrDepth, filename));
                            });
                        }
                        if (anyChunkMissing) {
                            deletedVideos.push({
                                deviceId: deviceId,
                                sessionId: sessionId,
                                videoPath: videoInfo.filePath
                            });
                            anyChanges = true;
                            console.log('video file (and chunks) was deleted: ' + videoInfo.filePath);
                        }
                    }
                });
            });
        });

        deletedVideos.forEach(deletionInfo => {
            delete this.persistentInfo[deletionInfo.deviceId][deletionInfo.sessionId];
        });

        Object.keys(this.persistentInfo).forEach(deviceId => {
            if (Object.keys(this.persistentInfo[deviceId]).length === 0) {
                delete this.persistentInfo[deviceId];
                anyChanges = true;
            }
        });

        if (anyChanges) { this.savePersistentInfo(); }
    }
    concatExisting(deviceId) {
        if (!fs.existsSync(path.join(this.outputPath, deviceId))) {
            console.log('concat, dir doesnt exist', path.join(this.outputPath, deviceId));
            return;
        }

        let sessions = {}; // extract list of session uuids from chunk filenames

        let colorChunks = this.getProcessedChunkFilePaths(deviceId, 'color');
        let depthChunks = this.getProcessedChunkFilePaths(deviceId, 'depth');
        let colorSessions = this.getSessionFilePaths(deviceId, 'color');
        let depthSessions = this.getSessionFilePaths(deviceId, 'depth');

        colorChunks.forEach(filepath => { // e.g. chunk_Dw7jlxox_1643398707456.mp4 -> Dw7jlxox
            let sessionId = filepath.match(/chunk_[a-zA-Z0-9]{8}/)[0].replace('chunk_', '');
            if (typeof sessions[sessionId] === 'undefined') {
                sessions[sessionId] = {
                    colorChunks: [],
                    depthChunks: [],
                    finalColorVideo: null,
                    finalDepthVideo: null
                };
            }
            sessions[sessionId].colorChunks.push(filepath);
            sessions[sessionId].chunkLength = this.SEGMENT_LENGTH;
        });

        depthChunks.forEach(filepath => {
            let sessionId = filepath.match(/chunk_[a-zA-Z0-9]{8}/)[0].replace('chunk_', '');
            if (typeof sessions[sessionId] === 'undefined') {
                sessions[sessionId] = {
                    colorChunks: [],
                    depthChunks: [],
                    finalColorVideo: null,
                    finalDepthVideo: null
                };
            }
            sessions[sessionId].depthChunks.push(filepath);
            sessions[sessionId].chunkLength = this.SEGMENT_LENGTH;
        });

        colorSessions.forEach(filepath => {
            let sessionId = filepath.match(/session_[a-zA-Z0-9]{8}/)[0].replace('session_', '');
            if (typeof sessions[sessionId] === 'undefined') {
                sessions[sessionId] = {
                    colorChunks: [],
                    depthChunks: [],
                    finalColorVideo: null,
                    finalDepthVideo: null
                };
                sessions[sessionId].finalColorVideo = {
                    filePath: filepath,
                    timeInfo: null
                };
            }
        });

        depthSessions.forEach(filepath => {
            let sessionId = filepath.match(/session_[a-zA-Z0-9]{8}/)[0].replace('session_', '');
            if (typeof sessions[sessionId] === 'undefined') {
                sessions[sessionId] = {
                    colorChunks: [],
                    depthChunks: [],
                    finalColorVideo: null,
                    finalDepthVideo: null
                };
                sessions[sessionId].finalDepthVideo = {
                    filePath: filepath,
                    timeInfo: null
                };
            }
        });

        console.log('parsed sessions for ' + deviceId + ':', sessions);

        let anyChanges = false;

        Object.keys(sessions).forEach(sessionId => {
            if (sessions[sessionId].finalColorVideo && sessions[sessionId].finalDepthVideo
                && sessions[sessionId].finalColorVideo.timeInfo && sessions[sessionId].finalDepthVideo.timeInfo) { return; }

            let thisSession = sessions[sessionId];
            if (!thisSession.finalColorVideo && thisSession.colorChunks.length > 0) {
                let outputFilePath = this.concatFiles(deviceId, sessionId, 'color', thisSession.colorChunks);
                let timeInfo = this.extractTimeInformation(thisSession.colorChunks);
                console.log('merged color chunks, got time info', outputFilePath, timeInfo);
                thisSession.finalColorVideo = {
                    filePath: outputFilePath,
                    timeInfo: timeInfo
                };
                anyChanges = true;
            }

            if (!thisSession.finalDepthVideo && thisSession.depthChunks.length > 0) {
                let outputFilePath = this.concatFiles(deviceId, sessionId, 'depth', thisSession.depthChunks);
                let timeInfo = this.extractTimeInformation(thisSession.depthChunks);
                console.log('merged depth chunks, got time info', outputFilePath, timeInfo);
                thisSession.finalDepthVideo = {
                    filePath: outputFilePath,
                    timeInfo: timeInfo
                };
                anyChanges = true;
            }
        });

        this.persistentInfo[deviceId] = sessions;

        if (anyChanges) {
            console.log('new videos were concatenated');
            this.savePersistentInfo();
        } else {
            console.log('no new videos needed to be concatenated');
        }

        console.log(this.persistentInfo);
    }
    extractTimeInformation(fileList) { // TODO: we can probably just use the SEGMENT_LENGTH * fileList.length?
        let fileRecordingTimes = fileList.map(filename => parseInt(filename.match(/[0-9]{13,}/))); // extract timestamp
        let firstTimestamp = Math.min(...fileRecordingTimes) - this.SEGMENT_LENGTH; // estimate, since this is at the end of the first video
        let lastTimestamp = Math.max(...fileRecordingTimes);
        return {
            start: firstTimestamp,
            end: lastTimestamp,
            duration: lastTimestamp - firstTimestamp
        };
    }
    savePersistentInfo() {
        let jsonPath = path.join(this.outputPath, 'videoInfo.json');
        fs.writeFileSync(jsonPath, JSON.stringify(this.persistentInfo, null, 4));
        console.log('saved videoInfo');
    }
    concatFiles(deviceId, sessionId, colorOrDepth = 'color', files) {
        this.concatPosesIfNeeded(deviceId, sessionId);

        let fileText = '';
        for (let i = 0; i < files.length; i++) {
            fileText += 'file \'' + path.join(this.outputPath, deviceId, this.DIR_NAMES.processed_chunks, colorOrDepth, files[i]) + '\'\n';
        }

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

        let filetype = (colorOrDepth === 'depth') ? this.DEPTH_FILETYPE : this.COLOR_FILETYPE;
        let filename = 'device_' + deviceId + '_session_' + sessionId + '.' + filetype; // path.join(this.outputPath, output_name + '_' + timestamp + '.mp4');
        let outputPath = path.join(this.outputPath, deviceId, this.DIR_NAMES.session_videos, colorOrDepth, filename);
        this.ffmpeg_concat_mp4s(outputPath, txtFilePath);
        return outputPath;
    }
    concatPosesIfNeeded(deviceId, sessionId) {
        // check if output file exists for this device/session pair
        let filename = 'device_' + deviceId + '_session_' + sessionId + '.json'; // path.join(this.outputPath, output_name + '_' + timestamp + '.mp4');
        let outputPath = path.join(this.outputPath, deviceId, this.DIR_NAMES.session_videos, 'pose', filename);
        if (fs.existsSync(outputPath)) {
            return;
        }
        console.log('we still need to process poses for ' + deviceId + ' (session ' + sessionId + ')');
        // load all chunks
        let files = fs.readdirSync(path.join(this.outputPath, deviceId, this.DIR_NAMES.unprocessed_chunks, 'pose'));
        console.log(files);
        files = files.filter(filename => {
            return filename.includes(sessionId);
        });
        console.log('unprocessed pose chunks: ', files);

        let poseData = [];
        files.forEach(filename => {
            let filePath = path.join(this.outputPath, deviceId, this.DIR_NAMES.unprocessed_chunks, 'pose', filename);
            // poseData[filename] = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
            poseData.push(JSON.parse(fs.readFileSync(filePath, 'utf-8')));
        });
        let flattened = poseData.flat();
        console.log(flattened);
        fs.writeFileSync(outputPath, JSON.stringify(flattened));
    }
    startRecording(deviceId) {
        this.isRecording[deviceId] = true;
        this.processes[deviceId] = {};
        this.processStatuses[deviceId] = {};

        if (!fs.existsSync(path.join(this.outputPath, deviceId))) {
            fs.mkdirSync(path.join(this.outputPath, deviceId, this.DIR_NAMES.unprocessed_chunks, 'color'), { recursive: true });
            fs.mkdirSync(path.join(this.outputPath, deviceId, this.DIR_NAMES.unprocessed_chunks, 'depth'), { recursive: true });
            fs.mkdirSync(path.join(this.outputPath, deviceId, this.DIR_NAMES.unprocessed_chunks, 'pose'), { recursive: true });
            fs.mkdirSync(path.join(this.outputPath, deviceId, this.DIR_NAMES.processed_chunks, 'color'), { recursive: true });
            fs.mkdirSync(path.join(this.outputPath, deviceId, this.DIR_NAMES.processed_chunks, 'depth'), { recursive: true });
            fs.mkdirSync(path.join(this.outputPath, deviceId, this.DIR_NAMES.processed_chunks, 'pose'), { recursive: true });
            fs.mkdirSync(path.join(this.outputPath, deviceId, this.DIR_NAMES.session_videos, 'color'), { recursive: true });
            fs.mkdirSync(path.join(this.outputPath, deviceId, this.DIR_NAMES.session_videos, 'depth'), { recursive: true });
            fs.mkdirSync(path.join(this.outputPath, deviceId, this.DIR_NAMES.session_videos, 'pose'), { recursive: true });
        }

        if (typeof this.persistentInfo[deviceId] === 'undefined') {
            this.persistentInfo[deviceId] = {
                mergedFiles: {
                    color: {},
                    depth: {}
                }
            };
            this.savePersistentInfo();
        }

        // start color stream process
        // depth images are 1920x1080 lossy JPG images
        let chunkTimestamp = Date.now();
        let colorOutputPath = path.join(this.outputPath, deviceId, this.DIR_NAMES.unprocessed_chunks, 'color', 'chunk_' + this.sessionId + '_' + chunkTimestamp + '.' + this.COLOR_FILETYPE);
        this.processes[deviceId][this.PROCESS.COLOR] = this.ffmpeg_image2mp4(colorOutputPath, 10, 'mjpeg', 1920, 1080, 25, 0.5);
        if (this.processes[deviceId][this.PROCESS.COLOR]) {
            this.processStatuses[deviceId][this.PROCESS.COLOR] = this.STATUS.STARTED;
        }

        // start depth stream process
        // depth images are 256x144 lossless PNG buffers
        let depthOutputPath = path.join(this.outputPath, deviceId, this.DIR_NAMES.unprocessed_chunks, 'depth', 'chunk_' + this.sessionId + '_' + chunkTimestamp + '.' + this.DEPTH_FILETYPE);
        this.processes[deviceId][this.PROCESS.DEPTH] = this.ffmpeg_image2losslessVideo(depthOutputPath, 10, 'png', 256, 144);

        // this.processes[deviceId][this.PROCESS.DEPTH] = this.ffmpeg_image2mp4(depthOutputPath, 10, 'png', 256, 144, 0, 1);
        if (this.processes[deviceId][this.PROCESS.DEPTH]) {
            this.processStatuses[deviceId][this.PROCESS.DEPTH] = this.STATUS.STARTED;
        }

        // start pose stream process
        // depth images are 8x8 lossless PNG buffers
        // let poseOutputPath = path.join(this.outputPath, deviceId, this.DIR_NAMES.unprocessed_chunks, 'pose', 'chunk_' + this.sessionId + '_' + chunkTimestamp + '.mp4');
        // this.processes[deviceId][this.PROCESS.POSE] = this.ffmpeg_image2mp4(poseOutputPath, 10, 'pgm', 8, 8, 0, 1);
        // if (this.processes[deviceId][this.PROCESS.POSE]) {
        //     this.processStatuses[deviceId][this.PROCESS.POSE] = this.STATUS.STARTED;
        // }

        this.processStatuses[deviceId][this.PROCESS.POSE] = this.STATUS.STARTED;
        this.poses[deviceId] = [];

        setTimeout(function() {
            this.stopRecording(deviceId);
            setTimeout(function() {
                this.startRecording(deviceId);
            }.bind(this), 100);
        }.bind(this), this.SEGMENT_LENGTH);
    }
    stopRecording(deviceId) {
        this.isRecording[deviceId] = false;

        let colorProcess = this.processes[deviceId][this.PROCESS.COLOR];
        let depthProcess = this.processes[deviceId][this.PROCESS.DEPTH];
        // let poseProcess = this.processes[deviceId][this.PROCESS.POSE];
        let colorStatus = this.processStatuses[deviceId][this.PROCESS.COLOR];
        let depthStatus = this.processStatuses[deviceId][this.PROCESS.DEPTH];
        let poseStatus = this.processStatuses[deviceId][this.PROCESS.POSE];

        if (colorProcess !== 'undefined' && colorStatus === this.STATUS.STARTED) {
            console.log('end color process');
            colorProcess.stdin.setEncoding('utf8');
            colorProcess.stdin.write('q');
            colorProcess.stdin.end();
            colorStatus = this.STATUS.ENDING;
        }

        if (depthProcess !== 'undefined' && depthStatus === this.STATUS.STARTED) {
            console.log('end depth process');
            depthProcess.stdin.setEncoding('utf8');
            depthProcess.stdin.write('q');
            depthProcess.stdin.end();
            depthStatus = this.STATUS.ENDING;

            let poseOutputPath = path.join(this.outputPath, deviceId, this.DIR_NAMES.unprocessed_chunks, 'pose', 'chunk_' + this.sessionId + '_' + Date.now() + '.json');
            fs.writeFileSync(poseOutputPath, JSON.stringify(this.poses[deviceId]));
            this.poses[deviceId] = [];
        }

        if (/*poseProcess !== 'undefined' &&*/ poseStatus === this.STATUS.STARTED) {
            console.log('end pose process');
            // poseProcess.stdin.setEncoding('utf8');
            // poseProcess.stdin.write('q');
            // poseProcess.stdin.end();
            poseStatus = this.STATUS.ENDING;
        }
    }
    onFrame(rgb, depth, pose, deviceId) {
        if (!this.anythingReceived[deviceId]) {
            this.startRecording(deviceId); // start recording the first time it receives a data packet
            this.anythingReceived[deviceId] = true;
        }
        if (!this.isRecording[deviceId]) {
            return;
        }

        let colorProcess = this.processes[deviceId][this.PROCESS.COLOR];
        let depthProcess = this.processes[deviceId][this.PROCESS.DEPTH];
        // let poseProcess = this.processes[deviceId][this.PROCESS.POSE];
        let colorStatus = this.processStatuses[deviceId][this.PROCESS.COLOR];
        let depthStatus = this.processStatuses[deviceId][this.PROCESS.DEPTH];
        let poseStatus = this.processStatuses[deviceId][this.PROCESS.POSE];

        if (typeof colorProcess !== 'undefined' && colorStatus === 'STARTED') {
            colorProcess.stdin.write(rgb);
        }

        if (typeof depthProcess !== 'undefined' && depthStatus === 'STARTED') {
            depthProcess.stdin.write(depth);
        }

        // if (typeof poseProcess !== 'undefined' && poseStatus === 'STARTED') {
        //     // poseProcess.stdin.write(pose);
        //     // http://netpbm.sourceforge.net/doc/pgm.html
        //     // let posePGM = this.pose2pgm(pose, 8, 8);
        //     // let posePGM = this.pose2pgm(pose, 8, 8);
        //     // poseProcess.stdin.write(posePGM);
        // }

        if (typeof this.poses[deviceId] !== 'undefined' && poseStatus === 'STARTED') {
            // console.log('pose', pose);
            // let matrix = new Float32Array(pose.buffer);
            // console.log(matrix);

            this.poses[deviceId].push({
                pose: pose.toString('base64'),
                time: Date.now()
            });
        }

        if (this.DEBUG_WRITE_IMAGES) {
            let colorFilename = 'color_' + Date.now() + '.png'; // + Math.floor(Math.random() * 1000)
            let depthFilename = 'depth_' + Date.now() + '.png';
            let poseFilename = 'pose_' + Date.now() + '.png'; //'.pgm';
            let imageDir = path.join(this.outputPath, deviceId, 'debug_images');
            if (!fs.existsSync(imageDir)) {
                fs.mkdirSync(imageDir, { recursive: true });
            }
            // let matrixFilename = 'matrix_' + Date.now() + '.png';
            fs.writeFile(path.join(imageDir, colorFilename), rgb, function() {
                // console.log('wrote color image');
            });

            fs.writeFile(path.join(imageDir, depthFilename), depth, function() {
                // console.log('wrote depth image');
            });

            fs.writeFile(path.join(imageDir, poseFilename), this.pose2pgm(pose, 8, 8), function() {
                // console.log('wrote pose.pgm');
            });

            // fs.writeFile(path.join(__dirname, 'images', 'matrix', matrixFilename), pose, function() {
            //     // console.log('wrote matrix image');
            // });
        }

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
    ffmpeg_adjust_length(output_path, input_path, newDuration) {
        let filesize = fs.statSync(input_path);
        console.log(filesize.size + ' bytes');
        if (filesize.size <= 48) {
            console.warn('corrupted video has ~0 bytes, cant resize: ' + input_path);
            return;
        }
        fs.open(input_path, 'r', function(err, fd) {
            try {
                // let movie = VideoLib.MovieParser.parse(fd);
                // Work with movie
                // console.log('Duration:', movie.relativeDuration());

                // getVideoDurationInSeconds(input_path).then((duration) => {
                // console.log('old duration = ' + duration);

                let movieDuration = 10;

                console.log('change duration:', output_path, input_path, newDuration);
                let args = [
                    // '-f', filetype,
                    '-i', input_path,
                    '-filter:v', 'setpts=' + newDuration / movieDuration /*movie.relativeDuration()*/ + '*PTS',
                    output_path
                ];
                let process = cp.spawn(ffmpegPath, args);
                process.stderr.setEncoding('utf8');
                process.stderr.on('data', function(data) {
                    console.log('stderr data', data);
                });
                console.log('new file: ' + output_path);
                return output_path;
                // });
            } catch (ex) {
                console.error('Video Error: ' + input_path, ex);
            } finally {
                fs.closeSync(fd);
            }
        }.bind(this));
    }
    ffmpeg_concat_mp4s(output_path, file_list_path) {
        // ffmpeg -f concat -safe 0 -i fileList.txt -c copy mergedVideo.mp4
        // we pass in a timestamp so we can use an identical one in the color and depth videos that match up
        let args = [
            '-f', 'concat',
            '-safe', '0',
            '-i', file_list_path,
            '-c', 'copy',
            output_path
        ];

        cp.spawn(ffmpegPath, args);
    }
    ffmpeg_image2mp4(output_path, framerate = 10, input_vcodec = 'mjpeg', input_width = 1920, input_height = 1080, crf = 25, output_scale = 0.25) {
        // let filePath = path.join(this.outputPath, output_name + '_' + Date.now() + '.mp4');

        let outputWidth = input_width * output_scale;
        let outputHeight = input_height * output_scale;

        let args = [
            '-r', framerate,
            // '-framerate', framerate,
            // '-probesize', '5000',
            // '-analyzeduration', '5000',
            '-f', 'image2pipe',
            '-vcodec', input_vcodec,
            '-s', input_width + 'x' + input_height,
            '-i', '-',
            '-vcodec', 'libx264',
            '-crf', crf,
            '-pix_fmt', 'yuv420p',
            '-vf', 'scale=' + outputWidth + ':' + outputHeight + ', setsar=1:1', //, realtime, fps=' + framerate,
            // '-preset', 'ultrafast',
            // '-copyts',
            // '-tune', 'zerolatency',
            // '-r', framerate, // will duplicate frames to meet this but still look like the framerate set before -i,
            output_path
        ];

        let process = cp.spawn(ffmpegPath, args);

        // process.stdout.on('data', function(data) {
        //     console.log('stdout data', data);
        // });
        process.stderr.setEncoding('utf8');
        process.stderr.on('data', function(data) {
            console.log('stderr data', data);
        });
        // process.on('close', function() {
        //     console.log('finished');
        // });

        return process;
    }
    ffmpeg_image2losslessVideo(output_path, framerate = 10, input_vcodec = 'png', input_width = 256, input_height = 144) {
        // let outputWidth = input_width;
        // let outputHeight = input_height;

        // ffmpeg -i video.avi -c:v libx265 \
        //         -x265-params "profile=monochrome12:crf=0:lossless=1:preset=veryslow:qp=0" \
        //         video.mkv

        let args = [
            '-r', framerate,
            '-f', 'image2pipe',
            '-vcodec', input_vcodec,
            '-pix_fmt', 'argb',
            '-s', input_width + 'x' + input_height,
            '-i', '-',
            // '-vcodec', 'libx265',
            '-vcodec', 'libvpx-vp9',
            '-lossless', '1',
            // '-x265-params', 'lossless=1',
            // '-pix_fmt', 'yuv420p',
            '-pix_fmt', 'argb',
            // '-vf', 'scale=' + outputWidth + ':' + outputHeight + ', setsar=1:1', //, realtime, fps=' + framerate,
            // '-preset', 'ultrafast',
            // '-copyts',
            // '-tune', 'zerolatency',
            // '-r', framerate, // will duplicate frames to meet this but still look like the framerate set before -i,
            output_path
        ];

        // not working with MP4 ... works losslessly with .MKV but not playable in HTML video element
        // let args = [
        //     '-r', framerate,
        //     '-f', 'image2pipe',
        //     '-vcodec', input_vcodec,
        //     '-s', input_width + 'x' + input_height,
        //     '-i', '-',
        //     '-vcodec', 'libx265',
        //     '-x265-params', 'crf=0:lossless=1:preset=veryslow:qp=0',
        //     // '-pix_fmt', 'yuv420p',
        //     // '-vf', 'scale=' + outputWidth + ':' + outputHeight + ', setsar=1:1', //, realtime, fps=' + framerate,
        //     // '-preset', 'ultrafast',
        //     // '-copyts',
        //     // '-tune', 'zerolatency',
        //     // '-r', framerate, // will duplicate frames to meet this but still look like the framerate set before -i,
        //     output_path
        // ];

        let process = cp.spawn(ffmpegPath, args);

        // process.stdout.on('data', function(data) {
        //     console.log('stdout data', data);
        // });
        process.stderr.setEncoding('utf8');
        process.stderr.on('data', function(data) {
            console.log('stderr data', data);
        });
        // process.on('close', function() {
        //     console.log('finished');
        // });

        return process;
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
    evaluateAndRescaleVideosIfNeeded(deviceId, rescaleEnabled) {
        let unprocessedPath = path.join(this.outputPath, deviceId, this.DIR_NAMES.unprocessed_chunks);
        let processedPath = path.join(this.outputPath, deviceId, this.DIR_NAMES.processed_chunks);

        let fileMap = {
            color: {
                processed: this.getProcessedChunkFilePaths(deviceId, 'color'),
                unprocessed: this.getUnprocessedChunkFilePaths(deviceId, 'color')
            },
            depth: {
                processed: this.getProcessedChunkFilePaths(deviceId, 'depth'),
                unprocessed: this.getUnprocessedChunkFilePaths(deviceId, 'depth')
            }
        };

        Object.keys(fileMap).forEach(colorOrDepth => {
            let filesToScale = [];
            fileMap[colorOrDepth].unprocessed.forEach(filename => {
                let timestamp = filename.match(/[0-9]{13,}/);
                if (!fileMap[colorOrDepth].processed.some(resizedFilename => resizedFilename.includes(timestamp))) {
                    let colorFilename = filename.replace(/\.[^/.]+$/, '') + '.' + this.COLOR_FILETYPE;
                    let depthFilename = filename.replace(/\.[^/.]+$/, '') + '.' + this.DEPTH_FILETYPE;
                    let colorFilePath = path.join(unprocessedPath, 'color', colorFilename);
                    let depthFilePath = path.join(unprocessedPath, 'depth', depthFilename);
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
                    this.ffmpeg_adjust_length(outputPath, inputPath, this.SEGMENT_LENGTH / 1000);
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
