import * as THREE from '../../thirdPartyCode/three/three.module.js';
import {ShaderMode} from './Shaders.js';
import {VisualDiff} from './VisualDiff.js';

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
}
