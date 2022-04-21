createNameSpace('realityEditor.device.cameraVis');

import * as THREE from '../../thirdPartyCode/three/three.module.js';

(function(exports) {
    const debug = false;
    const ZDEPTH = true;
    const FLATSHADER = true;
    const urlBase = 'ws://' + window.location.hostname + ':31337/';
    const vertexShader = `
uniform sampler2D map;
uniform sampler2D mapDepth;

uniform float width;
uniform float height;
uniform float depthScale;
uniform float glPosScale;

uniform float pointSize;
const float pointSizeBase = 0.0;

varying vec2 vUv;
varying vec4 pos;

const float XtoZ = 1920.0 / 1448.24976; // width over focal length
const float YtoZ = 1080.0 / 1448.24976;

void main() {
  vUv = vec2(position.x / width, position.y / height);

  vec4 color = texture2D(mapDepth, vUv);
  ${(!ZDEPTH) ? `
  float depth = (color.r * 255.0 + color.g + color.b / 255.0) * 1000.0;
  float z = depth - 0.05;
  ` : `
  // color.rgb are all 0-1 when we want them to be 0-255 so we can shift out across depth (mm?)
  int r = int(color.r * 255.0);
  int g = int(color.g * 255.0);
  int b = int(color.b * 255.0);

  float depth = float((r & 1) |
      ((g & 1) << 1) |
      ((b & 1) << 2) |
      ((r & (1 << 1)) << (3 - 1)) |
      ((g & (1 << 1)) << (4 - 1)) |
      ((b & (1 << 1)) << (5 - 1)) |
      ((r & (1 << 2)) << (6 - 2)) |
      ((g & (1 << 2)) << (7 - 2)) |
      ((b & (1 << 2)) << (8 - 2)) |
      ((r & (1 << 3)) << (9 - 3)) |
      ((g & (1 << 3)) << (10 - 3)) |
      ((b & (1 << 3)) << (11 - 3)) |
      ((r & (1 << 4)) << (12 - 4)) |
      ((g & (1 << 4)) << (13 - 4)) |
      ((b & (1 << 4)) << (14 - 4)) |
      ((r & (1 << 5)) << (15 - 5)) |
      ((g & (1 << 5)) << (16 - 5)) |
      ((b & (1 << 5)) << (17 - 5)) |
      ((r & (1 << 6)) << (18 - 6)) |
      ((g & (1 << 6)) << (19 - 6)) |
      ((b & (1 << 6)) << (20 - 6)) |
      ((r & (1 << 7)) << (21 - 7)) |
      ((g & (1 << 7)) << (22 - 7)) |
      ((b & (1 << 7)) << (23 - 7))) *
      (1000.0 / float(1 << (24 - 4)));

  // Projection code by @kcmic

  float z = depth - 1.0;
  `}

  pos = vec4(
    (position.x / width - 0.5) * z * XtoZ,
    (position.y / height - 0.5) * z * YtoZ,
    -z,
    1.0);

  gl_Position = projectionMatrix * modelViewMatrix * pos;
  // gl_PointSize = pointSizeBase + pointSize * depth * depthScale;
  gl_PointSize = pointSizeBase + pointSize * depth * depthScale + glPosScale / gl_Position.w;
}`;

    const fragmentShader = `
uniform sampler2D map;

varying vec2 vUv;

void main() {
  vec4 color = texture2D(map, vUv);
  gl_FragColor = vec4(color.r, color.g, color.b, 0.4);
}`;

    const solidFragmentShader = `
uniform sampler2D map;

varying vec2 vUv;
varying vec4 pos;

void main() {
  vec3 normal = normalize(cross(dFdx(pos.xyz), dFdy(pos.xyz)));
  float alpha = abs(dot(normalize(pos.xyz), normal));
  vec4 color = texture2D(map, vUv);

  gl_FragColor = vec4(color.rgb, alpha);
}`;

    function setMatrixFromArray(matrix, array) {
        matrix.set(
            array[0], array[4], array[8], array[12],
            array[1], array[5], array[9], array[13],
            array[2], array[6], array[10], array[14],
            array[3], array[7], array[11], array[15]
        );
    }

    class CameraVis {
        constructor(id, floorOffset) {
            this.id = id;
            this.container = new THREE.Group();
            // this.container.scale.set(0.001, 0.001, 0.001);
            // this.container.rotation.y = Math.PI;
            this.container.position.y = -floorOffset;
            this.container.rotation.x = Math.PI / 2;
            this.lastUpdate = Date.now();
            this.phone = new THREE.Group();
            this.phone.matrixAutoUpdate = false;
            this.phone.frustumCulled = false;
            this.container.add(this.phone);

            const geo = new THREE.BoxGeometry(100, 100, 80);
            const color = `hsl(${((id / 29) % Math.PI) * 360 / Math.PI}, 100%, 50%)`;
            const mat = new THREE.MeshBasicMaterial({color: color});
            const box = new THREE.Mesh(geo, mat);
            box.name = 'cameraVisCamera';
            box.cameraVisId = this.id;
            this.phone.add(box);

            const geoCone = new THREE.ConeGeometry(60, 180, 16, 1);
            const cone = new THREE.Mesh(geoCone, mat);
            cone.rotation.x = -Math.PI / 2;
            cone.rotation.y = Math.PI / 8;
            cone.position.z = 65;
            cone.name = 'cameraVisCamera';
            cone.cameraVisId = this.id;
            this.phone.add(cone);

            this.texture = new THREE.Texture();
            this.texture.minFilter = THREE.NearestFilter;
            this.texture.magFilter = THREE.NearestFilter;

            this.textureDepth = new THREE.Texture();
            this.textureDepth.minFilter = THREE.NearestFilter;
            this.textureDepth.magFilter = THREE.NearestFilter;

            this.material = null;
            this.mesh = null;

            if (debug) {
                this.setupDebugCubes();
            }

            this.setupPointCloud();

            this.time = performance.now();
            this.matrices = [];
            this.loading = {};

            this.historyLine = new realityEditor.device.meshLine.MeshLine();
            const lineMat = new realityEditor.device.meshLine.MeshLineMaterial({
                color: color,
                opacity: 0.6,
                lineWidth: 20,
                // depthWrite: false,
                transparent: true,
                side: THREE.DoubleSide,
            });
            this.historyMesh = new THREE.Mesh(this.historyLine, lineMat);
            this.historyPoints = [];
            this.historyLine.setPoints(this.historyPoints);
            this.container.add(this.historyMesh);
        }

        /**
         * Clone the current state of the mesh rendering part of this CameraVis
         * @return {THREE.Object3D} object containing all relevant meshes
         */
        clonePatch() {
            const width = 640, height = 360;

            let patch = this.container.clone(false);
            let phone = this.phone.clone(false);
            let flatGeo = new THREE.PlaneBufferGeometry(width, height, width, height);
            flatGeo.translate(width / 2, height / 2);

            let material = this.material.clone();
            material.fragmentShader = solidFragmentShader;
            material.uniforms.map.value.image = this.texture.image; // .cloneNode();
            material.uniforms.map.value.needsUpdate = true;
            material.uniforms.mapDepth.value.image = this.textureDepth.image; // .cloneNode();
            material.uniforms.mapDepth.value.needsUpdate = true;

            let mesh = new THREE.Mesh(flatGeo, material);
            mesh.scale.set(-1, 1, -1);
            mesh.frustumCulled = false;

            phone.add(mesh);
            patch.add(phone);
            return patch;
        }

        setupDebugCubes() {
            let debugDepth = new THREE.MeshBasicMaterial({
                map: this.textureDepth,
            });
            let debugDepthCube = new THREE.Mesh(new THREE.PlaneGeometry(500, 500), debugDepth);
            this.container.add(debugDepthCube);
            debugDepthCube.position.set(400, 250, -1000);

            let debugColor = new THREE.MeshBasicMaterial({
                map: this.texture,
            });
            this.debugColorCube = new THREE.Mesh(new THREE.PlaneGeometry(100, 100 * 1080 / 1920), debugColor);
            // this.container.add(debugColorCube);
            this.debugColorCube.position.set(-180 * window.innerWidth / window.innerHeight, 140, -1000);
            this.debugColorCube.rotation.z = Math.PI;
        }

        toggleColorCube(i) {
            if (!this.debugColorCube || !this.debugColorCube.parent) {
                this.addColorCube(i);
            } else {
                this.removeColorCube();
            }
        }

        addColorCube(i) {
            if (!this.debugColorCube) {
                let debugColor = new THREE.MeshBasicMaterial({
                    map: this.texture,
                });
                this.debugColorCube = new THREE.Mesh(new THREE.PlaneGeometry(100, 100 * 1080 / 1920), debugColor);
                // this.container.add(debugColorCube);
                this.debugColorCube.rotation.z = Math.PI;
            }
            let x = -180 * window.innerWidth / window.innerHeight;
            let y = 140 - i * 100;
            this.debugColorCube.position.set(x, y, -1000);
            realityEditor.gui.threejsScene.addToScene(this.debugColorCube, {parentToCamera: true});
        }

        removeColorCube() {
            realityEditor.gui.threejsScene.removeFromScene(this.debugColorCube);
        }

        setupPointCloud() {
            const width = 640, height = 360;

            if (FLATSHADER) {
                this.geometry = new THREE.PlaneBufferGeometry(width, height, width / 5, height / 5);
                this.geometry.translate(width / 2, height / 2);
            } else {
                this.geometry = new THREE.BufferGeometry();
                const vertices = new Float32Array(width * height * 3);

                for (let i = 0, j = 0, l = vertices.length; i < l; i += 3, j ++) {
                    vertices[i] = j % width;
                    vertices[i + 1] = Math.floor(j / width);
                }

                this.geometry.setAttribute('position', new THREE.BufferAttribute(vertices, 3));
            }

            this.material = new THREE.ShaderMaterial({
                uniforms: {
                    map: {value: this.texture},
                    mapDepth: {value: this.textureDepth},
                    width: {value: width},
                    height: {value: height},
                    depthScale: {value: 0.15 / 256}, // roughly 1 / 1920
                    glPosScale: {value: 20000}, // 0.15 / 256}, // roughly 1 / 1920
                    // pointSize: { value: 8 * 0.666 * 0.15 / 256 },
                    pointSize: { value: 2 * 0.666 },
                },
                vertexShader,
                fragmentShader: FLATSHADER ? solidFragmentShader : fragmentShader,
                // blending: THREE.AdditiveBlending,
                // depthTest: false, depthWrite: false,
                transparent: true
            });

            if (FLATSHADER) {
                this.mesh = new THREE.Mesh(this.geometry, this.material);
            } else {
                this.mesh = new THREE.Points(this.geometry, this.material);
            }
            this.mesh.scale.set(-1, 1, -1);
            this.mesh.frustumCulled = false;
            this.phone.add(this.mesh);
        }

        update(mat) {
            let now = performance.now();
            this.lastUpdate = now;
            if (this.time > now) {
                setMatrixFromArray(this.phone.matrix, mat);
                return;
            }
            this.matrices.push({
                matrix: mat,
                time: now,
            });
        }

        setTime(time) {
            this.time = time;
            if (this.matrices.length === 0) {
                return;
            }
            let latest = this.matrices[0];
            if (latest.time > time) {
                return;
            }
            let latestI = 0;
            for (let i = 1; i < this.matrices.length; i++) {
                let mat = this.matrices[i];
                if (mat.time > time) {
                    break;
                }
                latest = mat;
                latestI = i;
            }
            setMatrixFromArray(this.phone.matrix, latest.matrix);
            this.matrices.splice(0, latestI + 1);
            this.historyPoints.push(new THREE.Vector3(
                latest.matrix[12],
                latest.matrix[13],
                latest.matrix[14],
            ));
            this.historyLine.setPoints(this.historyPoints);
        }

        add() {
            realityEditor.gui.threejsScene.addToScene(this.container);
        }

        remove() {
            realityEditor.gui.threejsScene.removeFromScene(this.container);
        }
    }

    exports.CameraVisCoordinator = class CameraVisCoordinator {
        constructor(floorOffset, voxelizer) {
            this.voxelizer = voxelizer;
            this.cameras = {};
            this.patches = [];
            this.visible = true;
            this.spaghettiVisible = true;
            this.floorOffset = floorOffset;

            realityEditor.gui.getMenuBar().addCallbackToItem(realityEditor.gui.ITEM.PointClouds, (_value) => {
                this.visible = !this.visible;
                for (let camera of Object.values(this.cameras)) {
                    camera.mesh.visible = this.visible;
                    camera.mesh.__hidden = !this.visible;
                }
            });

            realityEditor.gui.getMenuBar().addCallbackToItem(realityEditor.gui.ITEM.ResetPaths, () => {
                for (let camera of Object.values(this.cameras)) {
                    camera.historyPoints = [];
                    camera.historyLine.setPoints(camera.historyPoints);
                }
            });

            realityEditor.gui.getMenuBar().addCallbackToItem(realityEditor.gui.ITEM.SpaghettiMap, (_value) => {
                this.spaghettiVisible = !this.spaghettiVisible;
                for (let camera of Object.values(this.cameras)) {
                    camera.historyMesh.visible = this.spaghettiVisible;
                }
            });

            realityEditor.gui.getMenuBar().addCallbackToItem(realityEditor.gui.ITEM.ClonePatch, (_value) => {
                for (let camera of Object.values(this.cameras)) {
                    let patch = camera.clonePatch();
                    realityEditor.gui.threejsScene.addToScene(patch);
                    this.patches.push(patch);
                }
            });

            this.onPointerDown = this.onPointerDown.bind(this);

            let threejsCanvas = document.getElementById('mainThreejsCanvas');
            if (threejsCanvas) {
                threejsCanvas.addEventListener('pointerdown', this.onPointerDown);
            }
        }

        connectWsToMatrix(url) {
            const ws = new WebSocket(url);

            ws.addEventListener('message', async (msg) => {
                const bytes = new Uint8Array(await msg.data.slice(0, 1).arrayBuffer());
                const id = bytes[0];
                // const pktType = bytes[1];
                // if (pktType === PKT_MATRIX) {
                const mat = new Float32Array(await msg.data.slice(1, msg.data.size).arrayBuffer());
                // }
                if (!this.cameras[id]) {
                    this.createCameraVis(id);
                }
                this.cameras[id].update(mat);

                let now = performance.now();
                for (let camera of Object.values(this.cameras)) {
                    if (camera.mesh.__hidden) {
                        camera.mesh.visible = false;
                        continue;
                    }
                    if (now - camera.lastUpdate > 2000) {
                        camera.mesh.visible = false;
                    } else if (!camera.mesh.visible) {
                        camera.mesh.visible = true;
                    }
                }
            });
        }

        connect() {
            const connectWsToTexture = (url, textureKey, mimetype) => {
                const ws = new WebSocket(url);
                let canvas = document.createElement('canvas');
                let context = canvas.getContext('2d');

                ws.addEventListener('message', async (msg) => {
                    const bytes = new Uint8Array(await msg.data.slice(0, 1).arrayBuffer());
                    const id = bytes[0];
                    if (!this.cameras[id]) {
                        this.createCameraVis(id);
                    }
                    if (this.cameras[id].loading[textureKey]) {
                        return;
                    }
                    this.cameras[id].loading[textureKey] = true;
                    // const pktType = bytes[1];
                    // if (pktType === PKT_MATRIX) {
                    //   const text = await msg.data.slice(2, msg.data.length).text();
                    //   const mat = JSON.parse(text);
                    // }
                    const imageBlob = msg.data.slice(1, msg.data.size, mimetype);
                    const imageUrl = URL.createObjectURL(imageBlob);
                    const image = new Image();

                    let start = window.performance.now();
                    image.onload = () => {
                        const tex = this.cameras[id][textureKey];
                        tex.dispose();
                        // hmmmmm
                        // most efficient would be if this had a data url for its src
                        // data url = 'data:image/(png|jpeg);' + base64(blob)
                        if (textureKey === 'textureDepth') {
                            canvas.width = image.width;
                            canvas.height = image.height;
                            context.drawImage(image, 0, 0, image.width, image.height);
                            tex.image = canvas;
                            if (this.voxelizer) {
                                this.voxelizer.raycastDepthTexture(this.cameras[id].phone, canvas, context);
                            }
                        } else {
                            tex.image = image;
                        }
                        tex.needsUpdate = true;
                        // let end = window.performance.now();
                        if (textureKey === 'texture') {
                            // We know that capture takes 30ms
                            // Transmission takes ??s
                            this.cameras[id].setTime(start + 40);
                        }
                        this.cameras[id].loading[textureKey] = false;
                        // window.latencies[textureKey].push(end - start);
                        URL.revokeObjectURL(imageUrl);
                    };
                    image.onerror = (e) => {
                        console.error(e);
                    };
                    image.src = imageUrl;
                });
            };

            const urlColor = urlBase + 'color';
            const urlDepth = urlBase + 'depth';
            const urlMatrix = urlBase + 'matrix';

            connectWsToTexture(urlColor, 'texture', 'image/jpeg');
            connectWsToTexture(urlDepth, 'textureDepth', 'image/png');
            this.connectWsToMatrix(urlMatrix);
        }

        createCameraVis(id) {
            if (debug) {
                console.log('new camera', id);
            }
            this.cameras[id] = new CameraVis(id, this.floorOffset);
            this.cameras[id].add();

            // these menubar shortcuts are disabled by default, enabled when at least one virtualizer connects
            realityEditor.gui.getMenuBar().setItemEnabled(realityEditor.gui.ITEM.PointClouds, true);
            realityEditor.gui.getMenuBar().setItemEnabled(realityEditor.gui.ITEM.SpaghettiMap, true);
            realityEditor.gui.getMenuBar().setItemEnabled(realityEditor.gui.ITEM.ResetPaths, true);
            realityEditor.gui.getMenuBar().setItemEnabled(realityEditor.gui.ITEM.TogglePaths, true);
            realityEditor.gui.getMenuBar().setItemEnabled(realityEditor.gui.ITEM.ClonePatch, true);
        }

        onPointerDown(e) {
            let objectsToCheck = Object.values(this.cameras).map(cameraVis => {
                return cameraVis.phone;
            });
            let intersects = realityEditor.gui.threejsScene.getRaycastIntersects(e.clientX, e.clientY, objectsToCheck);

            intersects.forEach((intersect) => {
                if (intersect.object.name !== 'cameraVisCamera') {
                    return;
                }

                let id = intersect.object.cameraVisId;
                let i = Object.keys(this.cameras).indexOf('' + id);
                this.cameras[id].toggleColorCube(i);

                // stop propagation if we hit anything, otherwise pass the event on to the rest of the application
                e.stopPropagation();
            });
        }
    };

})(realityEditor.device.cameraVis);
