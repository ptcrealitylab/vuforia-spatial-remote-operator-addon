createNameSpace('realityEditor.device.cameraVis');

(function(exports) {
    const debug = false;

    const urlBase = 'ws://localhost:31337/'; // window.location.toString().replace(/^http/, 'ws')
    const vertexShader = `
uniform sampler2D map;
uniform sampler2D mapDepth;

uniform float width;
uniform float height;

uniform float pointSize;

varying vec2 vUv;

const float XtoZ = 1920.0 / 1448.24976; // width over focal length
const float YtoZ = 1080.0 / 1448.24976;

void main() {
  vUv = vec2(position.x / width, position.y / height);

  vec4 color = texture2D(mapDepth, vUv);
  float depth = (color.r + color.g / 256.0 + color.b / (256.0 * 256.0)) * 1000.0;

  // Projection code by @kcmic

  float z = depth * 256.0; // Not exactly sure why it's this

  vec4 pos = vec4(
    (position.x / width - 0.5) * z * XtoZ,
    (position.y / height - 0.5) * z * YtoZ,
    -z,
    1.0);

  gl_PointSize = pointSize;
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
        constructor() {
            const THREE = realityEditor.gui.threejsScene.THREE;

            this.container = new THREE.Group();
            // this.container.scale.set(0.001, 0.001, 0.001);
            // this.container.rotation.y = Math.PI;
            this.container.rotation.x = Math.PI / 2;
            this.phone = new THREE.Group();
            this.phone.matrixAutoUpdate = false;
            this.phone.frustumCulled = false;
            this.container.add(this.phone);

            const geo = new THREE.BoxGeometry(150, 150, 150);
            const mat = new THREE.MeshBasicMaterial({color: 0xaaaaaa});
            this.box = new THREE.Mesh(geo, mat);
            this.box.visible = true;
            this.phone.add(this.box);

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
                    pointSize: { value: 2 },
                },
                vertexShader,
                fragmentShader,
                // blending: THREE.AdditiveBlending,
                depthTest: false, depthWrite: false,
                transparent: true
            });

            this.mesh = new THREE.Points(this.geometry, this.material);
            this.mesh.scale.set(-1, 1, -1);
            this.phone.add(this.mesh);
        }

        update(mat) {
            let now = performance.now();
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
        }

        add() {
            realityEditor.gui.threejsScene.addToScene(this.container);
        }

        remove() {
            realityEditor.gui.threejsScene.removeFromScene(this.container);
        }
    }

    exports.CameraVisCoordinator = class CameraVisCoordinator {
        constructor() {
            this.cameras = {};
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
            });
        }

        connect() {
            const connectWsToTexture = (url, textureKey, mimetype) => {
                const ws = new WebSocket(url);
                const image = new Image();

                ws.addEventListener('message', async (msg) => {
                    const bytes = new Uint8Array(await msg.data.slice(0, 1).arrayBuffer());
                    const id = bytes[0];
                    // const pktType = bytes[1];
                    // if (pktType === PKT_MATRIX) {
                    //   const text = await msg.data.slice(2, msg.data.length).text();
                    //   const mat = JSON.parse(text);
                    // }
                    const imageBlob = msg.data.slice(1, msg.data.size, mimetype);
                    const url = URL.createObjectURL(imageBlob);

                    let start = window.performance.now();
                    image.onload = () => {
                        if (!this.cameras[id]) {
                            this.createCameraVis(id);
                        }
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

        createCameraVis(id) {
            this.cameras[id] = new CameraVis();
            this.cameras[id].add();
        }
    };

})(realityEditor.device.cameraVis);
