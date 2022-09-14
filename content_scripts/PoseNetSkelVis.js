createNameSpace('realityEditor.gui.ar.desktopRenderer');

import * as THREE from '../../thirdPartyCode/three/three.module.js';

(function(exports) {

    const POSE_JOINTS = {
        NOSE: 'nose',
        LEFT_EYE: 'left eye',
        RIGHT_EYE: 'right eye',
        LEFT_EAR: 'left ear',
        RIGHT_EAR: 'right ear',
        LEFT_SHOULDER: 'left shoulder',
        RIGHT_SHOULDER: 'right shoulder',
        LEFT_ELBOW: 'left elbow',
        RIGHT_ELBOW: 'right elbow',
        LEFT_WRIST: 'left wrist',
        RIGHT_WRIST: 'right wrist',
        LEFT_HIP: 'left hip',
        RIGHT_HIP: 'right hip',
        LEFT_KNEE: 'left knee',
        RIGHT_KNEE: 'right knee',
        LEFT_ANKLE: 'left ankle',
        RIGHT_ANKLE: 'right ankle',
        HEAD: 'head synthetic',
        NECK: 'neck synthetic',
        CHEST: 'chest synthetic',
        NAVEL: 'navel synthetic',
        PELVIS: 'pelvis synthetic',
        // LEFT_HAND: 'left hand synthetic',
        // RIGHT_HAND: 'right hand synthetic',
    };

    Object.keys(POSE_JOINTS).forEach((key, i) => {
        POSE_JOINTS[key] = i;
    });

    const POSE_JOINTS_LEN = Object.keys(POSE_JOINTS).length;

    const POSE_JOINTS_COOL = POSE_JOINTS;

    const POSE_JOINTS_COOL_INDEX = Object.values(POSE_JOINTS_COOL);

    const JOINT_CONNECTIONS = [
        [POSE_JOINTS.LEFT_WRIST, POSE_JOINTS.LEFT_ELBOW], // 0
        [POSE_JOINTS.LEFT_ELBOW, POSE_JOINTS.LEFT_SHOULDER],
        [POSE_JOINTS.LEFT_SHOULDER, POSE_JOINTS.RIGHT_SHOULDER],
        [POSE_JOINTS.RIGHT_SHOULDER, POSE_JOINTS.RIGHT_ELBOW],
        [POSE_JOINTS.RIGHT_ELBOW, POSE_JOINTS.RIGHT_WRIST],
        [POSE_JOINTS.LEFT_SHOULDER, POSE_JOINTS.LEFT_HIP], // 5
        [POSE_JOINTS.LEFT_HIP, POSE_JOINTS.RIGHT_HIP],
        [POSE_JOINTS.RIGHT_HIP, POSE_JOINTS.RIGHT_SHOULDER],
        [POSE_JOINTS.LEFT_HIP, POSE_JOINTS.LEFT_KNEE],
        [POSE_JOINTS.LEFT_KNEE, POSE_JOINTS.LEFT_ANKLE],
        [POSE_JOINTS.RIGHT_HIP, POSE_JOINTS.RIGHT_KNEE], // 10
        [POSE_JOINTS.RIGHT_KNEE, POSE_JOINTS.RIGHT_ANKLE], // 11
        [POSE_JOINTS.HEAD, POSE_JOINTS.NECK],
        [POSE_JOINTS.NECK, POSE_JOINTS.CHEST],
        [POSE_JOINTS.CHEST, POSE_JOINTS.NAVEL],
        [POSE_JOINTS.NAVEL, POSE_JOINTS.PELVIS],
    ];

    class PoseNetSkelVis {
        constructor(skel, floorOffset, historyLineContainer) {
            this.spheres = [];
            this.container = new THREE.Group();
            this.container.position.y = -floorOffset;
            this.container.scale.set(1000, 1000, 1000);
            // this.container.rotation.y = Math.PI;
            this.bones = [];
            this.ghost = (typeof skel.id === 'string') && skel.id.includes('ghost');
            this.createSpheres();
            this.createHistoryLine(historyLineContainer);
            this.update(skel);
        }

        createSpheres() {
            const geo = new THREE.SphereGeometry(0.03, 12, 12);
            const mat = new THREE.MeshBasicMaterial({color: this.ghost ? 0x777777 : 0x0077ff});
            for (const _joint in POSE_JOINTS_COOL) {
                // TODO use instanced mesh for better performance
                let sphere = new THREE.Mesh(geo, mat);
                this.spheres.push(sphere);
                this.container.add(sphere);
            }
            const geoCyl = new THREE.CylinderGeometry(0.01, 0.01, 1, 3);
            for (const _conn of JOINT_CONNECTIONS) {
                let bone = new THREE.Mesh(geoCyl, mat);
                this.bones.push(bone);
                this.container.add(bone);
            }

            // Hide the shoulder-hip connections manually
            this.bones[5].visible = false;
            this.bones[7].visible = false;

            this.redMaterial = new THREE.MeshBasicMaterial({color: this.ghost ? 0x777777 : 0xFF0000});
            this.yellowMaterial = new THREE.MeshBasicMaterial({color: this.ghost ? 0x777777 : 0xFFFF00});
            this.greenMaterial = new THREE.MeshBasicMaterial({color: this.ghost ? 0x777777 : 0x00ff00});
        }

        createHistoryLine(container) {
            this.historyLine = new realityEditor.device.meshLine.MeshLine();
            const lineMat = new realityEditor.device.meshLine.MeshLineMaterial({
                color: this.ghost ? 0x777777 : 0xffff00,
                // opacity: 0.6,
                lineWidth: 14,
                // depthWrite: false,
                transparent: false,
                side: THREE.DoubleSide,
            });
            this.historyMesh = new THREE.Mesh(this.historyLine, lineMat);
            this.historyPoints = [];
            this.historyLine.setPoints(this.historyPoints);
            container.add(this.historyMesh);
        }

        update(skel) {
            if (skel.joints.length !== POSE_JOINTS_LEN) {
                console.warn('other pose format passed into PoseNetSkelVis');
                return;
            }

            for (let i = 0; i < this.spheres.length; i++) {
                let jointI = POSE_JOINTS_COOL_INDEX[i];
                let joint = skel.joints[jointI];
                let sphere = this.spheres[i];
                sphere.position.x = joint.x;
                sphere.position.y = joint.y;
                sphere.position.z = joint.z;
            }

            this.historyPoints.push(new THREE.Vector3(
                this.spheres[0].position.x,
                this.spheres[0].position.y + 0.4,
                this.spheres[0].position.z,
            ));
            this.historyLine.setPoints(this.historyPoints);

            for (let i = 0; i < this.bones.length; i++) {
                let bone = this.bones[i];
                let jointA = skel.joints[JOINT_CONNECTIONS[i][0]];
                let jointB = skel.joints[JOINT_CONNECTIONS[i][1]];

                bone.position.x = (jointA.x + jointB.x) / 2;
                bone.position.y = (jointA.y + jointB.y) / 2;
                bone.position.z = (jointA.z + jointB.z) / 2;
                bone.rotation.set(0, 0, 0);

                let diff = new THREE.Vector3(jointB.x - jointA.x, jointB.y - jointA.y,
                    jointB.z - jointA.z);

                bone.scale.y = 1;
                let localTarget = new THREE.Vector3(
                    jointB.x, jointB.y, jointB.z);
                bone.lookAt(this.container.localToWorld(localTarget));
                bone.rotateX(Math.PI / 2);
                bone.scale.y = diff.length();
            }

            const angles = Object.entries(skel.angles);
            for (let item of angles) {
                let boneNum = item[1][3];
                let boneColor = item[1][5];
                if (boneColor == 0) {
                    this.bones[boneNum].material = this.greenMaterial;
                }
                if (boneColor == 1) {
                    this.bones[boneNum].material = this.yellowMaterial;
                } else if (boneColor == 2) {
                    this.bones[boneNum].material = this.redMaterial;
                }
            }

        }

        addToScene() {
            realityEditor.gui.threejsScene.addToScene(this.container);
        }

        removeFromScene() {
            realityEditor.gui.threejsScene.removeFromScene(this.container);
            this.bones[0].geometry.dispose();
            this.spheres[0].geometry.dispose();
            this.spheres[0].material.dispose();
        }
    }

    exports.PoseNetSkelVis = PoseNetSkelVis;
    exports.POSE_NET_JOINTS_LEN = POSE_JOINTS_LEN;

})(realityEditor.gui.ar.desktopRenderer);
