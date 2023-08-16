import { Followable } from '../../src/gui/ar/CameraFollowTarget.js';

/**
 * Constructs and updates the sceneNode to follow a humanPoseAnalyzer's pose object
 */
export class AnalyticsFollowable extends Followable {
    static count = 0;

    constructor(frameKey) {
        AnalyticsFollowable.count++;
        let parentNode = realityEditor.sceneGraph.getVisualElement('AnalyticsCameraGroupContainer');
        if (!parentNode) {
            let gpNode = realityEditor.sceneGraph.getGroundPlaneNode();
            let analyticsCameraGroupContainerId = realityEditor.sceneGraph.addVisualElement('AnalyticsCameraGroupContainer', gpNode);
            parentNode = realityEditor.sceneGraph.getSceneNodeById(analyticsCameraGroupContainerId);
            let transformationMatrix = realityEditor.gui.ar.utilities.makeGroundPlaneRotationX(Math.PI / 2);
            transformationMatrix[13] = -1 * realityEditor.gui.ar.areaCreator.calculateFloorOffset(); // ground plane translation
            parentNode.setLocalMatrix(transformationMatrix);
        }
        let displayName = `Analytics ${AnalyticsFollowable.count}`;
        super(`AnalyticsFollowable_${frameKey}`, displayName, parentNode);

        this.frameKey = frameKey;
        this.floorOffset = realityEditor.gui.ar.areaCreator.calculateFloorOffset();
    }
    updateSceneNode() {
        let matchingAnalytics = realityEditor.analytics.getAnalyticsByFrame(this.frameKey);
        if (!matchingAnalytics) return;
        if (matchingAnalytics.humanPoseAnalyzer.lastDisplayedClones.length === 0) return;
        // TODO: for now we're following the first clone detected in that timestamp but if we support
        //  tracking multiple people at once then need to implement a way to switch to follow the second person
        let joints = matchingAnalytics.humanPoseAnalyzer.lastDisplayedClones[0].pose.joints;
        let THREE = realityEditor.gui.threejsScene.THREE;
        let headPosition = joints.head.position;
        let neckPosition = joints.neck.position;
        let leftShoulderPosition = joints.left_shoulder.position;
        const neckToHeadVector = new THREE.Vector3().subVectors(headPosition, neckPosition).normalize();
        const neckToShoulderVector = new THREE.Vector3().subVectors(leftShoulderPosition, neckPosition).normalize();
        const neckRotationAxis = new THREE.Vector3().crossVectors(neckToHeadVector, neckToShoulderVector).normalize();
        // calculate the rotation matrix by looking in the direction of the forward vector
        const neckRotationMatrix = new THREE.Matrix4().lookAt(new THREE.Vector3(0, 0, 0), neckRotationAxis, new THREE.Vector3(0, 1, 0));
        // calculate the position by adding the floor position to the chest position
        let finalMatrix = new THREE.Matrix4().setPosition(joints.chest.position.x, joints.chest.position.y + this.floorOffset, joints.chest.position.z);
        // multiply the rotation after the position so that it doesn't affect the position
        finalMatrix.multiplyMatrices(finalMatrix, neckRotationMatrix); 
        // move the position of the follow target to be 2 meters behind the person (so you better center them in your view)
        let adjustment = new THREE.Matrix4().setPosition(0, 0, -2000);
        finalMatrix.multiplyMatrices(finalMatrix, adjustment);
        this.sceneNode.setLocalMatrix(finalMatrix.elements);
    }
}
