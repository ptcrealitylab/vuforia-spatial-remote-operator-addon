import * as THREE from '../../thirdPartyCode/three/three.module.js';

const DEBUG = false;

const vertexShader = `
varying vec2 vUv;
void main() {
vUv = uv;
gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );
}
`;

const fragmentShader = `
// base rt texture
uniform sampler2D mapBase;
// camera rt texture
uniform sampler2D mapCamera;

// uv (0.0-1.0) texture coordinates
varying vec2 vUv;

void main() {
vec4 colorBase = texture2D(mapBase, vUv);
vec4 colorCamera = texture2D(mapCamera, vUv);

vec3 diffC = abs(colorBase.rgb - colorCamera.rgb);
float alpha = colorBase.a * colorCamera.a;

alpha = alpha * step(0.5, dot(diffC, diffC));
gl_FragColor = vec4(0.7, 0.0, 0.7, alpha);
}`;

export class VisualDiff {
    constructor(cameraVis) {
        this.cameraVis = cameraVis;
        this.rtBase = null;
        this.rtCamera = null;
    }

    init() {
        let width = 640; // window.innerWidth;
        let height = 360; // window.innerHeight;

        this.rtBase = new THREE.WebGLRenderTarget(width, height, {
            // depthBuffer: false,
            // stencilBuffer: false,
        });
        this.rtCamera = new THREE.WebGLRenderTarget(width, height, {
            // depthBuffer: false,
            // stencilBuffer: false,
        });

        if (DEBUG) {
            let matBase = new THREE.MeshBasicMaterial({
                map: this.rtBase.texture,
                transparent: true,
            });
            let cubeBase = new THREE.Mesh(new THREE.PlaneGeometry(500, 500 * height / width), matBase);
            realityEditor.gui.threejsScene.addToScene(cubeBase);
            cubeBase.position.set(400, 250, -1000);

            let matCamera = new THREE.MeshBasicMaterial({
                map: this.rtCamera.texture,
                transparent: true,
            });
            let cubeCamera = new THREE.Mesh(new THREE.PlaneGeometry(500, 500 * height / width), matCamera);
            realityEditor.gui.threejsScene.addToScene(cubeCamera);
            cubeCamera.position.set(-400, 250, -1000);

            let matDiff = new THREE.ShaderMaterial({
                uniforms: {
                    mapBase: {value: this.rtBase.texture},
                    mapCamera: {value: this.rtCamera.texture},
                },
                vertexShader,
                fragmentShader,
                transparent: true,
            });
            let cubeDiff = new THREE.Mesh(new THREE.PlaneGeometry(500, 500 * height / width), matDiff);
            realityEditor.gui.threejsScene.addToScene(cubeDiff);
            cubeDiff.position.set(-900, 250, -1000);
        }
    }

    /**
     * Get the diff material based on a given standard CameraVis/Patch material
     * @param {THREE.Material} material
     * @return {THREE.Material}
     */
    getMaterial(material) {
        if (!this.rtBase) {
            this.init();
        }

        let matDiff = material.clone();
        matDiff.fragmentShader = fragmentShader;
        matDiff.uniforms = material.uniforms;
        matDiff.uniforms.mapBase = {value: this.rtBase.texture};
        matDiff.uniforms.mapCamera = {value: this.rtCamera.texture};
        return matDiff;
    }

    showCameraVisDiff(cameraVis) {
        if (cameraVis.shaderMode !== 'DIFF') {
            console.error('VisualDiff called without shader mode being DIFF');
            return;
        }

        if (!cameraVis.matDiff) {
            let matDiff = this.getMaterial(cameraVis.material);
            cameraVis.matDiff = matDiff;
        }

        let sceneNodeMatrix = cameraVis.getSceneNodeMatrix();
        this.showDiff(cameraVis.mesh, sceneNodeMatrix, cameraVis.matDiff, cameraVis.material);
    }

    showDiff(mesh, sceneNodeMatrix, matDiff, matBase) {
        // Set standard material to draw normally for visual difference
        mesh.material = matBase;

        let {scene, camera, renderer} = realityEditor.gui.threejsScene.getInternals();

        let originalCameraMatrix = camera.matrix.clone();
        realityEditor.sceneGraph.setCameraPosition(sceneNodeMatrix.elements);

        // Move camera to match CameraVis position exactly (not pointing up)
        // Turn off everything but base mesh
        camera.layers.set(1);
        renderer.setRenderTarget(this.rtBase);
        renderer.clear();
        renderer.render(scene, camera);
        // Now draw only the cameravis
        camera.layers.set(2);
        renderer.setRenderTarget(this.rtCamera);
        renderer.clear();
        renderer.render(scene, camera);
        // rt diff is the diff, draw it on the cameravis sort of
        renderer.setRenderTarget(null);

        realityEditor.sceneGraph.setCameraPosition(originalCameraMatrix.elements);

        // Now set diff material to draw the diff on screen
        mesh.material = matDiff;
    }
}
