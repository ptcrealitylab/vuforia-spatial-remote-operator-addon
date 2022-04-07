const fs = require('fs');
const cp = require('child_process');
const ffmpeg = require('@ffmpeg-installer/ffmpeg');
const ffmpegPath = require('@ffmpeg-installer/ffmpeg').path;
const constants = require('./videoConstants');

/**
 * @fileOverview
 * This contains a set of utility functions that will spawn an ffmpeg child process to perform the specified task
 * Enable constants.DEBUG_LOG_FFMPEG to print information from these processes
 *
 * Note: I've intentionally left the rubble of some experiments in here, that it may help future thought processes
 *
 * TODO: how can we listen for when the process finishes writing the output file, to reliably continue only when safe?
 */

module.exports = {
    // Create a process that converts a stream of jpeg or png images into a video.
    // To add a frame, call process.stdin.write(rgb_buffer). To finish, call process.stdin.end()
    ffmpeg_image2mp4: (output_path, framerate = 10, input_vcodec = 'mjpeg', input_width = 1920, input_height = 1080, crf = 25, output_scale = 0.25) => {
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

        if (constants.DEBUG_LOG_FFMPEG) {
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
        }

        return process;
    },
    // experimental alternative to ffmpeg_image2mp4 that tries to use lossless codecs and parameters
    // not quite successful, but could be iterated upon
    ffmpeg_image2losslessVideo: (output_path, framerate = 10, input_vcodec = 'png', input_width = 256, input_height = 144) => {
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

        if (constants.DEBUG_LOG_FFMPEG) {
            // process.stdout.on('data', function(data) {
            //     console.log('stdout data', data);
            // });
            process.stderr.setEncoding('utf8');
            process.stderr.on('data', function (data) {
                console.log('stderr data', data);
            });
            // process.on('close', function() {
            //     console.log('finished');
            // });
        }

        return process;
    },
    // takes in a textfile with a list of filepaths, one per line, e.g:
    //      file '/my/file/path1.mp4'
    //      file '/my/file/path2.mp4'
    // and concatenates the specified video segments into a single video
    ffmpeg_concat_mp4s: (output_path, file_list_path) => {
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
    },
    // takes a video and resamples the timestamps of each frame to make it last the specified duration (in seconds)
    // currently relying on the VideoLib.MovieParser to get the length of the video file, which is a bit flaky,
    // as such this method isn't currently used and the VideoLib is commented out to avoid installing that dependency
    // (https://www.npmjs.com/package/node-video-lib)
    ffmpeg_adjust_length: (output_path, input_path, newDuration) => {
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

                if (constants.DEBUG_LOG_FFMPEG) {
                    process.stderr.setEncoding('utf8');
                    process.stderr.on('data', function (data) {
                        console.log('stderr data', data);
                    });
                }
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
};
