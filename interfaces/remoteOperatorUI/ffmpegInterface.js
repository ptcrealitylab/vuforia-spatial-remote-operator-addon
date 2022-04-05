const fs = require('fs');
const cp = require('child_process');
const ffmpeg = require('@ffmpeg-installer/ffmpeg');
const ffmpegPath = require('@ffmpeg-installer/ffmpeg').path;
// const VideoLib = require('node-video-lib');

class ffmpegInterface {
    constructor() {
        console.log('FFMPEG installer:', ffmpeg.path, ffmpeg.version);
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

        let process = cp.spawn(ffmpegPath, args);
        return process;
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
}

module.exports = ffmpegInterface;
