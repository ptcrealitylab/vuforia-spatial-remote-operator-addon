import * as THREE from '../../thirdPartyCode/three/three.module.js';
import {Spaghetti} from '../../src/humanPose/spaghetti.js';
import {CameraVisPatch} from './CameraVisPatch.js';
import {
    createPointCloud,
    createPointCloudMaterial,
    DEPTH_WIDTH,
    DEPTH_HEIGHT,
    ShaderMode
} from './Shaders.js';
import {VisualDiff} from './VisualDiff.js';

const debug = false;

function setMatrixFromArray(matrix, array) {
    matrix.set(
        array[0], array[4], array[8], array[12],
        array[1], array[5], array[9], array[13],
        array[2], array[6], array[10], array[14],
        array[3], array[7], array[11], array[15]
    );
}

export class CameraVis {
    constructor(id, floorOffset, color) {
        this.id = id;
        this.firstPersonMode = false;
        this.shaderMode = ShaderMode.SOLID;
        this.container = new THREE.Group();
        // this.container.scale.set(0.001, 0.001, 0.001);
        // this.container.rotation.y = Math.PI;
        this.container.position.y = -floorOffset;
        this.container.rotation.x = Math.PI / 2;

        this.container.updateMatrix();
        this.container.updateMatrixWorld(true);
        this.container.matrixAutoUpdate = false;

        this.container.name = 'CameraVisContainer_' + id;
        this.lastUpdate = Date.now();
        this.phone = new THREE.Group();
        this.phone.matrixAutoUpdate = false;
        this.phone.frustumCulled = false;
        this.container.add(this.phone);

        this.maxDepthMeters = 5; // this goes down if lidar is pointed at a wall/floor/object closer than 5 meters

        let parentNode = realityEditor.sceneGraph.getVisualElement('CameraGroupContainer');
        // let parentNode = realityEditor.sceneGraph.getGroundPlaneNode();
        // let parentNode = realityEditor.sceneGraph.getSceneNodeById(elementId);
        let sceneGraphNodeId = realityEditor.sceneGraph.addVisualElement('CameraVis_' + id, parentNode);
        this.sceneGraphNode = realityEditor.sceneGraph.getSceneNodeById(sceneGraphNodeId);

        this.cameraMeshGroup = new THREE.Group();

        const geo = new THREE.BoxGeometry(100, 100, 80);
        if (!color) {
            let colorId = id;
            if (typeof id === 'string') {
                colorId = 0;
                for (let i = 0; i < id.length; i++) {
                    colorId ^= id.charCodeAt(i);
                }
            }
            let hue = ((colorId / 29) % Math.PI) * 360 / Math.PI;
            const colorStr = `hsl(${hue}, 100%, 50%)`;
            this.color = new THREE.Color(colorStr);
        } else {
            this.color = color;
        }
        this.colorRGB = [
            255 * this.color.r,
            255 * this.color.g,
            255 * this.color.b,
        ];
        this.cameraMeshGroupMat = new THREE.MeshBasicMaterial({color: this.color});
        const box = new THREE.Mesh(geo, this.cameraMeshGroupMat);
        box.name = 'cameraVisCamera';
        box.cameraVisId = this.id;
        this.cameraMeshGroup.add(box);

        const geoCone = new THREE.ConeGeometry(60, 180, 16, 1);
        const cone = new THREE.Mesh(geoCone, this.cameraMeshGroupMat);
        cone.rotation.x = -Math.PI / 2;
        cone.rotation.y = Math.PI / 8;
        cone.position.z = 65;
        cone.name = 'cameraVisCamera';
        cone.cameraVisId = this.id;
        this.cameraMeshGroup.add(cone);

        this.phone.add(this.cameraMeshGroup);

        this.texture = new THREE.Texture();
        this.texture.minFilter = THREE.LinearFilter;
        this.texture.magFilter = THREE.LinearFilter;
        this.texture.generateMipmaps = false;
        this.texture.isVideoTexture = true;
        this.texture.update = function() {
        };

        this.textureDepth = new THREE.Texture();
        this.textureDepth.minFilter = THREE.LinearFilter;
        this.textureDepth.magFilter = THREE.LinearFilter;
        this.textureDepth.generateMipmaps = false;
        this.textureDepth.isVideoTexture = true;
        this.textureDepth.update = function() {
        };

        this.material = null;
        this.mesh = null;

        if (debug) {
            this.setupDebugCubes();
        }

        this.setupPointCloud();

        this.time = performance.now();
        this.matrices = [];
        this.loading = {};

        this.historyPoints = [];
        // note: we will color the path in each point, rather than in the constructor
        this.historyMesh = new Spaghetti(this.historyPoints, null, 'Camera Spaghetti Line', {
            widthMm: 30,
            heightMm: 30,
            usePerVertexColors: true,
            wallBrightness: 0.6
        });

        // we add the historyMesh to scene because crossing up vector gets messed up by rotation if added to this.container
        realityEditor.gui.threejsScene.addToScene(this.historyMesh);
    }

