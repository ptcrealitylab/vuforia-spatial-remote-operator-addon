createNameSpace('realityEditor.gui.ar.desktopRenderer');

(function(exports) {
    exports.SocketDataSource = class SocketDataSource {
        constructor() {
            this.lastDataTime = -1;
            this.poses = [];
            
            const url = 'ws://' + window.location.hostname + ':31337/';
            this.socket = new WebSocket(url);

            this.onMessage = this.onMessage.bind(this);

            this.socket.addEventListener('message', this.onMessage);

            this.socket.addEventListener('open', function(event) { console.log('yes I am open', event); });
            this.socket.addEventListener('error', function(event) { console.log('oh no error', event); });
            
            this.hololensPosition = {x: 0, y: 0, z: 0};
            this.hololensRotation = {x: 0, y: 0, z: 0};
            this.hololensRightHandPosition = {x: 0, y: 0, z: 0};
            this.hololensLeftHandPosition = {x: 0, y: 0, z: 0};
            
            this.robotData = [];
        }

        onMessage(event) {
            
            try {
                
                let msg = JSON.parse(event.data);

                if (msg.command === '/update/urPose') {
                    console.log('ROBOT DATA: ', msg.robotData);
                    this.robotData = msg.robotData;
                }
                
                if (msg.command === '/update/hololensPose') {

                    //console.log('Got Hololens Pose: ', msg.position);
                    
                    this.hololensPosition = msg.position;
                    this.hololensRotation = msg.rotation;
                    this.hololensRightHandPosition = msg.handpositionright;
                    this.hololensLeftHandPosition = msg.handpositionleft;
                    
                    
                }

                if (msg.command !== '/update/humanPoses') {
                    return;
                }
                this.lastDataTime = msg.time;
                // TODO add support for kinect poses
                // for (let skel of msg.pose) {
                //     if (skel.joints.length !== realityEditor.gui.ar.desktopRenderer.POSE_NET_JOINTS_LEN) {
                //         for (let joint of skel.joints) {
                //             joint.x = -joint.x;
                //         }
                //     }
                // }

                this.handlePoint(msg);
                
            } catch (error) {
                console.warn('Could not parse message: ' , error);
            }
            
        }

        handlePoint(msg) {
            const skels = msg.pose;
            this.poses = skels;
        }
    };

})(realityEditor.gui.ar.desktopRenderer);
