createNameSpace('realityEditor.gui.ar.desktopRenderer');

(function(exports) {
    const PROXY = window.location.host === 'toolboxedge.net';
    const decoder = new TextDecoder();

    exports.SocketDataSource = class SocketDataSource {
        constructor() {
            this.lastDataTime = -1;
            this.poses = [];
            this.onMessage = this.onMessage.bind(this);

            if (PROXY) {
                const ws = realityEditor.cloud.socket;

                ws.on('message', (route, body, cbObj, bin) => {
                    if (body.id !== 'root') {
                        return;
                    }

                    const data = decoder.decode(bin.data);
                    this.onMessage({data});
                });
            } else {
                const url = 'ws://' + window.location.hostname + ':31337/';
                this.socket = new WebSocket(url);

                this.socket.addEventListener('message', this.onMessage);
            }
        }

        onMessage(event) {

            try {

                // console.log('Message received', event.data);

                let msg = JSON.parse(event.data);

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