    /**
     * Clone the current state of the mesh rendering part of this CameraVis
     * @param {ShaderMode} shaderMode - initial shader mode to set on the patches
     * @return {{key: string, patch: CameraVisPatch}} unique key for patch and object containing all relevant meshes
     */
    clonePatch(shaderMode) {
        let now = Date.now();
        let serialization = {
            key: '',
            id: this.id,
            container: Array.from(this.container.matrix.elements),
            phone: Array.from(this.phone.matrix.elements),
            texture: this.texture.image.toDataURL('image/jpeg', 0.7),
            textureDepth: this.textureDepth.image.toDataURL(),
            creationTime: now,
        };
        const frameKey = CameraVisPatch.createToolForPatchSerialization(serialization, shaderMode);

        return {
            key: frameKey,
            patch: CameraVisPatch.createPatch(
                this.container.matrix,
                this.phone.matrix,
                this.texture.image,
                this.textureDepth.image,
                now,
                shaderMode
            ),
        };
    }



    setupDebugCubes() {
        let debugDepth = new THREE.MeshBasicMaterial({
            map: this.textureDepth,
        });
        let debugDepthCube = new THREE.Mesh(new THREE.PlaneGeometry(500, 500 * DEPTH_HEIGHT / DEPTH_WIDTH), debugDepth);
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
        const mesh = createPointCloud(this.texture, this.textureDepth, this.shaderMode, this.color);

        this.mesh = mesh;
        this.material = mesh.material;

        this.phone.add(mesh);
    }

