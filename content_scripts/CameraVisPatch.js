import * as THREE from '../../thirdPartyCode/three/three.module.js';
import {createPointCloud, ShaderMode} from './Shaders.js';
import {VisualDiff} from './VisualDiff.js';

/**
 * All data serialized to store a CameraVis patch (3d picture)
 * Notably `key` corresponds to frame key
 * @typedef {{
 *   key: string,
 *   container: Array<number>,
 *   phone: Array<number>,
 *   texture: string,
 *   textureDepth: string,
 *   creationTime: number,
 * }} PatchSerialization
 */

export class CameraVisPatch {
    constructor(container, mesh, phoneMesh) {
        this.container = container;
        this.mesh = mesh;
        this.phone = phoneMesh;
        this.material = this.mesh.material;
        this.shaderMode = ShaderMode.SOLID;
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

    showDiff() {
        this.setShaderMode(ShaderMode.DIFF);
    }

    hideDiff() {
        this.setShaderMode(ShaderMode.SOLID);
    }

    setShaderMode(shaderMode) {
        if (shaderMode !== this.shaderMode) {
            this.shaderMode = shaderMode;

            if (this.matDiff) {
                this.matDiff.dispose();
                this.matDiff = null;
            }

            if (this.shaderMode === ShaderMode.HIDDEN) {
                this.container.visible = false;
                return;
            }

            this.container.visible = true;

            if ((this.shaderMode === ShaderMode.DIFF ||
                 this.shaderMode === ShaderMode.DIFF_DEPTH) &&
                     !this.visualDiff) {
                this.visualDiff = new VisualDiff();
            }

            if (this.shaderMode === ShaderMode.DIFF ||
                this.shaderMode === ShaderMode.DIFF_DEPTH) {
                this.visualDiff.showCameraVisDiff(this);
            } else {
                this.mesh.material = this.material;
            }
        }
    }

    add() {
        realityEditor.gui.threejsScene.addToScene(this.container);
    }

    remove() {
        realityEditor.gui.threejsScene.removeFromScene(this.container);
    }

    /**
     * @param {PatchSerialization} serialization
     * @return {string} frame key
     */
    static createToolForPatchSerialization(serialization) {
        let toolMatrix = new THREE.Matrix4().fromArray(serialization.phone);
        let containerMatrix = new THREE.Matrix4().fromArray(serialization.container);
        // Sets y to 0 because it will soon be positioned with a built-in groundplane offset
        containerMatrix.elements[13] = 0;
        toolMatrix.premultiply(containerMatrix);
        toolMatrix.multiply(new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(0, 0, Math.PI / 2)));

        let addedTool = realityEditor.gui.pocket.createFrame('spatialPatch', {
            noUserInteraction: true,
            initialMatrix: toolMatrix.elements,
            onUploadComplete: () => {
                realityEditor.network.postVehiclePosition(addedTool);
                write();
            },
        });

        const frameKey = addedTool.uuid;
        serialization.key = frameKey;
        const write = () => {
            realityEditor.network.realtime.writePublicData(
                addedTool.objectId, frameKey, frameKey + 'storage',
                'serialization', serialization
            );
        };
        setTimeout(write, 500);
        setTimeout(write, 3000);

        return addedTool.uuid;
    }

    /**
     * @param {Array<number>} containerMatrix - array representing 4x4 matrix from threejs
     * @param {Array<number>} phoneMatrix - array representing 4x4 matrix from threejs
     * @param {string} textureImage - base64 data url for texture
     * @param {string} textureDepthImage - base64 data url for depth texture
     * @param {number} creationTime - Time when patch created. Usually from Date.now()
     * @return {CameraVisPatch}
     */
    static createPatch(containerMatrix, phoneMatrix, textureImage, textureDepthImage, creationTime) {
        let patch = new THREE.Group();
        patch.matrix.copy(containerMatrix);
        patch.matrixAutoUpdate = false;
        patch.matrixWorldNeedsUpdate = true;

        let phone = new THREE.Group();
        phone.matrix.copy(phoneMatrix);
        phone.matrixAutoUpdate = false;
        phone.matrixWorldNeedsUpdate = true;
        phone.frustumCulled = false;

        let texture = new THREE.Texture();
        // texture.minFilter = THREE.NearestFilter;
        // texture.magFilter = THREE.NearestFilter;
        // texture.minFilter = THREE.LinearFilter;
        // texture.magFilter = THREE.LinearFilter;
        // texture.generateMipmaps = false;

        let textureDepth = new THREE.Texture();
        // textureDepth.minFilter = THREE.NearestFilter;
        // textureDepth.magFilter = THREE.NearestFilter;
        // textureDepth.minFilter = THREE.LinearFilter;
        // textureDepth.magFilter = THREE.LinearFilter;
        // textureDepth.generateMipmaps = false;

        texture.image = textureImage;
        textureDepth.image = textureDepthImage;

        texture.needsUpdate = true;
        textureDepth.needsUpdate = true;

        let mesh = createPointCloud(texture, textureDepth, ShaderMode.SOLID);
        mesh.material.uniforms.patchLoading.value = 0;

        let lastTime = -1;
        function patchLoading(time) {
            if (lastTime < 0) {
                lastTime = time;
            }
            // limit to 30fps
            let dt = Math.min(time - lastTime, 67);
            lastTime = time;
            mesh.material.uniforms.patchLoading.value += 8 * dt / 1000;
            if (mesh.material.uniforms.patchLoading.value < 1) {
                window.requestAnimationFrame(patchLoading);
            } else {
                mesh.material.uniforms.patchLoading.value = 1;
            }
        }
        window.requestAnimationFrame(patchLoading);

        phone.add(mesh);
        patch.add(phone);

        patch.__creationTime = creationTime;
        return new CameraVisPatch(patch, mesh, phone);
    }
}
