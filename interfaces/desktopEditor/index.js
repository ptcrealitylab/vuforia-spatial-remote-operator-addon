/**
 * Created by Ben Reynolds on 10/01/18.
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
    
    console.log('addonFolders', addonFolders);

    // Set this in Documents/realityobjects/.identity/desktopEditor/settings.json. Give it contents like:
    /**
        {
            'enabled': 'true',
            'userinterfacePath': '/Users/Benjamin/Code/github-ptc/of_v0.9.8_ios/apps/myApps/realityeditor-ios/bin/data/userinterface'
        }
     */
    const userinterfacePath = settings('userinterfacePath');
    
    // userinterfacePath = 'F:/RealityBeast/UI';

    try {
        const localUIApp = new LocalUIApp(userinterfacePath, addonFolders);
        localUIApp.setup();
        
        console.log('SUCCESSFULLY CREATED LOCAL_UI_APP');

        // add the middleware
        // use the CORS cross origin REST model
        startHTTPServer(localUIApp, 8081);
    } catch (e) {
        console.warn('CANNOT START DESKTOP EDITOR ON PORT 8081: ', e);
    }

}

function startHTTPServer(localUIApp, port) {
    let mouseTranslation = null;
    let mouseRotation = null;
    let mouseConnected = false;

    const http = require('http').Server(localUIApp.app);
    const io = require('socket.io')(http);

    // httpServers[port] = http;
    // ioSockets[port] = io;

    http.listen(port, function() {
        console.log('~~~ started desktop reality editor on port ' + port);

        server.subscribeToMatrixStream(function(visibleObjects) {
            // console.log('desktop editor is viewing ' + Object.keys(visibleObjects).length + ' objects');
            io.emit('visibleObjects', visibleObjects);
        });

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
                    // console.log(msgContent);

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

                var callibrationFrames = 100;

                try {
                    connectTo6DMouse();
                } catch (e) {
                    console.log('Did not connect to input hardware. Control remote operator with mouse' +
                        ' scroll whell, right-click drag and shift-right-click-drag');
                }
                function connectTo6DMouse() {
                    if (!mouseConnected) {
                        mouseConnected = true;
                        var sm = require('../6DMouse/3DConnexion.js');
                        var callibration = null;
                        sm.spaceMice.onData = function(mouse) {
                            // translation
                            // console.log('desktop editor translate', JSON.stringify(mouse.mice[0]['translate']));
                            // rotation
                            // console.log('desktop editor rotate', JSON.stringify(mouse.mice[0]['rotate']));
                            mouseTranslation = mouse.mice[0]['translate'];
                            mouseRotation = mouse.mice[0]['rotate'];

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

                                // var threshold = 0.1;
                                // if (Math.abs(mouseTranslation.x) < threshold) {
                                //     mouseTranslation.x = 0;
                                // }
                                // if (Math.abs(mouseTranslation.y) < threshold) {
                                //     mouseTranslation.y = 0;
                                // }
                                // if (Math.abs(mouseTranslation.z) < threshold) {
                                //     mouseTranslation.z = 0;
                                // }
                                //
                                // if (Math.abs(mouseRotation.x) < threshold) {
                                //     mouseRotation.x = 0;
                                // }
                                // if (Math.abs(mouseRotation.y) < threshold) {
                                //     mouseRotation.y = 0;
                                // }
                                // if (Math.abs(mouseRotation.z) < threshold) {
                                //     mouseRotation.z = 0;
                                // }

                                // mouseTranslation.z += 0.3;

                                // console.log({
                                //     x: mouseTranslation.x - callibration.x,
                                //     y: mouseTranslation.y - callibration.y,
                                //     z: mouseTranslation.z - callibration.z
                                // });

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

