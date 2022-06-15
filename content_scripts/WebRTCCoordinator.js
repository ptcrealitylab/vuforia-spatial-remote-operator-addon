createNameSpace('realityEditor.device.cameraVis');

(function(exports) {
    const PROXY = window.location.host === 'toolboxedge.net';

    const encoder = new TextEncoder();
    const decoder = new TextDecoder();

    class WebRTCCoordinator {
        constructor(cameraVisCoordinator, ws, consumerId) {
            this.cameraVisCoordinator = cameraVisCoordinator;
            this.ws = ws;
            this.audioStream = null;
            this.consumerId = consumerId;

            this.webrtcConnections = {};

            this.onWsOpen = this.onWsOpen.bind(this);
            this.onWsMessage = this.onWsMessage.bind(this);
            this.onToolsocketMessage = this.onToolsocketMessage.bind(this);

            if (!PROXY) {
                this.ws.addEventListener('open', this.onWsOpen);
                this.ws.addEventListener('message', this.onWsMessage);
            } else {
                this.ws.on('message', this.onToolsocketMessage);
                this.ws.message('unused', {id: 'signalling'}, null, {
                    data: encoder.encode(JSON.stringify({
                        command: 'joinNetwork',
                        src: this.consumerId,
                        role: 'consumer',
                    })),
                });
            }

            navigator.mediaDevices.getUserMedia({video: false, audio: true}).then((stream) => {
                this.audioStream = this.improveAudioStream(stream);
            });
        }

        improveAudioStream(stream) {
            const context = new AudioContext();
            const src = context.createMediaStreamSource(stream);
            const dst = context.createMediaStreamDestination();
            const gainNode = context.createGain();
            gainNode.gain.value = 3;
            src.connect(gainNode);
            gainNode.connect(dst);
            return dst.stream;
        }

        onWsOpen() {
            this.ws.send(JSON.stringify({
                command: 'joinNetwork',
                src: this.consumerId,
                role: 'consumer',
            }));
        }

        onWsMessage(event) {
            let msg;
            try {
                msg = JSON.parse(event.data);
            } catch (e) {
                console.warn('ws parse error', e, event);
                return;
            }
            console.log('webrtc msg', msg);
            if (msg.command === 'joinNetwork') {
                if (msg.role === 'provider') {
                    this.initConnection(msg.src);
                }
                return;
            }

            if (msg.command === 'discoverProviders') {
                for (let provider of msg.providers) {
                    this.initConnection(provider);
                }
                return;
            }

            this.webrtcConnections[msg.src].onSignallingMessage(msg);
        }

        onToolsocketMessage(route, body, cbObj, bin) {
            if (body.id !== 'signalling') {
                return;
            }
            this.onWsMessage({data: decoder.decode(bin.data)});
        }

        initConnection(providerId) {
            let newConn = new WebRTCConnection(
                this.cameraVisCoordinator,
                this.ws,
                this.audioStream,
                this.consumerId,
                providerId
            );

            this.webrtcConnections[providerId] = newConn;
            newConn.connect();
        }
    }

    class WebRTCConnection {
        constructor(cameraVisCoordinator, ws, audioStream, consumerId, providerId) {
            this.cameraVisCoordinator = cameraVisCoordinator;
            this.ws = ws;
            this.consumerId = consumerId;
            this.providerId = providerId;
            this.audioStream = audioStream;

            this.receiveChannel = null;
            this.localConnection = null;

            this.onSignallingMessage = this.onSignallingMessage.bind(this);

            this.onReceiveChannelStatusChange =
                this.onReceiveChannelStatusChange.bind(this);
            this.onReceiveChannelMessage =
                this.onReceiveChannelMessage.bind(this);
            this.onSendChannelStatusChange =
                this.onSendChannelStatusChange.bind(this);
            this.onWebRTCError =
                this.onWebRTCError.bind(this);
        }

        onSignallingMessage(msg) {
            if (msg.command === 'newIceCandidate') {
                console.log('webrtc remote candidate', msg);
                this.localConnection.addIceCandidate(msg.candidate)
                    .catch(this.onWebRTCError);
                return;
            }

            if (msg.command === 'newDescription') {
                this.localConnection.setRemoteDescription(msg.description);
                return;
                // will now receive datachannel event
            }
        }

        initLocalConnection() {
            this.localConnection = new RTCPeerConnection({
                iceServers: [{
                    urls: [
                        'stun:stun.l.google.com:19302',
                        'stun:stun4.l.google.com:19305',
                    ],
                }],
            });

            this.receiveChannel = this.localConnection.createDataChannel('sendChannel');
            this.receiveChannel.onopen = this.onReceiveChannelStatusChange;
            this.receiveChannel.onclose = this.onReceiveChannelStatusChange;
            this.receiveChannel.addEventListener('message', this.onReceiveChannelMessage);

            if (this.audioStream) {
                this.localConnection.addStream(this.audioStream);
            }

            this.localConnection.addEventListener('icecandidate', (e) => {
                console.log('webrtc local candidate', e);
                if (!e.candidate) {
                    return;
                }

                if (PROXY) {
                    this.ws.message('unused', {id: 'signalling'}, null, {
                        data: encoder.encode(JSON.stringify({
                            src: this.consumerId,
                            dest: this.providerId,
                            command: 'newIceCandidate',
                            candidate: e.candidate,
                        })),
                    });
                } else {
                    this.ws.send(JSON.stringify({
                        src: this.consumerId,
                        dest: this.providerId,
                        command: 'newIceCandidate',
                        candidate: e.candidate,
                    }));
                }
            });

            this.localConnection.addEventListener('datachannel', (e) => {
                console.log('webrtc datachannel', e);
                this.sendChannel = e.channel;
                this.sendChannel.addEventListener('open', this.onSendChannelStatusChange);
                this.sendChannel.addEventListener('close', this.onSendChannelStatusChange);
            });

            this.localConnection.addEventListener('track', (e) => {
                console.log('webrtc track event', e);
                if (e.streams.length === 0) {
                    return;
                }
                const elt = document.createElement('audio');
                elt.autoplay = true;
                elt.srcObject = e.streams[0];
                let autoplayWhenAvailableInterval = setInterval(() => {
                    try {
                        elt.play();
                    } catch (err) {
                        console.log('autoplay failed', err);
                    }
                }, 250);
                elt.addEventListener('play', function clearAutoplayInterval() {
                    clearInterval(autoplayWhenAvailableInterval);
                    elt.removeEventListener('play', clearAutoplayInterval);
                });
                document.body.appendChild(elt);
            });
        }

        async connect() {
            if (!this.localConnection) {
                this.initLocalConnection();
            }

            this.offered = true;
            const offer = await this.localConnection.createOffer({
                offerToReceiveAudio: true,
            });
            await this.localConnection.setLocalDescription(offer);

            if (PROXY) {
                this.ws.message('unused', {id: 'signalling'}, null, {
                    data: encoder.encode(JSON.stringify({
                        src: this.consumerId,
                        dest: this.providerId,
                        command: 'newDescription',
                        description: this.localConnection.localDescription,
                    })),
                });
            } else {
                this.ws.send(JSON.stringify({
                    src: this.consumerId,
                    dest: this.providerId,
                    command: 'newDescription',
                    description: this.localConnection.localDescription,
                }));
            }
        }

        onSendChannelStatusChange() {
            if (!this.sendChannel) {
                return;
            }

            const state = this.sendChannel.readyState;
            console.log('webrtc onSendChannelStatusChange', state);
            setInterval(() => {
                this.sendChannel.send('hi');
            }, 1000);
        }

        onReceiveChannelStatusChange() {
            if (!this.receiveChannel) {
                return;
            }

            const state = this.receiveChannel.readyState;
            console.log('webrtc onReceiveChannelStatusChange', state);

            if (state === 'open') {
                // create cameravis with receiveChannel
            }
        }

        onReceiveChannelMessage(event) {
            const id = this.providerId;
            let bytes = new Uint8Array(event.data);
            if (bytes.length < 1000) {
                // const decoder = new TextDecoder();
                const matricesMsg = decoder.decode(bytes);
                // blah blah it's matrix
                const matrices = JSON.parse(matricesMsg);
                let cameraNode = new realityEditor.sceneGraph.SceneNode(id + '-camera');
                cameraNode.setLocalMatrix(matrices.camera);
                cameraNode.updateWorldMatrix();

                let gpNode = new realityEditor.sceneGraph.SceneNode(id + '-gp');
                gpNode.needsRotateX = true;
                let gpRxNode = new realityEditor.sceneGraph.SceneNode(id + '-gp' + 'rotateX');
                gpRxNode.addTag('rotateX');
                gpRxNode.setParent(gpNode);

                const c = Math.cos(-Math.PI / 2);
                const s = Math.sin(-Math.PI / 2);
                let rxMat = [
                    1, 0, 0, 0,
                    0, c, -s, 0,
                    0, s, c, 0,
                    0, 0, 0, 1
                ];
                gpRxNode.setLocalMatrix(rxMat);

                // let gpNode = realityEditor.sceneGraph.getSceneNodeById(
                //     realityEditor.sceneGraph.NAMES.GROUNDPLANE + realityEditor.sceneGraph.TAGS.ROTATE_X);
                // if (!gpNode) {
                //     gpNode = realityEditor.sceneGraph.getSceneNodeById(realityEditor.sceneGraph.NAMES.GROUNDPLANE);
                // }
                gpNode.setLocalMatrix(matrices.groundplane);
                gpNode.updateWorldMatrix();
                // gpRxNode.updateWorldMatrix();

                let sceneNode = new realityEditor.sceneGraph.SceneNode(id);
                sceneNode.setParent(realityEditor.sceneGraph.getSceneNodeById('ROOT'));

                let initialVehicleMatrix = [
                    -1, 0, 0, 0,
                    0, 1, 0, 0,
                    0, 0, -1, 0,
                    0, 0, 0, 1,
                ];

                sceneNode.setPositionRelativeTo(cameraNode, initialVehicleMatrix);
                sceneNode.updateWorldMatrix();

                let cameraMat = sceneNode.getMatrixRelativeTo(gpRxNode);
                this.cameraVisCoordinator.updateMatrix(id, new Float32Array(cameraMat));
                return;
            }

            switch (bytes[0]) {
            case 0xff: {
                const imageUrl = URL.createObjectURL(new Blob([event.data], {type: 'image/jpeg'}));
                // Color is always JPEG which has first byte 0x89
                this.cameraVisCoordinator.renderPointCloud(id, 'texture', imageUrl);
            }
                break;

            case 0x89: {
                const imageUrl = URL.createObjectURL(new Blob([event.data], {type: 'image/png'}));
                // Depth is always PNG which has first byte 0x89
                this.cameraVisCoordinator.renderPointCloud(id, 'textureDepth', imageUrl);
            }
                break;

            default:
                console.warn('Unknown image nonsense', event);
                break;
            }
        }

        onWebRTCError(e) {
            console.error('webrtc error', e);
        }

        disconnect() {
            if (PROXY) {
                this.ws.message('unused', {id: 'signalling'}, null, {
                    data: encoder.encode(JSON.stringify({
                        src: this.consumerId,
                        dest: this.providerId,
                        command: 'leaveNetwork',
                    })),
                });
            } else {
                this.ws.send({
                    src: this.consumerId,
                    dest: this.providerId,
                    command: 'leaveNetwork',
                });
            }
            this.sendChannel.close();
            this.receiveChannel.close();

            this.localConnection.close();

            this.sendChannel = null;
            this.receiveChannel = null;
            this.localConnection = null;
        }
    }

    exports.WebRTCCoordinator = WebRTCCoordinator;
})(realityEditor.device.cameraVis);

