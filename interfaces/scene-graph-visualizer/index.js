/**
 * Created by Ben Reynolds on 11/9/20.
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

/**
 * Set to true to enable the hardware interface
 **/
var server = require('../../../../libraries/hardwareInterfaces');
var utilities = require('../../../../libraries/utilities');
var settings = server.loadHardwareInterface(__dirname);

exports.enabled = settings("enabled");
exports.configurable = true; // can be turned on/off/adjusted from the web frontend

if (exports.enabled) {

    var express = require('express');
    var app = express();
    var bodyParser = require('body-parser');
    var cors = require('cors');             // Library for HTTP Cross-Origin-Resource-Sharing
    // add the middleware
    // use the CORS cross origin REST model
    app.use(cors());
    // allow requests from all origins with '*'. TODO make it dependent on the local network. this is important for security
    app.options('*', cors());
    app.use(express.static(__dirname + '/public'));
    app.use(bodyParser.json());
    app.use(bodyParser.urlencoded({ extended: true }));
    
    startHTTPServer(8083);

    function startHTTPServer(port) {
        
        console.log('startHTTPServer on port ' + port + ' with dir: ' + __dirname);

        var http = require('http').Server(app);
        var io = require('socket.io')(http);

        http.listen(port, function () {
            console.log('started sceneGraph debugger on port ' + port);

            server.subscribeToMatrixStream(function(visibleObjects) {
                io.emit('visibleObjects', visibleObjects);
            });

            server.subscribeToUDPMessages(function(msgContent) {
                io.emit('udpMessage', msgContent);
            });

            function socketServer() {

                io.on('connection', function (socket) {

                    console.log('connected to socket ' + socket.id);
                    io.emit('newValue', 1234);
                    
                    socket.on('/spatial/distance/oneToMany', function(msg) {
                        let msgContent = JSON.parse(msg);
                        // console.log('distance', msgContent);
                        let distances = server.getDistanceOneToMany(msgContent.id1, msgContent.ids);
                        console.log(distances);

                        socket.emit('/spatial/distance/oneToMany', distances);
                    });

                    socket.on('newX', function (msg) {
                        var msgContent = JSON.parse(msg);
                        console.log('newX', msgContent);
                    });

                    socket.on('newY', function (msg) {
                        var msgContent = JSON.parse(msg);
                        console.log('newY', msgContent);
                    });

                    socket.on('getAllObjects', function() {
                        var objects = server.getAllObjects();
                        socket.emit('allObjects', objects);

                        var objectsOnOtherServers = server.getKnownObjects();
                        socket.emit('allObjectsOnOtherServers', objectsOnOtherServers);
                    });
                    
                    socket.on('getSceneGraph', function() {
                        // let sceneGraph = server.getSceneGraph();
                        let sceneGraph = server.getWorldGraph();

                        // let stringifiedGraph = JSON.stringify(sceneGraph);
                        // console.log(stringifiedGraph);
                        socket.emit('sceneGraph', sceneGraph);
                    });
                    
                    server.onSceneGraphUpdated(function() {
                        let sceneGraph = server.getSceneGraph();
                        socket.emit('sceneGraph', sceneGraph);
                    });
                });
            }

            socketServer();
        });
    }

}
