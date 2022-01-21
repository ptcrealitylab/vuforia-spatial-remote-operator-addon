const cors = require('cors');
const express = require('express');
const expressWs = require('express-ws');
const makeStreamRouter = require('./makeStreamRouter.js');
const fs = require('fs');
const path = require('path');
const ffmpegPath = require('@ffmpeg-installer/ffmpeg').path;
const ffmpeg = require('fluent-ffmpeg');
const cp = require('child_process');

module.exports.start = function start() {
    const app = express();
    ffmpeg.setFfmpegPath(ffmpegPath);

    // from images (I think PNGs don't work, we could try converting to JPGs?)

    if (!fs.existsSync(path.join(__dirname, 'images'))) {
        fs.mkdirSync(path.join(__dirname, 'images'));
    }

    if (fs.existsSync(path.join(__dirname, 'images', 'color'))) {
        processImages(path.join(__dirname, 'images', 'color'));
    } else {
        fs.mkdirSync(path.join(__dirname, 'images', 'color'));
    }

    if (fs.existsSync(path.join(__dirname, 'images', 'depth'))) {
        processImages(path.join(__dirname, 'images', 'depth'));
    } else {
        fs.mkdirSync(path.join(__dirname, 'images', 'depth'));
    }

    // if (fs.existsSync(path.join(__dirname, 'images', 'matrix'))) {
    //     // processImages(path.join(__dirname, 'images', 'matrix'));
    //     console.log('TODO: process matrix images too');
    // } else {
    //     fs.mkdirSync(path.join(__dirname, 'images', 'matrix'));
    // }

    function processImages(dirPath) {
        console.log('process: ' + dirPath);
        let files = fs.readdirSync(dirPath).filter(function(filename) {
            return filename.includes('.png');
        });
        console.log(files);

        let imageType = dirPath.includes('color') ? 'color' : 'depth';

        let inputWidth = 1920;
        let inputHeight = 1080;
        let width = inputWidth / 4;
        let height = inputHeight / 4;
        let outputPath = path.join(dirPath, imageType + '_' + width + 'x' + height + '.mp4');
        console.log('OUTPUTTING VIDEO TO: ' + outputPath);

        let inputPath = path.join(dirPath, imageType + '_%08d.png');
        console.log('INPUT: ' + inputPath);

        let args = [
            '-r', '10',
            '-f', 'image2'
        ];
        if (imageType === 'color') {
            args.push('-vcodec', 'mjpeg',);
        }
        args.push(
            '-s', inputWidth + 'x' + inputHeight,
            '-i', inputPath,
            '-vcodec', 'libx264',
            '-crf', '25',
            '-pix_fmt', 'yuv420p',
            '-vf', 'scale=' + width + ':' + height + ',setsar=1:1',
            outputPath
        );

        cp.spawn('ffmpeg', args);

        // let proc = cp.spawn('ffmpeg', [
        //     '-r', '10',
        //     '-f', 'image2',
        //     // '-vcodec', 'mjpeg',
        //     '-s', inputWidth + 'x' + inputHeight,
        //     '-i', inputPath,
        //     '-vcodec', 'libx264',
        //     '-crf', '25',
        //     '-pix_fmt', 'yuv420p',
        //     '-vf', 'scale=' + width + ':' + height + ',setsar=1:1',
        //     outputPath
        // ]);

        // proc[imageType] = cp.spawn('ffmpeg', [
        //     '-r', '10',
        //     '-f', 'image2pipe',
        //     '-vcodec', 'mjpeg',
        //     '-s', '1920x1080',
        //     '-i', '-',
        //     '-vcodec', 'libx264',
        //     '-crf', '25',
        //     '-pix_fmt', 'yuv420p',
        //     outputPath
        // ]);

        // proc.stdin.write(Buffer.from([
        //     255, 0, 0,
        //     0, 255, 0,
        //     0, 255, 255,
        //     255, 0, 255
        // ]));
        //
        // proc.stdin.end();
        //
        // proc.stderr.pipe(process.stdout);

        // const command = ffmpeg();
        // // Use FFMpeg to create a video.
        // // 8 consecutive frames, held for 5 seconds each, 30fps output, no audio
        // // color_1642712727894.png
        // let filename = dirPath.includes('/color') ? 'color' : 'depth';
        // let inputFormat = path.join(dirPath, filename + '_%08d.png');
        // console.log(inputFormat);
        //
        // let outputName = path.join(dirPath, filename + '-1920x1080.mp4');
        //
        // let timemark = null;
        //
        // command
        //     .on('end', onEnd)
        //     .on('progress', onProgress)
        //     // .on('error', onError)
        //     .input(inputFormat)
        //     .fromFormat('image2pipe')
        //     // .addInputOption('-vcodec', 'png')
        //     // .inputFormat('png')
        //     .inputFPS(30)
        //     .output(outputName)
        //     .outputFPS(30)
        //     .noAudio()
        //     .run();
        //
        // console.log('processing... ' + filename);
        //
        //
        // function onEnd() {
        //     console.log('Finished processing');
        // }
        //
        // function onProgress(progress) {
        //     if (progress.timemark !== timemark) {
        //         timemark = progress.timemark;
        //         console.log('Time mark: ' + timemark + '...');
        //     }
        // }

        // function onError(err, _stdout, _stderr) {
        //     console.log('Cannot process video: ' + err.message);
        // }
    }

    // ffmpeg.setFfmpegPath(ffmpegPath);
    // const command = ffmpeg();
    // // Use FFMpeg to create a video.
    // // 8 consecutive frames, held for 5 seconds each, 30fps output, no audio
    // command
    //     .input('assets/demo1/Sinewave3-1920x1080_%03d.png')
    //     .inputFPS(1/5)
    //     .output('assets/demo1/Sinewave3-1920x1080.mp4')
    //     .outputFPS(30)
    //     .noAudio()
    //     .run();

    // https://stackoverflow.com/questions/46073876/node-js-buffer-data-to-ffmpeg
    // let outputPath = path.join(__dirname, '1.png');
    //
    // let proc = cp.spawn('ffmpeg', [
    //     '-hide_banner',
    //     '-f', 'rawvideo',
    //     '-pix_fmt', 'rgb24',
    //     '-s', '2x2',
    //     '-i', '-',
    //     outputPath
    // ]);
    //
    // proc.stdin.write(Buffer.from([
    //     255, 0, 0,
    //     0, 255, 0,
    //     0, 255, 255,
    //     255, 0, 255
    // ]));
    //
    // proc.stdin.end();
    //
    // proc.stderr.pipe(process.stdout);

    // let outputName = path.join(__dirname, 'video-1920x1080.mp4');
    // let command = ffmpeg();
    // command
    //     // .on('end', onEnd)
    //     // .on('progress', onProgress)
    //     // .on('error', onError)
    //     // .input(inputFormat)
    //     .inputOptions('-i -')
    //     .fromFormat('image2pipe')
    //     // .addInputOption('-vcodec', 'png')
    //     // .inputFormat('png')
    //     .inputFPS(30)
    //     .output(outputName)
    //     .outputFPS(30)
    //     .noAudio()
    //     .run();

    let counter = 0;
    app.use(cors());
    expressWs(app);
    const streamRouter = makeStreamRouter(app);
    streamRouter.onFrame(function(rgb, depth, pose) {
        // console.log(rgb, depth, pose);
        const zeroPad = (num, places) => String(num).padStart(places, '0');

        let colorFilename = 'color_' + zeroPad(counter, 8) + '.png'; // + Math.floor(Math.random() * 1000)
        let depthFilename = 'depth_' + zeroPad(counter, 8) + '.png';
        let matrixFilename = 'matrix_' + zeroPad(counter, 8) + '.png';
        counter++;

        // let colorFilename = 'color_' + Date.now() + '.png'; // + Math.floor(Math.random() * 1000)
        // let depthFilename = 'depth_' + Date.now() + '.png';
        // let matrixFilename = 'matrix_' + Date.now() + '.png';

        fs.writeFile(path.join(__dirname, 'images', 'color', colorFilename), rgb, function() {
            // console.log('wrote color image');
        });

        fs.writeFile(path.join(__dirname, 'images', 'depth', depthFilename), depth, function() {
            // console.log('wrote depth image');
        });

        fs.writeFile(path.join(__dirname, 'images', 'matrix', matrixFilename), pose, function() {
            // console.log('wrote matrix image');
        });
    });

    let allWebsockets = [];
    let sensorDescriptions = {};

    function broadcast(broadcaster, msgStr) {
        for (let ws of allWebsockets) {
            if (ws === broadcaster) {
                continue;
            }
            ws.send(msgStr);
        }
    }

    let activeSkels = {};

    app.ws('/', (ws) => {
        console.log('an attempt /');
        allWebsockets.push(ws);
        let wsId = '' + (Math.random() * 9999);

        ws.addEventListener('close', () => {
            allWebsockets = allWebsockets.filter(a => a !== ws);
        });

        let playback = null;
        ws.on('message', (msgStr, _isBinary) => {
            
            try{
                const msg = JSON.parse(msgStr);
                switch (msg.command) {
                case '/update/humanPoses':
                    doUpdateHumanPoses(msg);
                    break;
                case '/update/sensorDescription':
                    doUpdateSensorDescription(msg);
                    break;
                }
            } catch (error) {
                console.warn('Could not parse message: ' , error);
            }
            
        });
        
        let cleared = false;
        function doUpdateHumanPoses(msg) {
            if (playback && !playback.running) {
                playback = null;
            }
            if (msg.hasOwnProperty('length')) {
                msg = {
                    time: Date.now(),
                    pose: msg,
                };
            }
            let poses = msg.pose;
            for (let skel of poses) {
                activeSkels[skel.id] = {
                    msgId: wsId,
                    skel,
                    lastUpdate: Date.now(),
                };
            }
            for (let activeSkel of Object.values(activeSkels)) {
                if (activeSkel.skel.joints.length === 0 ||
                    Date.now() - activeSkel.lastUpdate > 1500) {
                    delete activeSkels[activeSkel.skel.id];
                    continue;
                }
                if (activeSkel.msgId !== wsId) {
                    poses.push(activeSkel.skel);
                }
            }
            if (poses.length === 0) {
                if (cleared) {
                    return;
                } else {
                    cleared = true;
                }
            } else {
                cleared = false;
            }

            if (!playback) {
                broadcast(ws, JSON.stringify(msg));
            }

            processSensorActivations(ws, poses);
        }

        function doUpdateSensorDescription(desc) {
            sensorDescriptions[desc.id] = JSON.parse(JSON.stringify(desc)); // desc;
            // const t = desc.x;
            // desc.x = -desc.x;
            // desc.z = -desc.z;
            console.log('sensorDesc', desc);
            // sock.broadcast.emit('/update/sensorDescription', JSON.stringify(desc));
            broadcast(ws, JSON.stringify(desc));
        }

        function processSensorActivations(ws, poses) {
            // for (let pose of poses) {
            //     for (let joint of pose.joints) {
            //         joint.z = -joint.z;
            //     }
            // }

            for (let id in sensorDescriptions) {
                let sensorDesc = sensorDescriptions[id];
                let oldCount = sensorDesc.count;
                sensorDesc.count = 0;

                for (let pose of poses) {
                    for (let joint of pose.joints) {
                        if (joint.x < sensorDesc.x - sensorDesc.width / 2) {
                            continue;
                        }
                        if (joint.x > sensorDesc.x + sensorDesc.width / 2) {
                            continue;
                        }
                        if (joint.y < sensorDesc.y - sensorDesc.height / 2) {
                            continue;
                        }
                        if (joint.y > sensorDesc.y + sensorDesc.height / 2) {
                            continue;
                        }
                        if (joint.z < sensorDesc.z - sensorDesc.depth / 2) {
                            continue;
                        }
                        if (joint.z > sensorDesc.z + sensorDesc.depth / 2) {
                            continue;
                        }

                        sensorDesc.count += 1;
                        break;
                    }
                }

                let sendActivation = oldCount !== sensorDesc.count || Math.random() < 0.03;

                if (sendActivation) {
                    // console.log('yey', sensorDesc);
                    broadcast(ws, JSON.stringify({
                        command: '/update/sensorActivation',
                        id: sensorDesc.id,
                        count: Math.floor(sensorDesc.count),
                        active: sensorDesc.count > 0,
                    }));
                }
            }
        }

    });

    app.listen(31337);
};
