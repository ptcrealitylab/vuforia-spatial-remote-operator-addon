createNameSpace('realityEditor.gui.ar.desktopRenderer');

import * as THREE from '../../thirdPartyCode/three/three.module.js';
import { MeshBVH } from './three-mesh-bvh.module.js';

(function(exports) {
    class OctTree {
        constructor({minX, maxX, minY, maxY, minZ, maxZ}) {
            this.minX = minX;
            this.maxX = maxX;
            this.minY = minY;
            this.maxY = maxY;
            this.minZ = minZ;
            this.maxZ = maxZ;
            this.tree = [];
        }

        getOct(x, y, z) {
            // TODO
            //  - update displayed voxels
            //  - create entire tree for insertion
            let {minX, maxX, minY, maxY, minZ, maxZ} = this;
            let tree = this.tree;
            while (tree && tree.length > 0) {
                let midX = (maxX + minX) / 2;
                let midY = (maxY + minY) / 2;
                let midZ = (maxZ + minZ) / 2;
                let idx = 0;
                if (x > midX) {
                    idx += 1;
                    idx <<= 1;
                }
                if (z > midZ) {
                    idx += 1;
                    idx <<= 1;
                }
                if (y > midY) {
                    idx += 1;
                }
                let cell = tree[idx];
                if (typeof cell === 'number') {
                    let zeros = new THREE.Matrix4(
                        0, 0, 0, 0,
                        0, 0, 0, 0,
                        0, 0, 0, 0,
                        0, 0, 0, 0
                    );
                    this.boxesMesh.setMatrixAt(cell, zeros);
                    // tree[idx] = value;
                    // updateSomehow();
                    return;
                }
                if (x > midX) {
                    minX = midX;
                } else {
                    maxX = midX;
                }
                if (y > midY) {
                    minY = midY;
                } else {
                    maxY = midY;
                }
                if (z > midZ) {
                    minZ = midZ;
                } else {
                    maxZ = midZ;
                }
                tree = cell;
            }
        }

        insert(x, y, z, value) {
            // TODO
            //  - update displayed voxels
            //  - create entire tree for insertion
            let {minX, maxX, minY, maxY, minZ, maxZ} = this;
            let tree = this.tree;
            while (tree && tree.length > 0) {
                let midX = (maxX + minX) / 2;
                let midY = (maxY + minY) / 2;
                let midZ = (maxZ + minZ) / 2;
                let idx = 0;
                if (x > midX) {
                    idx += 1;
                    idx <<= 1;
                }
                if (z > midZ) {
                    idx += 1;
                    idx <<= 1;
                }
                if (y > midY) {
                    idx += 1;
                }
                let cell = tree[idx];
                if (typeof cell === 'number') {
                    tree[idx] = value;
                    return true;
                }
                if (x > midX) {
                    minX = midX;
                } else {
                    maxX = midX;
                }
                if (y > midY) {
                    minY = midY;
                } else {
                    maxY = midY;
                }
                if (z > midZ) {
                    minZ = midZ;
                } else {
                    maxZ = midZ;
                }
                tree = cell;
            }
        }

        removeOct(x, y, z) {
            // TODO
            //  - update displayed voxels
            //  - create entire tree for insertion
            let {minX, maxX, minY, maxY, minZ, maxZ} = this;
            let tree = this.tree;
            while (tree && tree.length > 0) {
                let midX = (maxX + minX) / 2;
                let midY = (maxY + minY) / 2;
                let midZ = (maxZ + minZ) / 2;
                let idx = 0;
                if (x > midX) {
                    idx += 1;
                    idx <<= 1;
                }
                if (z > midZ) {
                    idx += 1;
                    idx <<= 1;
                }
                if (y > midY) {
                    idx += 1;
                }
                let cell = tree[idx];
                if (typeof cell === 'number') {
                    // tree[idx] = value;
                    // updateSomehow();
                    return cell;
                }
                if (x > midX) {
                    minX = midX;
                } else {
                    maxX = midX;
                }
                if (y > midY) {
                    minY = midY;
                } else {
                    maxY = midY;
                }
                if (z > midZ) {
                    minZ = midZ;
                } else {
                    maxZ = midZ;
                }
                tree = cell;
            }
        }
    }

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
                // opacity: 0.2,
                wireframe: true,
            });

            this.coolerMat = new THREE.MeshBasicMaterial({
                color: 0xff0000,
                transparent: true,
                opacity: 0.3,
                // wireframe: true,
            });
            this.baseGeo = new THREE.BoxBufferGeometry(1, 1, 1);
            const maxBoxes = 1 << 16;
            this.boxesMesh = new THREE.InstancedMesh(this.baseGeo, this.baseMat, maxBoxes);

            this.boxes = [];

            realityEditor.gui.threejsScene.addToScene(this.container);
        }

        add() {
            this.boxesMesh.count = 0;
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
            this.voxOct = new OctTree({
                minX: avgX - diff / 2,
                minY: avgY - diff / 2,
                minZ: avgZ - diff / 2,
                maxX: avgX + diff / 2,
                maxY: avgY + diff / 2,
                maxZ: avgZ + diff / 2,
            });
            this.voxOct.tree = this.scanRegion(
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
            this.container.add(this.boxesMesh);
        }

        removeOct(x, y, z) {
            let n = this.voxOct.remove(x, y, z);
            if (typeof n !== 'number') {
                return;
            }
            if (n < 0) {
                return; // hmmmmMMMMMM
            }
            let zeros = new THREE.Matrix4(
                0, 0, 0, 0,
                0, 0, 0, 0,
                0, 0, 0, 0,
                0, 0, 0, 1
            );
            this.boxesMesh.setMatrixAt(n, zeros);
        }

        scanRegion(minX, minY, minZ, maxX, maxY, maxZ, subdivs) {
            let res = (maxX - minX) / subdivs;
            let building = res <= this.res;
            let oct = [];
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
                                let mat = new THREE.Matrix4();
                                mat.makeScale(res * 1000, res * 1000, res * 1000);
                                mat.setPosition(x * 1000, y * 1000, z * 1000);
                                this.boxesMesh.setMatrixAt(this.boxesMesh.count, mat);
                                // let box = new THREE.Mesh(this.baseGeo, this.baseMat);
                                // box.position.set
                                // // this.boxPositions.push(x * 1000, y * 1000, z * 1000);
                                // // box.rotation.y = Math.random() * 0.4;
                                // box.scale.set(res * 1000, res * 1000, res * 1000);
                                // this.container.add(box);
                                this.boxesMesh.count += 1;
                                oct.push(true);
                            } else {
                                oct.push(this.scanRegion(
                                    x - res / 2, y - res / 2, z - res / 2,
                                    x + res / 2, y + res / 2, z + res / 2,
                                    2));
                            }
                        } else {
                            oct.push([]);
                        }
                    }
                }
            }
            return oct;
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

        raycastDepthTexture(mesh, canvas, context) {
            const matrixWorld = mesh.matrix;
            const width = canvas.width;
            const height = canvas.height;
            const imageData = context.getImageData(0, 0, width, height).data;
            const XtoZ = 1920.0 / 1448.24976; // width over focal length
            const YtoZ = 1080.0 / 1448.24976;
            let res = 16;
            this.boxes = this.boxes.filter(box => {
                box._age -= 1;
                if (box._age <= 0) {
                    box.parent.remove(box);
                    return false;
                }
                return true;
            });
            for (let y = 0; y < height; y += res) {
                for (let x = 0; x < width; x += res) {
                    const ray = new THREE.Vector3(
                        x / width,
                        y / height,
                        1
                    );
                    let r = imageData[4 * (width * y + x) + 0];
                    let g = imageData[4 * (width * y + x) + 1];
                    let b = imageData[4 * (width * y + x) + 2];
                    const depth = (r + g / 256.0 + b / (256.0 * 256.0)) * 1000.0;
                    const z = depth - 0.01;
                    ray.x = -(x / width - 0.5) * z * XtoZ;
                    ray.y = -(y / height - 0.5) * z * YtoZ;
                    ray.z = z;
                    ray.applyMatrix4(matrixWorld);
                    // let pos = something something proj times modelview times ray;
                    let box = new THREE.Mesh(this.baseGeo, this.coolerMat);
                    // box.position.set(ray.x * 1000, ray.y * 1000, ray.z * 1000);
                    box.position.set(ray.x, ray.y, ray.z);
                    box.scale.set(this.res * 1000, this.res * 1000, this.res * 1000);
                    box._age = 20;
                    mesh.parent.add(box);
                    this.container.attach(box);
                    let bigRes = this.res * 1000;
                    box.position.x = (Math.floor(box.position.x / bigRes) + 0.5) * bigRes;
                    box.position.y = (Math.floor(box.position.y / bigRes) + 0.5) * bigRes;
                    box.position.z = (Math.floor(box.position.z / bigRes) + 0.5) * bigRes;
                    box.rotation.set(0, 0, 0);
                    let known = this.doRaycast(
                        box.position.x / 1000,
                        box.position.y / 1000,
                        box.position.z / 1000,
                        this.res * 8
                    );
                    if (known) {
                        box.parent.remove(box);
                        continue;
                    }
                    this.boxes.push(box);
                }
            }
        }
    };
})(realityEditor.gui.ar.desktopRenderer);

