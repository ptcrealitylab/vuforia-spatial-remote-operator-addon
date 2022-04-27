createNameSpace('realityEditor.gui.ar.desktopRenderer');

import * as THREE from '../../thirdPartyCode/three/three.module.js';

(function(exports) {

    exports.RealityZoneViewer = class RealityZoneViewer {
        constructor(floorOffset) {
            this.floorOffset = floorOffset;
            this.skelVisses = {};
            this.dataSource = new realityEditor.gui.ar.desktopRenderer.SocketDataSource();
            this.lastDataTime = -1;

            this.draw = this.draw.bind(this);
            this.historyLineMeshesVisible = false;
            this.historyLineMeshes = [];
            this.historyLineContainer = new THREE.Group();
            this.historyLineContainer.position.y = -floorOffset;
            this.historyLineContainer.scale.set(1000, 1000, 1000);
            realityEditor.gui.threejsScene.addToScene(this.historyLineContainer);

            window.rzv = this;
        }

        draw() {
            let skels = this.dataSource.poses;
            if (this.dataSource.lastDataTime !== this.lastDataTime) {
                this.drawSkels(skels);
            }

            window.requestAnimationFrame(this.draw);
        }

        drawSkels(skels) {
            this.lastDataTime = this.dataSource.lastDataTime;

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
                    this.skelVisses[skel.id].lastUpdate = Date.now();
                } else if (skel.joints.length === 0) {
                    continue;
                } else {
                    if (skel.joints.length === realityEditor.gui.ar.desktopRenderer.POSE_NET_JOINTS_LEN) {
                        this.skelVisses[skel.id] = new realityEditor.gui.ar.desktopRenderer.PoseNetSkelVis(skel, this.floorOffset, this.historyLineContainer);
                    } else {
                        console.warn('what are you giving the poor skel vis', skel);
                    }
                    this.skelVisses[skel.id].addToScene();
                    this.skelVisses[skel.id].updated = true;
                    this.skelVisses[skel.id].lastUpdate = Date.now();
                }
            }
            for (let id in this.skelVisses) {
                const skelVis = this.skelVisses[id];
                if (!skelVis.updated ||
                    Date.now() - skelVis.lastUpdate > 1500) {
                    this.historyLineMeshes.push(skelVis.historyMesh);
                    this.skelVisses[id].removeFromScene();
                    delete this.skelVisses[id];
                }
            }
        }

        resetHistory() {
            for (let lineMesh of this.historyLineMeshes) {
                this.historyLineContainer.remove(lineMesh);
            }
            this.historyLineMeshes = [];
        }
        toggleHistory(newState) {
            if (typeof newState !== 'undefined') {
                this.historyLineMeshesVisible = newState;
                this.historyLineContainer.visible = newState;
            } else {
                this.historyLineMeshesVisible = !this.historyLineMeshesVisible;
                this.historyLineContainer.visible = this.historyLineMeshesVisible;
            }
        }
    };

})(realityEditor.gui.ar.desktopRenderer);