    update(mat, delayed, rawMatricesMsg) {
        let now = performance.now();
        if (this.shaderMode === ShaderMode.HOLO) {
            this.material.uniforms.time.value = window.performance.now();
        }
        this.lastUpdate = now;


        if (rawMatricesMsg) {
            let width = this.material.uniforms.width.value;
            let height = this.material.uniforms.height.value;
            let rawWidth = rawMatricesMsg.imageSize[0];
            let rawHeight = rawMatricesMsg.imageSize[1];

            this.material.uniforms.focalLength.value = new THREE.Vector2(
                rawMatricesMsg.focalLength[0] / rawWidth * width,
                rawMatricesMsg.focalLength[1] / rawHeight * height,
            );
            // convert principal point from image Y-axis bottom-to-top in Vuforia to top-to-bottom in OpenGL
            this.material.uniforms.principalPoint.value = new THREE.Vector2(
                rawMatricesMsg.principalPoint[0] / rawWidth * width,
                (rawHeight - rawMatricesMsg.principalPoint[1]) / rawHeight * height,
            );
        }

        if (this.time > now || !delayed) {
            this.setMatrix(mat);
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
        this.matrices.splice(0, latestI + 1);

        this.setMatrix(latest.matrix);
    }

    getSceneNodeMatrix() {
        let matrix = this.phone.matrixWorld.clone();

        let initialVehicleMatrix = new THREE.Matrix4().fromArray([
            -1, 0, 0, 0,
            0, 1, 0, 0,
            0, 0, -1, 0,
            0, 0, 0, 1,
        ]);
        matrix.multiply(initialVehicleMatrix);

        return matrix;
    }

    setMatrix(newMatrix) {
        setMatrixFromArray(this.phone.matrix, newMatrix);
        this.phone.updateMatrixWorld(true);
        this.texture.needsUpdate = true;
        this.textureDepth.needsUpdate = true;

        if (this.cutoutViewFrustum) {
            realityEditor.gui.ar.desktopRenderer.updateAreaGltfForCamera(this.id, this.phone.matrixWorld, this.maxDepthMeters);
        }

        this.hideNearCamera(newMatrix[12], newMatrix[13], newMatrix[14]);
        let localHistoryPoint = new THREE.Vector3( newMatrix[12], newMatrix[13], newMatrix[14]);

        // history point needs to be transformed into the groundPlane coordinate system
        let worldHistoryPoint = this.container.localToWorld(localHistoryPoint);
        let rootNode = realityEditor.sceneGraph.getSceneNodeById('ROOT');
        let gpNode = realityEditor.sceneGraph.getGroundPlaneNode();
        let gpHistoryPoint = realityEditor.sceneGraph.convertToNewCoordSystem(worldHistoryPoint, rootNode, gpNode);

        let nextHistoryPoint = {
            x: gpHistoryPoint.x,
            y: gpHistoryPoint.y,
            z: gpHistoryPoint.z,
            color: this.colorRGB,
            timestamp: Date.now()
        };

        let addToHistory = this.historyPoints.length === 0;
        if (this.historyPoints.length > 0) {
            let lastHistoryPoint = this.historyPoints[this.historyPoints.length - 1];
            let diffSq = (lastHistoryPoint.x - nextHistoryPoint.x) * (lastHistoryPoint.x - nextHistoryPoint.x) +
                (lastHistoryPoint.y - nextHistoryPoint.y) * (lastHistoryPoint.y - nextHistoryPoint.y) +
                (lastHistoryPoint.z - nextHistoryPoint.z) * (lastHistoryPoint.z - nextHistoryPoint.z);

            addToHistory = diffSq > 100 * 100;
        }

        if (addToHistory) {
            this.historyPoints.push(nextHistoryPoint);
            this.historyMesh.setPoints(this.historyPoints);
        }

        if (this.sceneGraphNode) {
            this.sceneGraphNode.setLocalMatrix(newMatrix);
        }

        if (this.firstPersonMode) {
            let matrix = this.getSceneNodeMatrix();
            let eye = new THREE.Vector3(0, 0, 0);
            eye.applyMatrix4(matrix);
            let target = new THREE.Vector3(0, 0, -1);
            target.applyMatrix4(matrix);
            matrix.lookAt(eye, target, new THREE.Vector3(0, 1, 0));
            realityEditor.sceneGraph.setCameraPosition(matrix.elements);
        }

        if (this.shaderMode === ShaderMode.DIFF) {
            this.visualDiff.showCameraVisDiff(this);
        }
    }

    hideNearCamera() {
        let mat = this.phone.matrix.clone();
        mat.premultiply(this.container.matrix);
        const x = mat.elements[12];
        const y = mat.elements[13];
        const z = mat.elements[14];

        let cameraNode = realityEditor.sceneGraph.getSceneNodeById('CAMERA');
        const cameraX = cameraNode.worldMatrix[12];
        const cameraY = cameraNode.worldMatrix[13];
        const cameraZ = cameraNode.worldMatrix[14];

        let diffSq = (cameraX - x) * (cameraX - x) +
            (cameraY - y) * (cameraY - y) +
            (cameraZ - z) * (cameraZ - z);

        if (diffSq < 3000 * 3000) {
            if (this.cameraMeshGroup.visible) {
                this.cameraMeshGroup.visible = false;
            }
        } else if (!this.cameraMeshGroup.visible) {
            this.cameraMeshGroup.visible = true;
        }
    }

    setShaderMode(shaderMode) {
        if (shaderMode !== this.shaderMode) {
            this.shaderMode = shaderMode;

            if (this.matDiff) {
                this.matDiff.dispose();
                this.matDiff = null;
            }

            if (this.shaderMode === ShaderMode.DIFF && !this.visualDiff) {
                this.visualDiff = new VisualDiff();
            }
            this.material = createPointCloudMaterial(this.texture, this.textureDepth, this.shaderMode, this.color);
            this.mesh.material = this.material;
        }
    }

    enableFirstPersonMode() {
        this.firstPersonMode = true;
        if (this.shaderMode === ShaderMode.SOLID) {
            this.setShaderMode(ShaderMode.FIRST_PERSON);
        }
    }

    disableFirstPersonMode() {
        this.firstPersonMode = false;
        if (this.shaderMode === ShaderMode.FIRST_PERSON) {
            this.setShaderMode(ShaderMode.SOLID);
        }
    }

    enableFrustumCutout() {
        this.cutoutViewFrustum = true;
    }

    disableFrustumCutout() {
        this.cutoutViewFrustum = false;
        realityEditor.gui.threejsScene.removeMaterialCullingFrustum(this.id);
    }

    /**
     * @param {THREE.Color} color
     */
    setColor(color) {
        this.color = color;
        this.cameraMeshGroupMat.color = color;
        if (this.material && this.material.uniforms.borderColor) {
            this.material.uniforms.borderColor.value = color;
        }
    }

    add() {
        realityEditor.gui.threejsScene.addToScene(this.container);
    }

    remove() {
        realityEditor.gui.threejsScene.removeFromScene(this.container);
    }
}
