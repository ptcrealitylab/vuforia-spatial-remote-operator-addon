const sceneGraph = require('./sceneGraph');
const SceneNode = require('./sceneGraph/sceneNode.js');
sceneGraph.initService();

function requestId(req) {
    return parseInt(req.ip.split(/\./g)[3]);
}

function messageWithId(msg, id) {
    let idBuf = Buffer.alloc(1);
    idBuf.writeUint8(id, 0);
    return Buffer.concat([idBuf, msg]);
}

module.exports = function makeStreamRouter(app) {
    let colorPool = [];
    let depthPool = [];
    let matrixPool = [];
    let onFrameCallbacks = [];
    app.ws('/colorProvider', function(ws, req) {
        console.log('new colorPro ws');
        const id = requestId(req);
        ws.on('message', function(msg, _isBinary) {
            const msgWithId = messageWithId(msg, id);
            for (let ws of colorPool) {
                if (ws.bufferedAmount > 10 * 1024) {
                    continue;
                }
                ws.send(msgWithId);
            }
            processFrame(id, msg, null, null);
        });
    });

    app.ws('/depthProvider', function(ws, req) {
        console.log('new depthPro ws');
        const id = requestId(req);
        ws.on('message', function(msg, _isBinary) {
            const msgWithId = messageWithId(msg, id);
            for (let ws of depthPool) {
                if (ws.bufferedAmount > 10 * 1024) {
                    continue;
                }
                ws.send(msgWithId);
            }
            processFrame(id, null, msg, null);
        });
    });

    app.ws('/matrixProvider', function(ws, req) {
        console.log('new matrixPro ws');
        const id = requestId(req);
        ws.on('message', function(matricesMsg, _isBinary) {
            const matrices = JSON.parse(matricesMsg);
            let cameraNode = sceneGraph.getSceneNodeById(sceneGraph.NAMES.CAMERA);
            cameraNode.setLocalMatrix(matrices.camera);
            cameraNode.updateWorldMatrix();
            let gpNode = sceneGraph.getSceneNodeById(sceneGraph.NAMES.GROUNDPLANE + sceneGraph.TAGS.ROTATE_X);
            if (!gpNode) {
                gpNode = sceneGraph.getSceneNodeById(sceneGraph.NAMES.GROUNDPLANE);
            }
            sceneGraph.getSceneNodeById(sceneGraph.NAMES.GROUNDPLANE).setLocalMatrix(matrices.groundplane);
            sceneGraph.getSceneNodeById(sceneGraph.NAMES.GROUNDPLANE).updateWorldMatrix();

            let sceneNode = new SceneNode('posePixel');
            sceneNode.setParent(sceneGraph.getSceneNodeById('ROOT'));

            let initialVehicleMatrix = [
                -1, 0, 0, 0,
                0, 1, 0, 0,
                0, 0, -1, 0,
                0, 0, 0, 1,
            ];

            sceneNode.setPositionRelativeTo(cameraNode, initialVehicleMatrix);
            sceneNode.updateWorldMatrix();

            let cameraMat = sceneNode.getMatrixRelativeTo(gpNode);

            const msg = Buffer.from(new Float32Array(cameraMat).buffer);
            const msgWithId = messageWithId(msg, id);
            for (const ws of matrixPool) {
                ws.send(msgWithId);
            }
            processFrame(id, null, null, msg);
        });
    });

    app.ws('/color', function(ws) {
        console.log('new color ws');
        colorPool.push(ws);
    });

    app.ws('/depth', function(ws) {
        console.log('new depth ws');
        depthPool.push(ws);
    });

    app.ws('/matrix', function(ws) {
        console.log('new matrix ws');
        matrixPool.push(ws);
    });

    let frameData = {};
    function processFrame(id, color, depth, matrix) {
        if (typeof frameData[id] === 'undefined') {
            frameData[id] = {
                color: null,
                depth: null,
                matrix: null
            };
            return;
        }
        if (color) {
            frameData[id].color = color;
        }
        if (depth) {
            frameData[id].depth = depth;
        }
        if (matrix) {
            frameData[id].matrix = matrix;
        }
        if (frameData[id].color && frameData[id].depth && frameData[id].matrix) {
            // console.log('have color, depth, and matrix for id: ' + id);
            onFrameCallbacks.forEach(function(cb) {
                cb(frameData[id].color, frameData[id].depth, frameData[id].matrix, id);
            });
            delete frameData[id];
        }
    }

    const onFrame = function(callback) {
        onFrameCallbacks.push(callback);
    };

    return {
        onFrame: onFrame
    };
};

