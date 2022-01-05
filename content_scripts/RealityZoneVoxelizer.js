createNameSpace('realityEditor.gui.ar.desktopRenderer');

import * as THREE from '../../thirdPartyCode/three/three.module.js';
import { MeshBVH } from './three-mesh-bvh.module.js';

(function(exports) {
    exports.RealityZoneVoxelizer = class RealityZoneVoxelizer {
        constructor(floorOffset, gltf, navmesh) {
            this.floorOffset = floorOffset;
            this.gltf = gltf;
            this.bvh = new MeshBVH(this.gltf.geometry);
            this.navmesh = navmesh;
            this.raycaster = new THREE.Raycaster();
            this.container = new THREE.Group();
            this.container.position.y = -floorOffset;
            // this.container.rotation.x = Math.PI / 2;
            // Can dynamically octree-style subdivide and save a ton of processing
            this.res = 100 / 1000;

            this.baseMat = new THREE.MeshBasicMaterial({
                color: 0x00ff00,
                // transparent: true,
                // opacity: 0.3,
                wireframe: true,
            });
            this.baseGeo = new THREE.BoxGeometry(this.res * 1000, this.res * 1000, this.res * 1000);
            realityEditor.gui.threejsScene.addToScene(this.container);
        }

        add() {
            this.gltf.position.set(0, 0, 0);
            this.gltf.scale.set(1, 1, 1);

            let startRes = this.res * 8;

            let diffX = Math.ceil((this.navmesh.maxX - this.navmesh.minX) / startRes + 2) * startRes;
            let diffY = Math.ceil((this.navmesh.maxY - this.navmesh.minY) / startRes + 2) * startRes;
            let diffZ = Math.ceil((this.navmesh.maxZ - this.navmesh.minZ) / startRes + 2) * startRes;
            let avgX = (this.navmesh.minX + this.navmesh.maxX) / 2;
            let avgY = (this.navmesh.minY + this.navmesh.maxY) / 2;
            let avgZ = (this.navmesh.minZ + this.navmesh.maxZ) / 2;
            let diff = Math.max(diffX, diffY, diffZ);
            this.scanRegion(
                avgX - diff / 2,
                avgY - diff / 2,
                avgZ - diff / 2,
                avgX + diff / 2,
                avgY + diff / 2,
                avgZ + diff / 2,
                2);
            let boxScale = diff;
            while (boxScale > this.res) {
                boxScale /= 2;
            }
            this.res = boxScale;
        }

        scanRegion(minX, minY, minZ, maxX, maxY, maxZ, subdivs) {
            let res = (maxX - minX) / subdivs;
            let building = res <= this.res;
            for (let xi = 0; xi < subdivs; xi++) {
                let x = minX + res * (xi + 0.5);
                for (let zi = 0; zi < subdivs; zi++) {
                    let z = minZ + res * (zi + 0.5);
                    for (let yi = 0; yi < subdivs; yi++) {
                        let y = minY + res * (yi + 0.5);
                        if (this.doRaycast(x, y, z, res)) {
                            // let box = new THREE.Mesh(this.baseGeo, this.baseMat);
                            // box.position.set(x * 1000, y * 1000, z * 1000);
                            // box.scale.set(res / this.res, res / this.res, res / this.res);
                            // this.container.add(box);
                            if (building) {
                                let box = new THREE.Mesh(this.baseGeo, this.baseMat);
                                box.position.set(x * 1000, y * 1000, z * 1000);
                                // this.boxPositions.push(x * 1000, y * 1000, z * 1000);
                                // box.rotation.y = Math.random() * 0.4;
                                box.scale.set(res / this.res, res / this.res, res / this.res);
                                this.container.add(box);
                            } else {
                                this.scanRegion(
                                    x - res / 2, y - res / 2, z - res / 2,
                                    x + res / 2, y + res / 2, z + res / 2,
                                    2);
                            }
                        }
                    }
                }
            }
        }

        doRaycast(x, y, z, res) {
            let box = new THREE.Box3();
            box.min.set(
                x - res / 2,
                y - res / 2,
                z - res / 2
            );
            box.max.set(
                x + res / 2,
                y + res / 2,
                z + res / 2
            );
            return this.bvh.intersectsBox(box, new THREE.Matrix4());
        }
    };
})(realityEditor.gui.ar.desktopRenderer);

