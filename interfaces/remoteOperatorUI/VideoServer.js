// const ffmpegPath = require('@ffmpeg-installer/ffmpeg').path;
// const ffmpeg = require('fluent-ffmpeg');
const fs = require('fs');
const path = require('path');
const cp = require('child_process');

class VideoServer {
    constructor(outputPath) {
        this.outputPath = outputPath;
        this.isRecording = false;
        this.processes = {};
        this.processStatuses = {};
        this.frameCounter = 0;
        this.PROCESS = Object.freeze({
            COLOR: 'COLOR',
            DEPTH: 'DEPTH'
        });
        this.STATUS = Object.freeze({
            NOT_STARTED: 'NOT_STARTED',
            STARTED: 'STARTED',
            ENDING: 'ENDING',
            ENDED: 'ENDED'
        });
        this.anythingReceived = false;

        if (!fs.existsSync(this.outputPath)) {
            fs.mkdirSync(this.outputPath, {recursive: true});
            console.log('Created directory for VideoServer outputPath: ' + this.outputPath);
        }

        console.log('Created a VideoServer with path: ' + this.outputPath);
    }
    startRecording() {
        this.isRecording = true;
        this.frameCounter = 0;

        // start color stream process
        this.processes[this.PROCESS.COLOR] = this.ffmpeg_image2mp4('color_stream', 8, 'mjpeg', 1920, 1080, 25, 0.25);
        if (this.processes[this.PROCESS.COLOR]) {
            this.processStatuses[this.PROCESS.COLOR] = this.STATUS.STARTED;
        }

        // start depth stream process
        this.processes[this.PROCESS.DEPTH] = this.ffmpeg_image2mp4('depth_stream', 8, 'png', 1920, 1080, 25, 0.25);
        if (this.processes[this.PROCESS.DEPTH]) {
            this.processStatuses[this.PROCESS.DEPTH] = this.STATUS.STARTED;
        }

        setTimeout(function() {
            this.stopRecording();
            setTimeout(function() {
                this.startRecording();
            }.bind(this), 100);
        }.bind(this), 30000);
    }
    stopRecording() {
        this.isRecording = false;

        let colorProcess = this.processes[this.PROCESS.COLOR];
        let depthProcess = this.processes[this.PROCESS.DEPTH];
        let colorStatus = this.processStatuses[this.PROCESS.COLOR];
        let depthStatus = this.processStatuses[this.PROCESS.DEPTH];

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
        }
    }
    onFrame(rgb, depth, _pose) {
        if (!this.anythingReceived) {
            this.startRecording(); // start recording the first time it receives a data packet
            this.anythingReceived = true;
        }
        if (!this.isRecording) {
            return;
        }

        console.log('write rgb and depth frames');

        this.frameCounter++;
        let colorProcess = this.processes[this.PROCESS.COLOR];
        let depthProcess = this.processes[this.PROCESS.DEPTH];
        let colorStatus = this.processStatuses[this.PROCESS.COLOR];
        let depthStatus = this.processStatuses[this.PROCESS.DEPTH];

        if (typeof colorProcess !== 'undefined' && colorStatus === 'STARTED') {
            colorProcess.stdin.write(rgb);
        }

        if (typeof depthProcess !== 'undefined' && depthStatus === 'STARTED') {
            depthProcess.stdin.write(depth);
        }
    }
    ffmpeg_image2mp4(output_name, framerate = 8, input_vcodec = 'mjpeg', input_width = 1920, input_height = 1080, crf = 25, output_scale = 0.25) {
        let filePath = path.join(this.outputPath, output_name + '_' + Date.now() + '.mp4');

        let outputWidth = input_width * output_scale;
        let outputHeight = input_height * output_scale;

        let args = [
            '-r', framerate,
            '-f', 'image2pipe',
            '-vcodec', input_vcodec,
            '-s', input_width + 'x' + input_height,
            '-i', '-',
            '-vcodec', 'libx264',
            '-crf', crf,
            '-pix_fmt', 'yuv420p',
            '-vf', 'scale=' + outputWidth + ':' + outputHeight + ',setsar=1:1',
            filePath
        ];

        // let args = [
        //     '-r', '10',
        //     '-f', 'image2pipe'
        // ];
        // if (imageType === 'color') {
        //     args.push('-vcodec', 'mjpeg');
        // }
        // args.push(
        //     '-s', inputWidth + 'x' + inputHeight,
        //     // '-i', inputPath,
        //     '-i', '-',
        //     '-vcodec', 'libx264',
        //     '-crf', '25',
        //     '-pix_fmt', 'yuv420p',
        //     '-vf', 'scale=' + width + ':' + height + ',setsar=1:1',
        //     outputPath
        // );

        let process = cp.spawn('ffmpeg', args);

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

        console.log('created child_process with args:', args);
        return process;
    }
}

module.exports = VideoServer;
