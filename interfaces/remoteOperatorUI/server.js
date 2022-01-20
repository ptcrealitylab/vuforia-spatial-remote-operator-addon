const cors = require('cors');
const express = require('express');
const expressWs = require('express-ws');
const makeStreamRouter = require('./makeStreamRouter.js');
const fs = require('fs');
const path = require('path');
const ffmpegPath = require('@ffmpeg-installer/ffmpeg').path;
const ffmpeg = require('fluent-ffmpeg');

module.exports.start = function start() {
    const app = express();

    ffmpeg.setFfmpegPath(ffmpegPath);

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

    if (fs.existsSync(path.join(__dirname, 'images', 'matrix'))) {
        // processImages(path.join(__dirname, 'images', 'matrix'));
        console.log('TODO: process matrix images too');
    } else {
        fs.mkdirSync(path.join(__dirname, 'images', 'matrix'));
    }

    function processImages(dirPath) {
        console.log('process: ' + dirPath);
        let files = fs.readdirSync(dirPath).filter(function(filename) {
            return filename.includes('.png');
        });
        console.log(files);

        const command = ffmpeg();
        // Use FFMpeg to create a video.
        // 8 consecutive frames, held for 5 seconds each, 30fps output, no audio
        // color_1642712727894.png
        let filename = dirPath.includes('/color') ? 'color' : 'depth';
        let inputFormat = path.join(dirPath, filename + '_%08d.png');
        console.log(inputFormat);

        let outputName = path.join(dirPath, filename + '-1920x1080.mp4');

        let timemark = null;

        command
            .on('end', onEnd)
            .on('progress', onProgress)
            // .on('error', onError)
            .input(inputFormat)
            .fromFormat('image2pipe')
            // .addInputOption('-vcodec', 'png')
            // .inputFormat('png')
            .inputFPS(30)
            .output(outputName)
            .outputFPS(30)
            .noAudio()
            .run();

        console.log('processing... ' + filename);


        function onEnd() {
            console.log('Finished processing');
        }

        function onProgress(progress) {
            if (progress.timemark !== timemark) {
                timemark = progress.timemark;
                console.log('Time mark: ' + timemark + '...');
            }
        }

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
