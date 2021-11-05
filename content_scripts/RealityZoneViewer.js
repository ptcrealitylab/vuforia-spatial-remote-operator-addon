createNameSpace('realityEditor.gui.ar.desktopRenderer');

(function(exports) {

    exports.RealityZoneViewer = class RealityZoneViewer {
        constructor(floorOffset) {
            this.floorOffset = floorOffset;
            this.skelVisses = {};
            this.dataSource = new realityEditor.gui.ar.desktopRenderer.SocketDataSource();

            this.draw = this.draw.bind(this);
            window.rzv = this;
        }

        draw() {
            let skels = this.dataSource.poses;
            this.drawSkels(skels);

            window.requestAnimationFrame(this.draw);
        }

        drawSkels(skels) {
            for (let id in this.skelVisses) {
                this.skelVisses[id].updated = true;
            }

            for (let skel of skels) {
                if (!skel.angles && skel.joints.length > 0) {
                    realityEditor.gui.ar.desktopRenderer.rebaScore.augmentSkel(skel);
                    skel.angles = realityEditor.gui.ar.desktopRenderer.rebaScore.getAngles(skel);
                    realityEditor.gui.ar.desktopRenderer.rebaScore.calculateReba(skel);
                    skel.rebaScore = realityEditor.gui.ar.desktopRenderer.rebaScore.overallRebaCalculation(skel);
                }

                if (this.skelVisses.hasOwnProperty(skel.id)) {
                    // Length 0 is a tombstone object
                    if (skel.joints.length === 0) {
                        this.skelVisses[skel.id].updated = false;
                        continue;
                    }
                    this.skelVisses[skel.id].update(skel, this.dataSource.lastDataTime);
                } else if (skel.joints.length === 0) {
                    continue;
                } else {
                    if (skel.joints.length === realityEditor.gui.ar.desktopRenderer.POSE_NET_JOINTS_LEN) {
                        this.skelVisses[skel.id] = new realityEditor.gui.ar.desktopRenderer.PoseNetSkelVis(skel, this.floorOffset);
                    } else {
                        console.warn('what are you giving the poor skel vis', skel);
                    }
                    this.skelVisses[skel.id].addToScene();
                    this.skelVisses[skel.id].updated = true;
                }
            }
            for (let id in this.skelVisses) {
                if (!this.skelVisses[id].updated) {
                    this.skelVisses[id].removeFromScene();
                    delete this.skelVisses[id];
                }
            }
        }
    };

})(realityEditor.gui.ar.desktopRenderer);
