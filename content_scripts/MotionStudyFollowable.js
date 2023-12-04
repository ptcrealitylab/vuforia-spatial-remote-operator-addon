import { Followable } from '../../src/gui/ar/Followable.js';

/**
 * Constructs and updates the sceneNode to follow a humanPoseAnalyzer's pose object
 */
export class MotionStudyFollowable extends Followable {
    static count = 0;

    constructor(frameKey) {
        MotionStudyFollowable.count++;
        let parentNode = realityEditor.sceneGraph.getVisualElement('AnalyticsCameraGroupContainer');
        if (!parentNode) {
            let gpNode = realityEditor.sceneGraph.getGroundPlaneNode();
            let motionStudyCameraGroupContainerId = realityEditor.sceneGraph.addVisualElement('AnalyticsCameraGroupContainer', gpNode);
            parentNode = realityEditor.sceneGraph.getSceneNodeById(motionStudyCameraGroupContainerId);
            let transformationMatrix = realityEditor.gui.ar.utilities.makeGroundPlaneRotationX(Math.PI / 2);
            transformationMatrix[13] = -1 * realityEditor.gui.ar.areaCreator.calculateFloorOffset(); // ground plane translation
            parentNode.setLocalMatrix(transformationMatrix);
        }
        let menuItemName = `Analytics ${MotionStudyFollowable.count}`;
        super(`AnalyticsFollowable_${frameKey}`, menuItemName, parentNode);

        this.frameKey = frameKey;
        this.floorOffset = realityEditor.gui.ar.areaCreator.calculateFloorOffset();
    }

    // continuously updates the sceneNode to be positioned a bit behind the
    // person's chest joint, rotated to match the direction that the person is facing
    updateSceneNode() {
        let matchingMotionStudy = realityEditor.motionStudy.getMotionStudyByFrame(this.frameKey);
        if (!matchingMotionStudy) return;
        if (matchingMotionStudy.humanPoseAnalyzer.lastDisplayedClones.length === 0) return;
        // TODO: for now we're following the first clone detected in that timestamp but if we support
        //  tracking multiple people at once then need to implement a way to switch to follow the second person
        let joints = matchingMotionStudy.humanPoseAnalyzer.lastDisplayedClones[0].pose.joints;
        let THREE = realityEditor.gui.threejsScene.THREE;
        // we calculate the direction the person is facing by crossing two vectors:
        // the neckToHead vector, and the neckToLeftShoulder vector
        let headPosition = joints.head.position;
        let neckPosition = joints.neck.position;
        let leftShoulderPosition = joints.left_shoulder.position;
        const neckToHeadVector = new THREE.Vector3().subVectors(headPosition, neckPosition).normalize();
        const neckToShoulderVector = new THREE.Vector3().subVectors(leftShoulderPosition, neckPosition).normalize();
        const neckRotationAxis = new THREE.Vector3().crossVectors(neckToHeadVector, neckToShoulderVector).normalize();
        // lookAt gives a convenient way to construct a rotation matrix by looking in the direction of the cross product
        const neckRotationMatrix = new THREE.Matrix4().lookAt(new THREE.Vector3(0, 0, 0), neckRotationAxis, new THREE.Vector3(0, 1, 0));
        // calculate the chest position relative to the floor
        let finalMatrix = new THREE.Matrix4().setPosition(joints.chest.position.x, joints.chest.position.y + this.floorOffset, joints.chest.position.z);
        // order matters! multiply the rotation after the position so that it doesn't affect the position
        finalMatrix.multiplyMatrices(finalMatrix, neckRotationMatrix);
        // move the position of the follow target to be 3 meters behind the person (better centers them in your view)
        let adjustment = new THREE.Matrix4().setPosition(0, 0, -3000);
        finalMatrix.multiplyMatrices(finalMatrix, adjustment);
        this.sceneNode.setLocalMatrix(finalMatrix.elements);
    }
}
