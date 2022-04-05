const fs = require('fs');
const path = require('path');

class VideoProcessManager {
    constructor(fileManager, ffmpegInterface) {
        this.connections = {};
        this.fileManager = fileManager;
        this.ffmpegInterface = ffmpegInterface;
        this.callbacks = {
            recordingDone: null
        };
    }
    onConnection(deviceId) {
        console.log('-- on connection: ' + deviceId);
        this.connections[deviceId] = new Connection(deviceId, this.fileManager, this.ffmpegInterface, this.callbacks);
    }
    onDisconnection(deviceId) {
        console.log('-- on disconnection: ' + deviceId);
        if (this.connections[deviceId]) {
            this.connections[deviceId].stopRecording(true);
            // ?? delete this.connections[deviceId] ??
        }
    }
    startRecording(deviceId) {
        console.log('-- start recording: ' + deviceId);
        if (this.connections[deviceId]) {
            this.connections[deviceId].startRecording();
        }
    }
    stopRecording(deviceId) {
        console.log('-- stop recording: ' + deviceId);
        if (this.connections[deviceId]) {
            this.connections[deviceId].stopRecording(false);
        }
    }
    onFrame(rgb, depth, pose, deviceId) {
        if (this.connections[deviceId]) {
            this.connections[deviceId].onFrame(rgb, depth, pose);
        }
    }
    setRecordingDoneCallback(callback) {
        this.callbacks.recordingDone = callback;
    }
}

