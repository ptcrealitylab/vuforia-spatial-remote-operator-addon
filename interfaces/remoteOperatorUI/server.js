const cors = require('cors');
const express = require('express');
const expressWs = require('express-ws');
const makeStreamRouter = require('./makeStreamRouter.js');

module.exports.start = function start() {
    const app = express();

    app.use(cors());
    expressWs(app);
    const _streamRouter = makeStreamRouter(app);

    let allWebsockets = [];

    function broadcast(broadcaster, msgStr) {
        for (let ws of allWebsockets) {
            if (ws === broadcaster) {
                continue;
            }
            ws.send(msgStr);
        }
    }

    app.ws('/', (ws) => {
        console.log('an attempt /');
        allWebsockets.push(ws);

        ws.addEventListener('close', () => {
            allWebsockets = allWebsockets.filter(a => a !== ws);
        });

        let playback = null;
        ws.on('message', (msgStr, _isBinary) => {
            const msg = JSON.parse(msgStr);
            switch (msg.command) {
            case '/update/humanPoses':
                doUpdateHumanPoses(msg);
                break;
            }
        });

        let activeSkels = {};
        let cleared = false;
        let msgId = 0;
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
            msgId += 1;
            for (let skel of poses) {
                activeSkels[skel.id] = msgId;
            }
            for (let skelId of Object.keys(activeSkels)) {
                if (activeSkels[skelId] !== msgId) {
                    poses.push({
                        id: skelId,
                        joints: [],
                    });
                    delete activeSkels[skelId];
                }
            }
            if (poses.length === 0) {
                if (cleared) {
                    return;
                } else {
                    cleared = true;
                }
            }

            if (!playback) {
                broadcast(ws, JSON.stringify(msg));
            }
        }
    });

    app.listen(31337);
};
