const cors = require('cors');
const express = require('express');
const expressWs = require('express-ws');
const makeStreamRouter = require('./makeStreamRouter.js');
const VideoServer = require('./VideoServer.js');
const path = require('path');
const os = require('os');

module.exports.start = function start() {
    const app = express();

    const objectsPath = path.join(os.homedir(), 'Documents', 'spatialToolbox');
    const identityFolderName = '.identity';

    // old path: in the addon
    // const videoServer = new VideoServer(app, path.join(__dirname, 'videos'));

    // new path: in the Documents/spatialToolbox/.identity
    const videoServer = new VideoServer(path.join(objectsPath, identityFolderName, '/virtualizer_recordings'));

    app.use(cors());
    expressWs(app);
    const streamRouter = makeStreamRouter(app);
    streamRouter.onFrame(function(rgb, depth, pose, deviceId) {
        videoServer.onFrame(rgb, depth, pose, 'device_' + deviceId);
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

    app.get('/test', function(req, res) {
        res.sendFile(path.join(__dirname, 'test.html'));
    });

    app.ws('/', (ws) => {
        console.log('an attempt /');
        allWebsockets.push(ws);
        let wsId = '' + (Math.random() * 9999);

        ws.addEventListener('close', () => {
            allWebsockets = allWebsockets.filter(a => a !== ws);
        });

        let playback = null;
        ws.on('message', (msgStr, _isBinary) => {

            try {
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