class Connection {
    constructor(deviceId, fileManager, ffmpegInterface, callbacks) {
        this.deviceId = deviceId;
        this.sessionId = null;
        this.STATUS = Object.freeze({
            NOT_STARTED: 'NOT_STARTED',
            STARTED: 'STARTED',
            ENDING: 'ENDING',
            DISCONNECTED: 'DISCONNECTED',
            STOPPED: 'STOPPED'
        });
        this.isRecording = false;
        this.processes = {
            color: null,
            depth: null,
            pose: null
        };
        this.processStatuses = {
            color: this.STATUS.NOT_STARTED,
            depth: this.STATUS.NOT_STARTED,
            pose: this.STATUS.NOT_STARTED
        };
        this.poses = [];
        this.chunkCount = 0;
        this.ffmpegInterface = ffmpegInterface;
        this.fileManager = fileManager;
        this.SEGMENT_LENGTH = 15000; // TODO: move to constants file
        this.callbacks = callbacks;
    }
    startRecording() {
        this.sessionId = this.uuidTimeShort();
        this.chunkCount = 0;
        this.isRecording = true;
        // fileManager setup persistent data and directories

        this.spawnProcesses();

        // process data and restart every 15 seconds (unless socket disconnected, just process data and stop)
        setTimeout(_ => {
            this.stopProcesses();
            if (this.processStatuses.color !== this.STATUS.DISCONNECTED &&
                this.processStatuses.color !== this.STATUS.STOPPED) {
                setTimeout(() => {
                    this.recordNextChunk();
                }, 10);
            }
        }, this.SEGMENT_LENGTH);
    }
    recordNextChunk() {
        this.chunkCount += 1;
        this.isRecording = true;

        this.spawnProcesses();

        // process data and restart every 15 seconds (unless socket disconnected, just process data and stop)
        setTimeout(_ => {
            this.stopProcesses();
            if (this.processStatuses.color !== this.STATUS.DISCONNECTED &&
                this.processStatuses.color !== this.STATUS.STOPPED) {
                setTimeout(() => {
                    this.recordNextChunk();
                }, 10);
            }
        }, this.SEGMENT_LENGTH);
    }
    spawnProcesses() {
        let index = this.chunkCount; // this.processChunkCounts[deviceId][sessionId];

        // start color stream process
        // depth images are 1920x1080 lossy JPG images
        let chunkTimestamp = Date.now();
        let colorFilename = 'chunk_' + this.sessionId + '_' + index + '_' + chunkTimestamp + '.' + this.fileManager.COLOR_FILETYPE;
        let colorOutputPath = path.join(this.fileManager.outputPath, this.deviceId, this.fileManager.DIR_NAMES.unprocessed_chunks, 'color', colorFilename);
        this.processes.color = this.ffmpegInterface.ffmpeg_image2mp4(colorOutputPath, 10, 'mjpeg', 1920, 1080, 25, 0.5);
        if (this.processes.color) {
            this.processStatuses.color = this.STATUS.STARTED;
        }

        // start depth stream process
        // depth images are 256x144 lossless PNG buffers
        let depthFilename = 'chunk_' + this.sessionId + '_' + index + '_' + chunkTimestamp + '.' + this.fileManager.DEPTH_FILETYPE;
        let depthOutputPath = path.join(this.fileManager.outputPath, this.deviceId, this.fileManager.DIR_NAMES.unprocessed_chunks, 'depth', depthFilename);
        this.processes.depth = this.ffmpegInterface.ffmpeg_image2mp4(depthOutputPath, 10, 'png', 256, 144, 13, 1);
        // this.processes[deviceId][this.PROCESS.DEPTH] = this.ffmpeg_image2losslessVideo(depthOutputPath, 10, 'png', 256, 144); // this version isn't working as reliably
        // this.processes[deviceId][this.PROCESS.DEPTH] = this.ffmpeg_image2mp4(depthOutputPath, 10, 'png', 256, 144, 0, 1);
        if (this.processes.depth) {
            this.processStatuses.depth = this.STATUS.STARTED;
        }

        this.processStatuses.pose = this.STATUS.STARTED;
        this.poses = [];
    }
    onFrame(rgb, depth, pose) {
        if (!this.isRecording) { return; }

        if (this.processes.color && this.processStatuses.color === this.STATUS.STARTED) {
            this.processes.color.stdin.write(rgb);
        }
        if (this.processes.depth && this.processStatuses.depth === this.STATUS.STARTED) {
            this.processes.depth.stdin.write(depth);
        }
        if (this.processStatuses.pose === this.STATUS.STARTED) {
            this.poses.push({
                pose: pose.toString('base64'),
                time: Date.now()
            });
        }
        // TODO: include debug_write_images?
    }
    stopProcesses() {
        this.isRecording = false;

        if (this.processes.color !== 'undefined' && this.processStatuses.color === this.STATUS.STARTED) {
            console.log('end color process');
            this.processes.color.stdin.setEncoding('utf8');
            this.processes.color.stdin.write('q');
            this.processes.color.stdin.end();
            this.processStatuses.color = this.STATUS.ENDING;
        }

        if (this.processes.depth !== 'undefined' && this.processStatuses.depth === this.STATUS.STARTED) {
            console.log('end depth process');
            this.processes.depth.stdin.setEncoding('utf8');
            this.processes.depth.stdin.write('q');
            this.processes.depth.stdin.end();
            this.processStatuses.depth = this.STATUS.ENDING;

            // TODO: should this move to the processStatuses.pose block?
            let index = this.chunkCount;
            let poseFilename = 'chunk_' + this.sessionId + '_' + index + '_' + Date.now() + '.json';
            let poseOutputPath = path.join(this.fileManager.outputPath, this.deviceId, this.fileManager.DIR_NAMES.unprocessed_chunks, 'pose', poseFilename);
            fs.writeFileSync(poseOutputPath, JSON.stringify(this.poses));
            this.poses = [];
        }

        if (this.processStatuses.pose === this.STATUS.STARTED) {
            console.log('end pose process');
            this.processStatuses.pose = this.STATUS.ENDING;
        }
    }
    stopRecording(didDisconnect) {
        if (this.isRecording) {
            this.stopProcesses();
        }
        if (didDisconnect) {
            this.processStatuses.color = this.STATUS.DISCONNECTED;
            this.processStatuses.depth = this.STATUS.DISCONNECTED;
            this.processStatuses.pose = this.STATUS.DISCONNECTED;
        } else {
            this.processStatuses.color = this.STATUS.STOPPED;
            this.processStatuses.depth = this.STATUS.STOPPED;
            this.processStatuses.pose = this.STATUS.STOPPED;
        }

        // TODO: include setTimeout (write final pose and process chunks)
        if (this.callbacks.recordingDone) {
            this.callbacks.recordingDone(this.deviceId, this.sessionId, this.chunkCount);
        }
    }
    uuidTimeShort() {
        var dateUuidTime = new Date();
        var abcUuidTime = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
        var stampUuidTime = parseInt('' + dateUuidTime.getMilliseconds() + dateUuidTime.getMinutes() + dateUuidTime.getHours() + dateUuidTime.getDay()).toString(36);
        while (stampUuidTime.length < 8) stampUuidTime = abcUuidTime.charAt(Math.floor(Math.random() * abcUuidTime.length)) + stampUuidTime;
        return stampUuidTime;
    }
}

module.exports = VideoProcessManager;
