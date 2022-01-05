createNameSpace('realityEditor.gui.ar.desktopRenderer');

import * as THREE from '../../thirdPartyCode/three/three.module.js';

(function(exports) {
    exports.RealityZoneVoxelizer = class RealityZoneVoxelizer {
        constructor(floorOffset, gltf, navmesh) {
            this.floorOffset = floorOffset;
            this.gltf = gltf;
            this.navmesh = navmesh;
            this.raycaster = new THREE.Raycaster();
            this.container = new THREE.Group();
            this.container.position.y = -floorOffset;
            // this.container.rotation.x = Math.PI / 2;
            // Can dynamically octree-style subdivide and save a ton of processing
            this.res = 250 / 1000;

            this.baseMat = new THREE.MeshBasicMaterial({
                color: 0x00ff00,
                wireframe: true,
            });
            this.baseGeo = new THREE.BoxGeometry(this.res * 1000, this.res * 1000, this.res * 1000);
            realityEditor.gui.threejsScene.addToScene(this.container);
        }

        add() {
            this.gltf.position.set(0, 0, 0);
            this.gltf.scale.set(1, 1, 1);

            let startRes = this.res * 8;

            let diffX = Math.ceil((this.navmesh.maxX - this.navmesh.minX) / startRes) * startRes;
            let diffY = Math.ceil((this.navmesh.maxY - this.navmesh.minY) / startRes) * startRes;
            let diffZ = Math.ceil((this.navmesh.maxZ - this.navmesh.minZ) / startRes) * startRes;
            let avgX = (this.navmesh.minX + this.navmesh.maxX) / 2;
            let avgY = (this.navmesh.minY + this.navmesh.maxY) / 2;
            let avgZ = (this.navmesh.minZ + this.navmesh.maxZ) / 2;
            this.scanRegion(
                avgX - diffX / 2,
                avgY - diffY / 2,
                avgZ - diffZ / 2,
                avgX + diffX / 2,
                avgY + diffY / 2,
                avgZ + diffZ / 2,
                this.res * 8);
        }

        scanRegion(minX, minY, minZ, maxX, maxY, maxZ, res) {
            let building = res <= this.res;
            for (let x = minX; x < maxX; x += res) {
                for (let z = minZ; z < maxZ; z += res) {
                    for (let y = minY; y < maxY; y += res) {
                        if (this.doRaycast(x, y, z, res)) {
                            let box = new THREE.Mesh(this.baseGeo, this.baseMat);
                            box.position.set(x * 1000, y * 1000, z * 1000);
                            box.scale.set(res / this.res, res / this.res, res / this.res);
                            this.container.add(box);
                            if (building) {
                                // let box = new THREE.Mesh(this.baseGeo, this.baseMat);
                                // box.position.set(x * 1000, y * 1000, z * 1000);
                                // this.container.add(box);
                            } else {
                                this.scanRegion(
                                    x - res / 2, y - res / 2, z - res / 2,
                                    x + res / 2, y + res / 2, z + res / 2,
                                    res / 2);
                            }
                        }
                    }
                }
            }
        }

        doRaycast(x, y, z, res) {
            let dir = new THREE.Vector3(
                -res,
                -res,
                -res
            );
            let mag = dir.length();
            this.raycaster.far = mag;
            dir.normalize();

            for (let signX = -1; signX < 2; signX += 2) {
                for (let signY = -1; signY < 2; signY += 2) {
                    for (let signZ = -1; signZ < 2; signZ += 2) {
                        let start = new THREE.Vector3(
                            x + signX * res / 2,
                            y + signY * res / 2,
                            z + signZ * res / 2
                        );
                        dir.x = Math.abs(dir.x) * -signX;
                        dir.y = Math.abs(dir.y) * -signY;
                        dir.z = Math.abs(dir.z) * -signZ;
                        this.raycaster.set(start, dir);
                        let collisions = this.raycaster.intersectObject(this.gltf);
                        if (collisions.length > 0 && collisions[0].distance <= mag) {
                            return true;
                        }
                    }
                }
            }

            return false;
        }
    };
})(realityEditor.gui.ar.desktopRenderer);

