createNameSpace('realityEditor.device.cameraVis');

(function(exports) {
    const debug = true;
    const urlBase = 'ws://' + window.location.hostname + ':31337/';
    const vertexShader = `
uniform sampler2D map;
uniform sampler2D mapDepth;

uniform float width;
uniform float height;
uniform float depthScale;

uniform float pointSize;
const float pointSizeBase = 3.0;

varying vec2 vUv;

const float XtoZ = 1920.0 / 1448.24976; // width over focal length
const float YtoZ = 1080.0 / 1448.24976;

void main() {
  vUv = vec2(position.x / width, position.y / height);

  vec4 color = texture2D(mapDepth, vUv);
  float depth = (color.r + color.g / 256.0 + color.b / (256.0 * 256.0)) * 1000.0;

  // Projection code by @kcmic

  float z = depth * 256.0 - 0.05; // Not exactly sure why it's this

  vec4 pos = vec4(
    (position.x / width - 0.5) * z * XtoZ,
    (position.y / height - 0.5) * z * YtoZ,
    -z,
    1.0);

  gl_PointSize = pointSizeBase + pointSize * depth * depthScale;
  gl_Position = projectionMatrix * modelViewMatrix * pos;
}`;

    const fragmentShader = `
uniform sampler2D map;

varying vec2 vUv;

void main() {
  vec4 color = texture2D(map, vUv);
  gl_FragColor = vec4(color.r, color.g, color.b, 0.2);
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
            const THREE = realityEditor.gui.threejsScene.THREE;

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
            const color = `hsl(${(id % Math.PI) * 360 / Math.PI}, 100%, 50%)`;
            const mat = new THREE.MeshBasicMaterial({color: color});
            this.box = new THREE.Mesh(geo, mat);
            this.phone.add(this.box);

            const geoCone = new THREE.ConeGeometry(60, 180, 16, 1);
            const cone = new THREE.Mesh(geoCone, mat);
            cone.rotation.x = -Math.PI / 2;
            cone.rotation.y = Math.PI / 8;
            cone.position.z = 65;
            this.phone.add(cone);

            this.texture = new THREE.Texture();
            this.texture.minFilter = THREE.NearestFilter;

            this.textureDepth = new THREE.Texture();
            this.textureDepth.minFilter = THREE.NearestFilter;

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

        setupDebugCubes() {
            const THREE = realityEditor.gui.threejsScene.THREE;

            let debugDepth = new THREE.MeshBasicMaterial({
                map: this.textureDepth,
            });
            let debugDepthCube = new THREE.Mesh(new THREE.PlaneGeometry(500, 500), debugDepth);
            this.container.add(debugDepthCube);
            debugDepthCube.position.set(400, 250, -1000);

            let debugColor = new THREE.MeshBasicMaterial({
                map: this.texture,
            });
            let debugColorCube = new THREE.Mesh(new THREE.PlaneGeometry(500, 500), debugColor);
            this.container.add(debugColorCube);
            debugColorCube.position.set(-400, 250, -1000);
        }

        setupPointCloud() {
            const THREE = realityEditor.gui.threejsScene.THREE;

            const width = 640, height = 360;

            this.geometry = new THREE.BufferGeometry();

            const vertices = new Float32Array(width * height * 3);

            for (let i = 0, j = 0, l = vertices.length; i < l; i += 3, j ++) {
                vertices[i] = j % width;
                vertices[i + 1] = Math.floor(j / width);
            }

            this.geometry.setAttribute('position', new THREE.BufferAttribute(vertices, 3));

            this.material = new THREE.ShaderMaterial({
                uniforms: {
                    map: {value: this.texture},
                    mapDepth: {value: this.textureDepth},
                    width: {value: width},
                    height: {value: height},
                    depthScale: {value: 0.15}, // roughly 256 / 1920
                    pointSize: { value: 2 * 0.666 },
                },
                vertexShader,
                fragmentShader,
                // blending: THREE.AdditiveBlending,
                // depthTest: false, depthWrite: false,
                transparent: true
            });

            this.mesh = new THREE.Points(this.geometry, this.material);
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
            const THREE = realityEditor.gui.threejsScene.THREE;
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
        constructor(floorOffset) {
            this.cameras = {};
            this.visible = true;
            this.spaghettiVisible = true;
            this.floorOffset = floorOffset;
            this.keyboard = new realityEditor.device.KeyboardListener();

            this.keyboard.onKeyUp((code) => {
                if (realityEditor.device.keyboardEvents.isKeyboardActive()) { return; } // ignore if a tool is using the keyboard

                if (code === this.keyboard.keyCodes.M) {
                    this.visible = !this.visible;
                    for (let camera of Object.values(this.cameras)) {
                        camera.mesh.visible = this.visible;
                    }
                } else if (code === this.keyboard.keyCodes.R) {
                    for (let camera of Object.values(this.cameras)) {
                        camera.historyPoints = [];
                        camera.historyLine.setPoints(camera.historyPoints);
                    }
                } else if (code === this.keyboard.keyCodes.N) {
                    this.spaghettiVisible = !this.spaghettiVisible;
                    for (let camera of Object.values(this.cameras)) {
                        camera.historyMesh.visible = this.spaghettiVisible;
                    }
                }
            });
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
                    if (now - camera.lastUpdate > 2000) {
                        camera.mesh.visible = false;
                    }
                }
            });
        }

        connect() {
            const connectWsToTexture = (url, textureKey, mimetype) => {
                const ws = new WebSocket(url);

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
                    console.log(imageBlob);
                    const url = URL.createObjectURL(imageBlob);
                    const image = new Image();

                    let start = window.performance.now();
                    image.onload = () => {
                        const tex = this.cameras[id][textureKey];
                        tex.dispose();
                        tex.image = image;
                        tex.needsUpdate = true;
                        // let end = window.performance.now();
                        if (textureKey === 'texture') {
                            // We know that capture takes 30ms
                            // Transmission takes ??s
                            this.cameras[id].setTime(start + 40);
                        }
                        this.cameras[id].loading[textureKey] = false;
                        // window.latencies[textureKey].push(end - start);
                        URL.revokeObjectURL(url);
                    };
                    image.onerror = (e) => {
                        console.error(e);
                    };
                    image.src = url;
                });
            };

            const urlColor = urlBase + 'color';
            const urlDepth = urlBase + 'depth';
            const urlMatrix = urlBase + 'matrix';

            connectWsToTexture(urlColor, 'texture', 'image/jpeg');
            connectWsToTexture(urlDepth, 'textureDepth', 'image/png');
            this.connectWsToMatrix(urlMatrix);
        }

        loadPointCloud(id, textureUrl, textureDepthUrl, matrix) {
            // const bytes = new Uint8Array(await msg.data.slice(0, 1).arrayBuffer());
            // const id = bytes[0];
            let newlyCreated = false;
            if (!this.cameras[id]) {
                this.createCameraVis(id);
                newlyCreated = true;
            }
            if (this.cameras[id].loading['texture'] || this.cameras[id].loading['textureDepth']) {
                return;
            }
            this.cameras[id].loading['texture'] = true;
            this.cameras[id].loading['textureDepth'] = true;
            // const pktType = bytes[1];
            // if (pktType === PKT_MATRIX) {
            //   const text = await msg.data.slice(2, msg.data.length).text();
            //   const mat = JSON.parse(text);
            // }
            // const imageBlob = msg.data.slice(1, msg.data.size, mimetype);
            // const url = URL.createObjectURL(imageBlob);
            const textureImage = new Image();
            const textureDepthImage = new Image();

            // 1. Update Texture

            let start = window.performance.now();
            textureImage.onload = () => {
                const tex = this.cameras[id]['texture'];
                tex.dispose();
                tex.image = textureImage;
                tex.needsUpdate = true;
                // let end = window.performance.now();
                // We know that capture takes 30ms
                // Transmission takes ??s
                this.cameras[id].setTime(start + 40);
                this.cameras[id].loading['texture'] = false;
                // window.latencies[textureKey].push(end - start);
                URL.revokeObjectURL(textureUrl);
            };
            textureImage.onerror = (e) => {
                console.error(e);
            };
            textureImage.src = textureUrl;

            // 2. Update Depth Texture

            textureDepthImage.onload = () => {
                const tex = this.cameras[id]['textureDepth'];
                tex.dispose();
                tex.image = textureDepthImage;
                tex.needsUpdate = true;
                // let end = window.performance.now();
                this.cameras[id].loading['textureDepth'] = false;
                // window.latencies[textureKey].push(end - start);
                URL.revokeObjectURL(textureDepthUrl);
            };
            textureDepthImage.onerror = (e) => {
                console.error(e);
            };
            textureDepthImage.src = textureDepthUrl;

            // 3. Update Matrix // TODO: console.log the depth buffer bytes and see if something's wrong with scale

            if (!matrix || !newlyCreated) { return; }

            // const mat = new Float32Array(await msg.data.slice(1, msg.data.size).arrayBuffer());
            this.cameras[id].update(matrix);

            let now = performance.now();
            for (let camera of Object.values(this.cameras)) {
                if (now - camera.lastUpdate > 2000) {
                    camera.mesh.visible = false;
                }
            }
        }

        createCameraVis(id) {
            if (debug) {
                console.log('new camera', id);
            }
            this.cameras[id] = new CameraVis(id, this.floorOffset);
            this.cameras[id].add();
        }
    };

})(realityEditor.device.cameraVis);
