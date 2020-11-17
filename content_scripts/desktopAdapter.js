createNameSpace('realityEditor.device.desktopAdapter');

/**
 * @fileOverview realityEditor.device.desktopAdapter.js
 * If the editor frontend is loaded on a desktop browser, re-maps some native functions, adjusts some CSS, and
 * waits for a connection from a mobile editor that will stream matrices here
 */

var mRot = function(pitch, roll, yaw) {
    return realityEditor.gui.ar.utilities.getMatrixFromQuaternion(realityEditor.gui.ar.utilities.getQuaternionFromPitchRollYaw(pitch * Math.PI / 180, roll * Math.PI / 180, yaw * Math.PI / 180));
};

(function(exports) {
    // Automatically connect to all discovered reality zones
    const AUTO_ZONE_CONNECT = true;
    
    /**
     * @type {number} - the handle for the setInterval for mobile editors to connect to desktops
     */
    var broadcastInterval;

    /**
     * @type {boolean} - when paused, desktops ignore matrices received from mobile editors and use their own
     */
    var isPaused = false;

    /**
     * @type {Dropdown} - DOM element to start connecting to Reality Zones and select among possible connections
     */
    var zoneDropdown;

    /**
     * @type {Dropdown} - DOM element to start connecting to phone matrices and select among possible connections
     */
    var deviceDropdown;

    var currentConnectedDeviceIP;

    // polyfill for requestAnimationFrame to provide a smooth update loop
    var requestAnimationFrame = window.requestAnimationFrame ||
        window.webkitRequestAnimationFrame || function(cb) {setTimeout(cb, 17);};

    // holds the most recent set of objectId/matrix pairs so that they can be rendered on the next frame
    var visibleObjects = {};

    // Refresh after 1 hour of no activity
    const IDLE_TIMEOUT_MS = 60 * 60 * 1000;
    // Stores timeout id for idle detection
    let idleTimeout = null;
    let savedZoneSocketIPs = [];

    /**
     * @type {CallbackHandler}
     */
    var callbackHandler = new realityEditor.moduleCallbacks.CallbackHandler('device/desktopAdapter');

    /**
     * Adds a callback function that will be invoked when the specified function is called
     * @param {string} functionName
     * @param {function} callback
     */
    function registerCallback(functionName, callback) {
        if (!callbackHandler) {
            callbackHandler = new realityEditor.moduleCallbacks.CallbackHandler('device/desktopAdapter');
        }
        callbackHandler.registerCallback(functionName, callback);
    }

    function isDesktop() {
        return window.navigator.userAgent.indexOf('Mobile') === -1 || window.navigator.userAgent.indexOf('Macintosh') > -1;
    }
    
    let env = realityEditor.device.environment.variables;

    /**
     * initialize the desktop adapter only if we are running on a desktop environment
     */
    function initService() {
        if (isDesktop()) {
            env.requiresMouseEvents = true; // this fixes touch events to become mouse events
            env.supportsDistanceFading = false; // this prevents things from disappearing when the camera zooms out
            env.ignoresFreezeButton = true; // this 
            env.shouldDisplayLogicMenuModally = true;
            env.lineWidthMultiplier = 5;
            env.distanceScaleFactor = 10;
            env.localServerPort = 8080; // this would let it find world_local if it exists
            env.shouldCreateDesktopSocket = true; // this lets UDP messages get sent over socket instead

            // default values that I may or may not need to invert:
            // env.providesOwnUpdateLoop: false,
            // shouldBroadcastUpdateObjectMatrix: false,
            // doWorldObjectsRequireCameraTransform: false,
            // distanceRequiresCameraTransform: false,
        } else {

            // // TODO: replace this with a better version that isn't reliant on editor being open at same time
            // // for NON desktop editors, they should broadcast their visible object matrices when enabled
            // realityEditor.gui.ar.draw.addUpdateListener(function(visibleObjects) {
            //     if (globalStates.matrixBroadcastEnabled) {
            //         broadcastMatrices(visibleObjects);
            //     }
            // });

            return;
        }
        
        restyleForDesktop();
        modifyGlobalNamespace();

        setTimeout(function() {
            addSocketListeners(); // HACK. this needs to happen after realtime module finishes loading
        }, 100);
        
        addZoneDiscoveredListener();
        addZoneControlListener();

        // TODO: is this really the best way to do this? data should come from server, not browser storage
        // visibleObjects = JSON.parse(window.localStorage.getItem('realityEditor.desktopAdapter.savedMatrices') || '{}');

        savedZoneSocketIPs = JSON.parse(window.localStorage.getItem('realityEditor.desktopAdapter.savedZoneSocketIPs') || '[]');

        // Reset savedZoneSocketIPs so that they are only persisted on idle refresh
        window.localStorage.setItem('realityEditor.desktopAdapter.savedZoneSocketIPs', '[]');

        if (savedZoneSocketIPs.length > 0) {
            // Use the normal broadcast/receive message flow so that we
            // know the savedZoneSocketIP still exists
            setTimeout(function() {
                startBroadcastingZoneConnect();
                setTimeout(function() {
                    stopBroadcastingZoneConnect();
                }, 1000);
            }, 1000);
        }

        var desktopProjectionMatrix = projectionMatrixFrom(25, -window.innerWidth / window.innerHeight, 0.1, 300000);
        console.log('desktop matrix', desktopProjectionMatrix);

        // noinspection JSSuspiciousNameCombination
        globalStates.height = window.innerWidth;
        // noinspection JSSuspiciousNameCombination
        globalStates.width = window.innerHeight;

        realityEditor.gui.ar.setProjectionMatrix(desktopProjectionMatrix);

        // add a keyboard listener to toggle visibility of the zone/phone discovery buttons
        realityEditor.device.keyboardEvents.registerCallback('keyUpHandler', function(params) {
            if (params.event.code === 'KeyV') {

                if (zoneDropdown) {
                    if (zoneDropdown.dom.style.display !== 'none') {
                        zoneDropdown.dom.style.display = 'none';
                        realityEditor.device.desktopStats.hide(); // also toggle stats
                    } else {
                        zoneDropdown.dom.style.display = '';
                        realityEditor.device.desktopStats.show();
                    }
                }

                if (deviceDropdown) {
                    if (deviceDropdown.dom.style.display !== 'none') {
                        deviceDropdown.dom.style.display = 'none';
                    } else {
                        deviceDropdown.dom.style.display = '';
                    }
                }
            }
        });

        update();
    }

    /**
     * Builds a projection matrix from field of view, aspect ratio, and near and far planes
     */
    function projectionMatrixFrom(vFOV, aspect, near, far) {
        console.log(Math.DEG2RAD);
        var top = near * Math.tan((Math.PI / 180) * 0.5 * vFOV );
        console.log('top', top);
        var height = 2 * top;
        var width = aspect * height;
        var left = -0.5 * width;
        console.log(vFOV, aspect, near, far);
        return makePerspective( left, left + width, top, top - height, near, far );
    }

    /**
     * Helper function for creating a projection matrix
     */
    function makePerspective ( left, right, top, bottom, near, far ) {

        var te = [];
        var x = 2 * near / ( right - left );
        var y = 2 * near / ( top - bottom );

        var a = ( right + left ) / ( right - left );
        var b = ( top + bottom ) / ( top - bottom );
        var c = - ( far + near ) / ( far - near );
        var d = - 2 * far * near / ( far - near );

        console.log(x, y, a, b, c);

        te[ 0 ] = x;    te[ 4 ] = 0;    te[ 8 ] = a;    te[ 12 ] = 0;
        te[ 1 ] = 0;    te[ 5 ] = y;    te[ 9 ] = b;    te[ 13] = 0;
        te[ 2 ] = 0;    te[ 6 ] = 0;    te[ 10 ] = c;   te[ 14 ] = d;
        te[ 3 ] = 0;    te[ 7 ] = 0;    te[ 11 ] = - 1; te[ 15 ] = 0;

        return te;

    }

    function sendZoneCommand(command) {
        realityEditor.network.realtime.sendMessageToSocketSet('realityZones', 'message', command);
    }

    function addZoneControlListener() {
        document.addEventListener('keydown', function(event) {
            switch (event.key) {
            case 'n':
                sendZoneCommand('toggleLines');
                break;
            case 'q':
                sendZoneCommand('resetLines');
                break;
            case 'm':
                sendZoneCommand('toggleXRayView');
                break;
            case 'b':
                sendZoneCommand('toggleSkeletons');
                break;
            case ' ':
                sendZoneCommand('toggleDemoMode');
                break;
            }
        });
    }

    /**
     * Adjust visuals for desktop rendering -> set background color and add "Waiting for Connection..." indicator
     */
    function restyleForDesktop() {
        document.body.style.backgroundColor = 'rgb(50,50,50)';
        document.getElementById('canvas').style.backgroundColor = 'transparent';
        document.getElementById('canvas').style.transform = 'matrix3d(1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, -1, 1)'; // set Z to 1 to render in front
        document.getElementById('canvas').style.pointerEvents = 'none';

        var DISABLE_SAFE_MODE = true;
        if (!DISABLE_SAFE_MODE) {
            if (window.outerWidth !== document.body.offsetWidth) {
                alert('Reset browser zoom level to get accurate calculations');
            }
        }

        // TODO: remove memory bar from pocket... instead maybe be able to save camera positions?
        
        createZoneConnectionDropdown();
    }

    /**
     * Re-maps native app calls to functions within this file.
     * E.g. calling realityEditor.app.setPause() will be rerouted to this file's setPause() function.
     * @todo Needs to be manually modified as more native calls are added. Add one switch case per native app call.
     */
    function modifyGlobalNamespace() {

        // set up object structure if it doesn't exist yet
        window.webkit = {
            messageHandlers: {
                realityEditor: {}
            }
        };

        // intercept postMessage calls to the messageHandlers and manually handle each case by functionName
        window.webkit.messageHandlers.realityEditor.postMessage = function(messageBody) {
            // console.log('intercepted message to native -> ', messageBody);

            switch (messageBody.functionName) {
            case 'setPause':
                setPause();
                break;
            case 'setResume':
                setResume();
                break;
            case 'getVuforiaReady':
                getVuforiaReady(messageBody.arguments);
                break;
            case 'sendUDPMessage':
                sendUDPMessage(messageBody.arguments);
                break;
                // case 'getUDPMessages':
                //     getUDPMessages(messageBody.callback);
            default:
                // console.log('could not find desktop implementation of app.' + messageBody.functionName);
                return;
            }
        };

        // polyfill webkit functions on Chrome browser
        // if (typeof window.webkitConvertPointFromPageToNode === 'undefined') {
        //     console.log('Polyfilling webkitConvertPointFromPageToNode for this browser');
        //
        //     polyfillWebkitConvertPointFromPageToNode();
        //
        //     var ssEl = document.createElement('style'),
        //         css = '.or{position:absolute;opacity:0;height:33.333%;width:33.333%;top:0;left:0}.or.r-2{left:33.333%}.or.r-3{left:66.666%}.or.r-4{top:33.333%}.or.r-5{top:33.333%;left:33.333%}.or.r-6{top:33.333%;left:66.666%}.or.r-7{top:66.666%}.or.r-8{top:66.666%;left:33.333%}.or.r-9{top:66.666%;left:66.666%}';
        //     ssEl.type = 'text/css';
        //     (ssEl.styleSheet) ?
        //         ssEl.styleSheet.cssText = css :
        //         ssEl.appendChild(document.createTextNode(css));
        //     document.getElementsByTagName('head')[0].appendChild(ssEl);
        // }
        
        // pocketBegin = [4809.935578545477, -21.448650897337046, 0.4699633267584691, 0.46996614495062317, -44.91500625468903, 4866.661791176597, 0.11589206604418023, 0.11589146054651356, 1868.0710976511762, 151.4880583152451, 3.796594149786673, 3.7967717726783503, 253912.5079441294, -209710.60820716852, 4880.993541501766, 4881.118759195814];
        
        // realityEditor.gui.ar.draw.correctedCameraMatrix = realityEditor.gui.ar.utilities.newIdentityMatrix();

        // realityEditor.gui.ar.draw.groundPlaneMatrix = realityEditor.gui.ar.draw.correctedCameraMatrix; // ground plane just points to camera matrix on desktop

        // rotateX = mRot(0,0,-90);

        // rotateX = mRot(0,-90,0);

        // rotateX = mFlipYZ;
        // realityEditor.gui.ar.draw.rotateX_desktopWorld = rotateX;

        // TODO ben: determine if rotoateX in sceneGraph needs to be updated like this
        rotateX = [
            1, 0, 0, 0,
            0, -1, 0, 0,
            0, 0, -1, 0,
            0, 0, 0, 1
        ];
        realityEditor.gui.ar.draw.rotateX = rotateX;

        // desktopFrameTransform = mRot(0,0,90); // fixes the rotation but too late, not the resulting translation

        // desktopFrameTransform = mFlipYZ;
    }

    // /**
    //  * Based off of https://gist.github.com/Yaffle/1145197 with modifications to
    //  * support more complex matrices
    //  */
    // function polyfillWebkitConvertPointFromPageToNode() {
    //     const identity = new DOMMatrix([
    //         1, 0, 0, 0,
    //         0, 1, 0, 0,
    //         0, 0, 1, 0,
    //         0, 0, 0, 1
    //     ]);
    //
    //     if (!window.WebKitPoint) {
    //         window.WebKitPoint = DOMPoint;
    //     }
    //
    //     function getTransformationMatrix(element) {
    //         var transformationMatrix = identity;
    //         var x = element;
    //
    //         while (x !== undefined && x !== x.ownerDocument.documentElement) {
    //             var computedStyle = window.getComputedStyle(x);
    //             var transform = computedStyle.transform || "none";
    //             var c = transform === "none" ? identity : new DOMMatrix(transform);
    //
    //             transformationMatrix = c.multiply(transformationMatrix);
    //             x = x.parentNode;
    //         }
    //
    //         // Normalize current matrix to have m44=1 (w = 1). Math does not work
    //         // otherwise because nothing knows how to scale based on w
    //         let baseArr = transformationMatrix.toFloat64Array();
    //         baseArr = baseArr.map(b => b / baseArr[15]);
    //         transformationMatrix = new DOMMatrix(baseArr);
    //
    //         var w = element.offsetWidth;
    //         var h = element.offsetHeight;
    //         var i = 4;
    //         var left = +Infinity;
    //         var top = +Infinity;
    //         while (--i >= 0) {
    //             var p = transformationMatrix.transformPoint(new DOMPoint(i === 0 || i === 1 ? 0 : w, i === 0 || i === 3 ? 0 : h, 0));
    //             if (p.x < left) {
    //                 left = p.x;
    //             }
    //             if (p.y < top) {
    //                 top = p.y;
    //             }
    //         }
    //         var rect = element.getBoundingClientRect();
    //         transformationMatrix = identity.translate(window.pageXOffset + rect.left - left, window.pageYOffset + rect.top - top, 0).multiply(transformationMatrix);
    //         return transformationMatrix;
    //     }
    //
    //     window.convertPointFromPageToNode = window.webkitConvertPointFromPageToNode = function (element, point) {
    //         let mati = getTransformationMatrix(element).inverse();
    //         // This involves a lot of math, sorry.
    //         // Given $v = M^{-1}p$ we have p.x, p.y, p.w, M^{-1}, and know that v.z
    //         // should be equal to 0.
    //         // Solving for p.z we get the following:
    //         let projectedZ = -(mati.m13 * point.x + mati.m23 * point.y + mati.m43) / mati.m33;
    //         return mati.transformPoint(new DOMPoint(point.x, point.y, projectedZ));
    //     };
    //
    //     window.convertPointFromNodeToPage = function (element, point) {
    //         return getTransformationMatrix(element).transformPoint(point);
    //     };
    // }

    /**
     * Adds socket.io listeners for matrix streams and UDP messages necessary to setup editor without mobile environment
     * (e.g. object discovery)
     */
    function addSocketListeners() {

        realityEditor.network.realtime.addDesktopSocketMessageListener('/matrix/visibleObjects', function(msgContent) {
            console.log('received matrix message: ' + msgContent);
            // serverSocket.on('/matrix/visibleObjects', function(msgContent) {
            if (!isPaused) {
                if (msgContent.ip && msgContent.port) {
                    if (isConnectedDeviceIP(msgContent.ip, msgContent.port)) { //or if they are coming from the zone ip?
                        visibleObjects = msgContent.visibleObjects; // new matrices update as fast as they can be received

                        if (saveNextMatrices) {
                            // window.localStorage.setItem('realityEditor.desktopAdapter.savedMatrices', JSON.stringify(visibleObjects));
                            saveNextMatrices = false;
                        }
                    }
                }
            }
        });

        realityEditor.network.addObjectDiscoveredCallback(function(object, objectKey) {
            console.log('object discovered: ' + objectKey + ' (desktop)');

            // make objects show up by default at the origin
            if (object.matrix.length === 0) {
                console.log('putting object ' + object.name + ' at the origin');
                object.matrix = realityEditor.gui.ar.utilities.newIdentityMatrix();
                visibleObjects[objectKey] = realityEditor.gui.ar.utilities.newIdentityMatrix();
            }

            // subscribe to new object matrices to update where the object is in the world
            realityEditor.network.realtime.subscribeToObjectMatrices(objectKey, function(data) {
                if (globalStates.freezeButtonState) { return; }

                var msgData = JSON.parse(data);
                if (msgData.objectKey === objectKey && msgData.propertyPath === 'matrix') {

                    // emit an event if this is a newly "discovered" matrix
                    if ((!object.matrix || object.matrix.length !== 16) && msgData.newValue.length === 16) {
                        console.log('discovered a matrix for an object that didn\'t have one before');
                        callbackHandler.triggerCallbacks('objectMatrixDiscovered', {objectKey: msgData.objectKey});
                    }
                    
                    // TODO: set sceneGraph localMatrix to msgData.newValue
                    // var rotatedObjectMatrix = realityEditor.gui.ar.utilities.copyMatrix(msgData.newValue);
                    // object.matrix = rotatedObjectMatrix;
                    // visibleObjects[msgData.objectKey] = rotatedObjectMatrix;
                    
                    visibleObjects[msgData.objectKey] = realityEditor.gui.ar.utilities.newIdentityMatrix();
                }
            });
        });

        realityEditor.network.realtime.addDesktopSocketMessageListener('udpMessage', function(msgContent) {

            if (typeof msgContent.id !== 'undefined' &&
                typeof msgContent.ip !== 'undefined') {
                realityEditor.network.addHeartbeatObject(msgContent);
            }

            // TODO: understand what this is doing and if it's still necessary
            if (!currentConnectedDeviceIP) {
                if (typeof msgContent.projectionMatrix !== 'undefined') {
                    if (typeof msgContent.ip !== 'undefined' && typeof msgContent.port !== 'undefined') {

                        if (isConnectedDeviceIP(msgContent.ip, msgContent.port)) {

                            window.localStorage.setItem('realityEditor.desktopAdapter.projectionMatrix', JSON.stringify(msgContent.projectionMatrix));
                            window.localStorage.setItem('realityEditor.desktopAdapter.realProjectionMatrix', JSON.stringify(msgContent.realProjectionMatrix));
                            console.log('projection matrix:', msgContent.realProjectionMatrix);

                            console.log('msgContent.projectionMatrix', msgContent);
                            console.log('finished connecting to ' + msgContent);
                            currentConnectedDeviceIP = msgContent.ip;

                            _saveMatrixInterval = setInterval(function() {
                                saveNextMatrices = true;
                            }, 5000);
                        }
                    }
                }
            }

            if (typeof msgContent.action !== 'undefined') {
                console.log(msgContent.action);
                if (typeof msgContent.action === 'string') {
                    try {
                        msgContent.action = JSON.parse(msgContent.action);
                    } catch (e) {
                        // console.log('dont need to parse');
                    }
                }
                realityEditor.network.onAction(msgContent.action);
            }

            // forward the message to a generic message handler that various modules use to subscribe to different messages
            realityEditor.network.onUDPMessage(msgContent);

        });

    }

    var _saveMatrixInterval = null;
    var saveNextMatrices = false;

    function areIPsEqual(ip1, ip2) {
        if (ip1 === ip2) {
            return true;
        }

        // try popping off the http, etc
        var split1 = ip1.split('://');
        var split2 = ip2.split('://');
        return (split1[split1.length - 1] === split2[split2.length - 1]);
    }

    function isConnectedDeviceIP(ip, port) {
        // return (currentConnectedDeviceIP && currentConnectedDeviceIP === ip);
        var deviceMessageIsFrom = ip;
        if (port) {
            deviceMessageIsFrom += ':' + port;
        }

        if (deviceDropdown.selected) {
            var selectedDevice = deviceDropdown.selected.element.id;
            // console.log('selected device is ' + selectedDevice);

            if (areIPsEqual(selectedDevice, deviceMessageIsFrom)) {
                return true;
            }
        }

        return false;
    }
    
    /**
     * The 60 FPS render loop. Smoothly calls realityEditor.gui.ar.draw.update to render the most recent visibleObjects
     * Also smoothly updates camera postion when paused
     */
    function update() {

        // send the visible object matrices to connected reality zones, if any // TODO: there actually only needs to be one, not a set...
        if (realityEditor.network.realtime.getSocketIPsForSet('realityZones').length > 0) {
            sendMatricesToRealityZones();
        }
        
        // TODO: ensure that visibleObjects that aren't known objects get filtered out

        // trigger main update function after a 100ms delay, to synchronize with the approximate lag of the realityZone image processing
        // updateAfterDelay(visibleMatrixCopy, 100);
        updateAfterDelay(visibleObjects, 100);

        // repeat loop on next render
        requestAnimationFrame(update);
    }

    function updateAfterDelay(matrices, delayInMs) {
        setTimeout(function() {
            realityEditor.gui.ar.draw.update(matrices);
        }, delayInMs);
    }

    /**
     * Sends the current matrix set to all connected desktop editors
     * @param {Object.<string, Array.<number>>} visibleObjects
     */
    function broadcastMatrices(visibleObjects) {
        var eventName = '/matrix/visibleObjects';
        var messageBody = {visibleObjects: visibleObjects, ip: window.location.hostname, port: window.location.port};
        realityEditor.network.realtime.sendMessageToSocketSet('desktopEditors', eventName, messageBody);
    }
    
    /**
     * Creates a switch that, when activated, begins broadcasting UDP messages
     * to discover any Reality Zones in the network for volumetric rendering
     */
    function createZoneConnectionDropdown() {
        if (!zoneDropdown) {

            var textStates = {
                collapsedUnselected: 'Search for Reality Zones',
                expandedEmpty: 'Searching for Zones...',
                expandedOptions: 'Select a Zone',
                selected: 'Connected: '
            };

            zoneDropdown = new realityEditor.gui.dropdown.Dropdown('zoneDropdown', textStates, {left: '30px', top: '30px'}, document.body, true, onZoneSelectionChanged, onZoneExpandedChanged);

        }
    }

    function onZoneSelectionChanged(selected) {
        // TODO: connect to the web socket for the zone at that IP

        if (selected && selected.element) {
            var zoneIp = selected.element.id;
            if (zoneIp) {
                establishConnectionWithZone(zoneIp);
            }
        }
    }

    function onZoneExpandedChanged(isExpanded) {
        if (isExpanded) {
            // start a loop to ping the zones every 3 seconds, and listen for their responses
            startBroadcastingZoneConnect(); // TODO: do this from the start, dont wait until click on dropdown
        } else {
            stopBroadcastingZoneConnect();
        }
    }

    var zoneBroadcastInterval = null;
    var isSearchingForZones = false;

    function stopBroadcastingZoneConnect() {
        clearInterval(zoneBroadcastInterval);
        zoneBroadcastInterval = null;
        isSearchingForZones = false;
    }

    /**
     * Starts a heartbeat message loop that broadcasts out zoneConnect messages to volumetric rendering zones in the network
     * Also creates a UDP listener for zoneResponse action messages, which upon receiving will establish a web socket
     */
    function startBroadcastingZoneConnect() {
        if (isSearchingForZones) { return; }

        isSearchingForZones = true;

        // pulse visuals once immediately to show it has activated
        // send one immediately to establish the connection faster
        sendSingleZoneConnectBroadcast();
        pulseButton(zoneDropdown.textDiv);

        // every 3 seconds, send out another UDP message and pulse visuals to show it is still in progress
        zoneBroadcastInterval = setInterval(function() {
            sendSingleZoneConnectBroadcast();
            pulseButton(zoneDropdown.textDiv);
        }, 3000);
    }

    function pulseButton(domElement) {
        domElement.classList.add('connectionSwitchPulse');
        setTimeout(function() {
            domElement.classList.remove('connectionSwitchPulse');
        }, 1500);
    }

    function addZoneDiscoveredListener() {
        // when an action message is detected with a zoneResponse, establish a web socket connection with that zone
        realityEditor.network.addUDPMessageHandler('action', function(message) {
            if (!isSearchingForZones) { return; }
            if (typeof message.action !== 'undefined') {
                if (typeof message.action.action !== 'undefined') {
                    message = message.action;
                }
            }
            if (typeof message.action !== 'undefined' && message.action === 'zoneDiscovered' && message.ip && message.port) {
                // console.log('zoneDiscoveredListener', message);

                // create a new web socket with the zone at the specified address received over UDP
                var potentialZoneAddress = 'http://' + message.ip + ':' + message.port;

                var alreadyContainsIP = zoneDropdown.selectables.map(function(selectableObj) {
                    return selectableObj.id;
                }).indexOf(potentialZoneAddress) > -1;

                if (!alreadyContainsIP) {
                    zoneDropdown.addSelectable(potentialZoneAddress, potentialZoneAddress);
                }
                if (savedZoneSocketIPs.includes(potentialZoneAddress) || AUTO_ZONE_CONNECT) {
                    establishConnectionWithZone(potentialZoneAddress);
                }
            }
        });
    }

    function establishConnectionWithZone(zoneIp) {
        var socketsIps = realityEditor.network.realtime.getSocketIPsForSet('realityZones');

        // only establish a new connection if we don't already have one with that server
        if (socketsIps.indexOf(zoneIp) < 0) {
            console.log('zoip', zoneIp);
            let socketId = zoneIp.includes('10.10.10.105') ? 'primary' : 'secondary';

            // zoneConnectionSwitch.innerHTML = '[CONNECTED TO ZONE]';

            // create the web socket to send matrices to the discovered reality zone
            realityEditor.network.realtime.createSocketInSet('realityZones', zoneIp, function(socket) {
                // on connect
                realityEditor.network.realtime.sendMessageToSocketSet('realityZones', 'name', {
                    type: 'viewer',
                    editorId: globalStates.tempUuid
                });

                socket.on('image', function(data) {
                    realityEditor.gui.ar.desktopRenderer.processImageFromSource(socketId, data);
                });

                socket.on('error', function(data) {
                    console.warn(data);
                });

            });

            // realityEditor.network.realtime.addDesktopSocketMessageListener('image', function(msgContent) {
            //     realityEditor.gui.ar.desktopRenderer.renderImageInBackground(msgContent);
            // });
            //
            // realityEditor.network.realtime.addDesktopSocketMessageListener('error', function(msgContent) {
            //     console.warn('ERROR (Reality Zone ' + zoneIp + '): ' + msgContent);
            // });
            //
            // realityEditor.network.realtime.addDesktopSocketMessageListener('error', function(msgContent) {
            //     console.warn('ERROR (Reality Zone ' + zoneIp + '): ' + msgContent);
            // });

            // TODO: immediately sends the most recent matrices as a test, but in future just send in render loop?
            sendMatricesToRealityZones();
        }
    }

    /**
     * Broadcasts a zoneConnect message over UDP.
     * Includes the editorId in case the Reality Zone wants to adjust its response based on the ID of the client who sent the message.
     */
    function sendSingleZoneConnectBroadcast() {

        var advertiseConnectionMessage = {
            action: 'advertiseEditor',
            clientType: 'desktop', // or 'mobile' in the future when we want to
            resolution: {
                width: window.innerWidth,
                height: window.innerHeight
            },
            editorId: globalStates.tempUuid
        };
        realityEditor.app.sendUDPMessage(advertiseConnectionMessage);

    }

    /**
     * Sends the visible matrices to any reality zones that the desktop client has formed a web socket connection with.
     * @todo: should we just send the camera position instead? or just one matrix (one matrix -> one image)
     */
    function sendMatricesToRealityZones() {

        let cameraNode = realityEditor.sceneGraph.getSceneNodeById('CAMERA');
        let currentCameraMatrix = realityEditor.gui.ar.utilities.copyMatrix(cameraNode.localMatrix);
        
        // TODO: move this to the update loop and send every frame if we have established a connection with a reality zone
        var messageBody = {
            cameraPoseMatrix: currentCameraMatrix, // doesnt matter
            realProjectionMatrix: globalStates.realProjectionMatrix, // doesnt matter
            projectionMatrix: globalStates.projectionMatrix, // uses this
            visibleObjectMatrices: realityEditor.gui.ar.draw.visibleObjects, // this should contain modelViewMatrix
            resolution: {
                width: window.innerWidth,
                height: window.innerHeight
            },
            editorId: globalStates.tempUuid
        };

        realityEditor.network.realtime.sendMessageToSocketSet('realityZones', 'poseVuforiaCamera', messageBody);
    }

    /**
     * Overrides realityEditor.app.setPause -> ignores matrix stream while paused
     */
    function setPause() {
        isPaused = true;
    }

    /**
     * Overrides realityEditor.app.setResume -> stops ignoring matrix stream.
     * Also resets any camera position information so that next time you freeze it doesn't jump to old camera position
     */
    function setResume() {
        isPaused = false;
    }

    function createNativeAPISocket() {
        // lazily instantiate the socket to the server if it doesn't exist yet
        var socketsIps = realityEditor.network.realtime.getSocketIPsForSet('nativeAPI');
        // var hostedServerIP = 'http://127.0.0.1:' + window.location.port;
        var hostedServerIP = 'http://' + window.location.host; //'http://127.0.0.1:' + window.location.port;

        if (socketsIps.indexOf(hostedServerIP) < 0) {
            realityEditor.network.realtime.createSocketInSet('nativeAPI', hostedServerIP);
            realityEditor.network.realtime.addDesktopSocketMessageListener('test', function(message) {
                console.log('received message from socketMessageListener', message);
            });
        }
    }

    function sendUDPMessage(args) {
        createNativeAPISocket();
        realityEditor.network.realtime.sendMessageToSocketSet('nativeAPI', '/nativeAPI/sendUDPMessage', args.message);
    }

    function getVuforiaReady(_args) {
        // just immediately call the callback because vuforia will never load on the desktop

        // this is the only functionality we still need from the original callback (realityEditor.app.callbacks.vuforiaIsReady)
        realityEditor.app.getUDPMessages('realityEditor.app.callbacks.receivedUDPMessage');
    }

    /**
     * Broadcasts this editor's projection matrix to all desktop editors, so that they can use it.
     * Checks if there are any objects from new servers, and establishes a socket connection to their desktop clients.
     * Should be called on mobile editors only.
     */
    function broadcastEditorInformation() {

        realityEditor.app.sendUDPMessage({
            action: 'mobileEditorDiscovered',
            ip: window.location.hostname,
            port: parseInt(window.location.port),
            // uuid: globalStates.tempUuid
            projectionMatrix: globalStates.projectionMatrix,
            realProjectionMatrix: globalStates.realProjectionMatrix
        });

        var ipList = [];
        realityEditor.forEachObject(function(object, _objectKey) {
            if (ipList.indexOf(object.ip) === -1) {
                ipList.push(object.ip);
            }
        });

        var desktopEditorPort = 8081;
        ipList.forEach(function(ip) {
            var potentialDesktopEditorAddress = 'http://' + ip + ':' + desktopEditorPort;
            var socketsIps = realityEditor.network.realtime.getSocketIPsForSet('desktopEditors');
            if (socketsIps.indexOf(potentialDesktopEditorAddress) < 0) {
                realityEditor.network.realtime.createSocketInSet('desktopEditors', potentialDesktopEditorAddress);
            }
        });
    }

    function resetIdleTimeout() {
        if (idleTimeout) {
            clearTimeout(idleTimeout);
        }
        idleTimeout = setTimeout(storeZonesAndRefresh, IDLE_TIMEOUT_MS);
    }

    /**
     * Store enough data to refresh without losing a significant amount of
     * state then refresh
     */
    function storeZonesAndRefresh() {
        // Zone connections to restore background image
        const zoneSocketIPs = realityEditor.network.realtime.getSocketIPsForSet('realityZones');
        window.localStorage.setItem('realityEditor.desktopAdapter.savedZoneSocketIPs', JSON.stringify(zoneSocketIPs));
        window.location.reload();
    }

    // exports.updateObjectMatrix = function(objectKey, pitch, roll, yaw) {
    //     var object = realityEditor.getObject(objectKey);
    //     var rotatedObjectMatrix = realityEditor.gui.ar.utilities.copyMatrix(object.matrix);
    //
    //     // var rotatedObjectMatrix = [];
    //     var rotation3d = [
    //         1, 0, 0, 0,
    //         0, 0, -1, 0,
    //         0, -1, 0, 0,
    //         0, 0, 0, 1
    //     ];
    //     realityEditor.gui.ar.utilities.multiplyMatrix(rotation3d, object.matrix, rotatedObjectMatrix);
    //     var rotation2d = mRot(pitch, roll, yaw);
    //     realityEditor.gui.ar.utilities.multiplyMatrix(rotation2d, rotatedObjectMatrix, rotatedObjectMatrix);
    //     var oldZ = rotatedObjectMatrix[14];
    //     rotatedObjectMatrix[14] = -rotatedObjectMatrix[13];
    //     rotatedObjectMatrix[13] = -oldZ;
    //
    //     console.log('object ' + objectKey + 'is at (' + rotatedObjectMatrix[12] / rotatedObjectMatrix[15] + ', ' + rotatedObjectMatrix[13] / rotatedObjectMatrix[15] + ', ' + rotatedObjectMatrix[14] / rotatedObjectMatrix[15] + ')');
    //
    //     visibleObjects[objectKey] = rotatedObjectMatrix;
    // };

    // Currently unused
    exports.registerCallback = registerCallback;

    exports.resetIdleTimeout = resetIdleTimeout;
    
    exports.isDesktop = isDesktop;

    // this happens only for desktop editors
    realityEditor.addons.addCallback('init', initService);
}(realityEditor.device.desktopAdapter));
