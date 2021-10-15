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
        }

        onMessage(event) {
            let msg = JSON.parse(event.data);
            if (msg.command !== '/update/humanPoses') {
                return;
            }
            this.lastDataTime = msg.time;
            for (let skel of msg.pose) {
                if (skel.joints.length !== realityEditor.gui.ar.desktopRenderer.POSE_NET_JOINTS_LEN) {
                    for (let joint of skel.joints) {
                        joint.x = -joint.x;
                    }
                }
            }

            this.handlePoint(msg);
        }

        handlePoint(msg) {
            const skels = msg.pose;
            this.poses = skels;
        }
    };

})(realityEditor.gui.ar.desktopRenderer);
