/*
* Copyright © 2018 PTC
*
* This Source Code Form is subject to the terms of the Mozilla Public
* License, v. 2.0. If a copy of the MPL was not distributed with this
* file, You can obtain one at http://mozilla.org/MPL/2.0/.
*/

/**
 * Set to true to enable the hardware interface
 **/

const os = require('os');
const path = require('path');

const server = require('@libraries/hardwareInterfaces');
const utilities = require('@libraries/utilities');
const Addons = require('@libraries/addons/Addons');
const LocalUIApp =  require('@libraries/LocalUIApp');

const settings = server.loadHardwareInterface(__dirname);

exports.enabled = settings('enabled');
exports.configurable = true; // can be turned on/off/adjusted from the web frontend

/**
 * These settings will be exposed to the webFrontend to potentially be modified
 */
exports.settings = {
    userinterfacePath: {
        value: settings('userinterfacePath'),
        type: 'text',
        helpText: 'The absolute path to the vuforia-spatial-toolbox-userinterface.'
    }
};

if (exports.enabled) {

    const addonPaths = [
        path.join(__dirname, '../../../'),
        path.join(os.homedir(), 'Documents/toolbox/addons'),
    ];

    const addons = new Addons(addonPaths);
    const addonFolders = addons.listAddonFolders();

    // Set this in the web frontend, e.g.:
    // /Users/Benjamin/Documents/github/vuforia-spatial-toolbox-ios/bin/data/userinterface
    const userinterfacePath = settings('userinterfacePath');

    // Load the userinterface codebase (including all add-ons) using the server's LocalUIApp class
    // and serve the userinterface on port 8081
    try {
        const localUIApp = new LocalUIApp(userinterfacePath, addonFolders);
        localUIApp.setup();

        console.log('successfully created local_ui_app for remote operator');

        startHTTPServer(localUIApp, 8081);
    } catch (e) {
        console.warn('CANNOT START REMOTE OPERATOR ON PORT 8081: ', e);
    }

}

function startHTTPServer(localUIApp, port) {
    let mouseTranslation = null;
    let mouseRotation = null;
    let mouseConnected = false;
    var callibrationFrames = 100;

    const http = require('http').Server(localUIApp.app);
    const io = require('socket.io')(http);

    http.listen(port, function() {
        console.log('~~~ started remote operator on port ' + port);

        // pass visibleObjects messages to the userinterface
        server.subscribeToMatrixStream(function(visibleObjects) {
            io.emit('visibleObjects', visibleObjects);
        });

        // pass UDP messages to the userinterface
        server.subscribeToUDPMessages(function(msgContent) {
            io.emit('udpMessage', msgContent);
        });

        function socketServer() {

            io.on('connection', function (socket) {

                console.log('connected to socket', socket.id);

                socket.on('/subscribe/editorUpdates', function (msg) {

                    var msgContent = JSON.parse(msg);
                    console.log('/subscribe/editorUpdates', msgContent);

                    // realityEditorSocketArray[socket.id] = {object: msgContent.object, protocol: thisProtocol};

                    // io.sockets.connected[socket.id].emit('object', JSON.stringify({
                    //     object: msgContent.object,
                    //     frame: msgContent.frame,
                    //     node: key,
                    //     data: objects[msgContent.object].frames[msgContent.frame].nodes[key].data
                    // }));

                    // io.sockets.connected[socket.id].emit('object/publicData', JSON.stringify({
                    //     object: msgContent.object,
                    //     frame: msgContent.frame,
                    //     publicData: publicData
                    // }));

                });

                socket.on('/matrix/visibleObjects', function (msg) {
                    var msgContent = JSON.parse(msg);
                    io.emit('/matrix/visibleObjects', msgContent);
                });

                socket.on('/update', function(msg) {
                    var objectKey;
                    var frameKey;
                    var nodeKey;

                    var msgContent = JSON.parse(msg);
                    if (typeof msgContent.objectKey !== 'undefined') {
                        objectKey = msgContent.objectKey;
                    }
                    if (typeof msgContent.frameKey !== 'undefined') {
                        frameKey = msgContent.frameKey;
                    }
                    if (typeof msgContent.nodeKey !== 'undefined') {
                        nodeKey = msgContent.nodeKey;
                    }

                    if (objectKey && frameKey && nodeKey) {
                        io.emit('/update/node', msgContent);
                    } else if (objectKey && frameKey) {
                        io.emit('/update/frame', msgContent);
                    } else if (objectKey) {
                        io.emit('/update/object', msgContent);
                    }

                });

                /**
                 * Implements the native API functionality of UDP sending for the hosted reality editor desktop app
                 */
                socket.on('/nativeAPI/sendUDPMessage', function(msg) {
                    var msgContent = JSON.parse(msg);
                    utilities.actionSender(msgContent);
                });

                // try to connect to custom input device
                try {
                    connectTo6DMouse();
                } catch (e) {
                    console.log('Did not connect to input hardware. Control remote operator with mouse' +
                        ' scroll wheel, right-click drag and shift-right-click-drag');
                }

                function connectTo6DMouse() {
                    if (!mouseConnected) {
                        mouseConnected = true;
                        var sm = require('../6DMouse/3DConnexion.js');
                        var callibration = null;
                        sm.spaceMice.onData = function(mouse) {
                            mouseTranslation = mouse.mice[0]['translate'];
                            mouseRotation = mouse.mice[0]['rotate'];

                            // try calibrating for the first 100 time-steps, then send translation and rotation
                            // updates to the userinterface using socket messages
                            if (!callibration) {
                                callibrationFrames--;
                                if (callibrationFrames === 0) {

                                    if (mouseTranslation.x < 1.0 && mouseTranslation.x > -1.0) mouseTranslation.x = 0;
                                    if (mouseTranslation.y < 1.0 && mouseTranslation.y > -1.0) mouseTranslation.y = 0;
                                    if (mouseTranslation.z < 1.0 && mouseTranslation.z > -1.0) mouseTranslation.z = 0;

                                    mouseTranslation.x *= 20;
                                    mouseTranslation.y *= 20;
                                    mouseTranslation.z *= 20;

                                    callibration = {

                                        x: mouseTranslation.x * 20,
                                        y: mouseTranslation.y * 20,
                                        z: mouseTranslation.z * 20
                                    };
                                    console.log('callibrated mouse at ', callibration);
                                }
                            } else {
                                io.emit('/mouse/transformation', {
                                    translation: {
                                        x: mouseTranslation.x - callibration.x,
                                        y: mouseTranslation.y - callibration.y,
                                        z: mouseTranslation.z - callibration.z
                                    },
                                    rotation: mouseRotation
                                });
                            }
                        };
                    }
                }

            });
        }

        socketServer();
    });
}

