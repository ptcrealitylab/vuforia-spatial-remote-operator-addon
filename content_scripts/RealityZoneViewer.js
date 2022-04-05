createNameSpace('realityEditor.gui.ar.desktopRenderer');

(function(exports) {

    exports.RealityZoneViewer = class RealityZoneViewer {
        constructor(floorOffset) {

            // Hololens Dummy
            const THREE = realityEditor.gui.threejsScene.THREE;
            const FBXLoader = realityEditor.gui.threejsScene.FBXLoader;
            const GLTFLoader = realityEditor.gui.threejsScene.GLTFLoader;
            const cubeGeom = new THREE.BoxGeometry( 100, 100, 100 );
            const mat = new THREE.MeshBasicMaterial({color: 0xf54295});
            
            this.floorOffset = floorOffset;
            this.skelVisses = {};
            this.dataSource = new realityEditor.gui.ar.desktopRenderer.SocketDataSource();

            this.container = new THREE.Group();
            realityEditor.gui.threejsScene.addToScene(this.container);
            
            this.container.position.y = -this.floorOffset;
            this.container.rotation.z = Math.PI / 2;

            this.hololensModel = new THREE.Group();
            this.container.add(this.hololensModel);

            //this.URdummy = [];
            this.UR3EModel = new THREE.Group();
            
            this.UR3E_Base = [];
            this.UR3E_shoulder = [];
            this.UR3E_elbow = [];
            this.UR3E_wrist1 = [];
            this.UR3E_wrist2 = [];
            this.UR3E_wrist3 = [];
            this.UR3E_handE = [];
            
            this.container.add(this.UR3EModel);

            this.humanoidModel = new THREE.Group();
            this.container.add(this.humanoidModel);
            this.humanoid = [];

            // Load UR3E model
            const fbxLoader = new FBXLoader();
            fbxLoader.load(
                '/addons/vuforia-spatial-remote-operator-addon/UR3.fbx',
                (object) => {

                    console.log('Add UR3E', object);
                    this.UR3EModel.add(object);
                    object.rotation.z = - Math.PI / 2;
                    object.scale.set(8,8,8);
                    //object.position.x -= 1000;

                    const geometry = new THREE.BoxGeometry( 800, 800, 600 );
                    const material1 = new THREE.MeshBasicMaterial( {color: '#00F2FF', transparent: true, opacity: 0.7, wireframe: false} );
                    const cube1 = new THREE.Mesh( geometry, material1 );
                    cube1.position.x -= 500;
                    this.UR3EModel.add( cube1 );
                    
                    const material2 = new THREE.MeshBasicMaterial( {color: '#0000ff', transparent: true, opacity: 0.8, wireframe: true} );
                    const cube2 = new THREE.Mesh( geometry, material2 );
                    cube2.position.x -= 500;
                    this.UR3EModel.add( cube2 );
                    

                    this.UR3E_Base = this.UR3EModel.getObjectByName('Base');
                    this.UR3E_shoulder = this.UR3EModel.getObjectByName('Shoulder');
                    this.UR3E_elbow = this.UR3EModel.getObjectByName('Elbow');
                    this.UR3E_wrist1 = this.UR3EModel.getObjectByName('Wrist1');
                    this.UR3E_wrist2 = this.UR3EModel.getObjectByName('Wrist2');
                    this.UR3E_wrist3 = this.UR3EModel.getObjectByName('Wrist3');
                    this.UR3E_handE = this.UR3EModel.getObjectByName('HandE');
                    
                    //this.UR3E_elbow.rotation.z = Math.PI/2;
                },
                (xhr) => {
                    console.log((xhr.loaded / xhr.total) * 100 + '% loaded')
                },
                (error) => {
                    console.log(error)
                }
            );
            
            /*

            let mirurNode = realityEditor.sceneGraph.getSceneNodeById('MIRUR_ufva2zpinam');
            let worldId = realityEditor.worldObjects.getBestWorldObject().objectId;
            let worldNode = realityEditor.sceneGraph.getSceneNodeById(worldId);

            console.log('MIRUR node: ', mirurNode);
            
            let mirurMatrix = mirurNode.getMatrixRelativeTo(worldNode);

            console.log('MIRUR worldId: ', worldId);
            console.log('MIRUR Matrix: ', mirurMatrix);
            console.log('MIRUR objects: ', objects);

            const geometry = new THREE.BoxGeometry( 50, 50, 50 );
            const material = new THREE.MeshBasicMaterial( {color: '#FF00E7', transparent: true, opacity: 0.5} );
            const cube = new THREE.Mesh( geometry, material );
            this.container.add( cube );
            
            const material1 = new THREE.MeshBasicMaterial( {color: '#FF0000', transparent: true, opacity: 0.5} );
            const cube1 = new THREE.Mesh( geometry, material1 );
            cube1.position.z = 500;
            this.container.add( cube1 );

            const m = new THREE.Matrix4();
            m.elements = mirurMatrix;
            m.decompose(cube.position, cube.rotation, cube.scale);
            
            console.log('CUBE POSITION: ', cube.position);
            
            this.UR3EModel.position.set(cube.position.y, - cube.position.x, cube.position.z);
            this.UR3EModel.rotation.set(cube.rotation.y, - cube.rotation.x, cube.rotation.z);*/


            /*
            const geometry = new THREE.SphereGeometry( 50, 32, 16 );
            const material = new THREE.MeshBasicMaterial( { color: 0xffff00 } );
            this.handLeft = new THREE.Mesh( geometry, material );
            this.handRight = new THREE.Mesh( geometry, material );
            this.container.add( this.handLeft );
            this.container.add( this.handRight );

            
            // Load Hololens model
            const fbxLoader = new FBXLoader();
            fbxLoader.load(
                '/addons/vuforia-spatial-remote-operator-addon/hololens.fbx',
                (object) => {
                    
                    console.log('Add hololens dummy');
                    this.hololensModel.add(object);
                    object.rotation.z = - Math.PI / 2;
                    object.scale.set(2,2,2);
                },
                (xhr) => {
                    console.log((xhr.loaded / xhr.total) * 100 + '% loaded')
                },
                (error) => {
                    console.log(error)
                }
            );

            
            const loader = new GLTFLoader();
            loader.load( '/addons/vuforia-spatial-remote-operator-addon/Xbot.glb',
                (object) => {

                    this.humanoid = object.scene;
                    this.humanoid.rotation.z = - Math.PI / 2;
                    this.humanoid.scale.set(900,900,900);
                    this.humanoid.position.x -= 1200;
                    this.humanoidModel.add(this.humanoid);

                    const rootBone = this.humanoid.children[0].children[0];

                    rootBone.children[0].rotation.z = - Math.PI / 2;  // Change spine rotation

                    console.log('Root Bone child: ', rootBone.children[0]); // Spine
                    
                },
                (xhr) => {
                    console.log((xhr.loaded / xhr.total) * 100 + '% loaded')
                },
                (error) => {
                    console.log(error)
                }
            );*/

            this.draw = this.draw.bind(this);
            window.rzv = this;
            
        }

        draw() {
            let skels = this.dataSource.poses;
            this.drawSkels(skels);
            
            this.drawHololensPose();
            
            this.drawRobotPose();

            window.requestAnimationFrame(this.draw);
        }
        
        unityToWorldPos(position){
            return {x: position.y * 1000, y:position.x * 1000, z:position.z * 1000};
        }

        unityToWorldRot(rotation){
            //return {x: - rotation.y, y: - rotation.x, z: rotation.z}; // Hololens rotation transformation from unity
            return {x: rotation.x * Math.PI/180, y: - rotation.y * Math.PI/180, z: - rotation.z * Math.PI/180};
        }
        
        drawRobotPose(){

            let robotData = this.dataSource.robotData;
            
            //console.log('Checking Robot Data: ', robotData['UR3_position']);
            
            if (this.UR3EModel && robotData['UR3_position'] !== undefined){
                
                //let base_pos = this.unityToWorldPos(robotData['Base_position']);
                
                let UR3E_rot = this.unityToWorldRot(robotData['UR3_rotation']);
                let base_rot = this.unityToWorldRot(robotData['Base_rotation']);
                let shoulder_rot = this.unityToWorldRot(robotData['Shoulder_rotation']);
                let elbow_rot = this.unityToWorldRot(robotData['Elbow_rotation']);
                let wrist1_rot = this.unityToWorldRot(robotData['Wrist1_rotation']);
                let wrist2_rot = this.unityToWorldRot(robotData['Wrist2_rotation']);
                let wrist3_rot = this.unityToWorldRot(robotData['Wrist3_rotation']);
                let handE_rot = this.unityToWorldRot(robotData['HandE_rotation']);

                this.UR3E_Base.rotation.x = base_rot.x;
                this.UR3E_Base.rotation.y = base_rot.y;
                this.UR3E_Base.rotation.z = base_rot.z;
                
                this.UR3E_shoulder.rotation.x = shoulder_rot.x;
                this.UR3E_shoulder.rotation.y = shoulder_rot.y;
                this.UR3E_shoulder.rotation.z = shoulder_rot.z;

                this.UR3E_elbow.rotation.x = elbow_rot.x;
                this.UR3E_elbow.rotation.y = elbow_rot.y;
                this.UR3E_elbow.rotation.z = elbow_rot.z;

                this.UR3E_wrist1.rotation.x = wrist1_rot.x;
                this.UR3E_wrist1.rotation.y = wrist1_rot.y;
                this.UR3E_wrist1.rotation.z = wrist1_rot.z;

                this.UR3E_wrist2.rotation.x = wrist2_rot.x;
                this.UR3E_wrist2.rotation.y = wrist2_rot.y;
                this.UR3E_wrist2.rotation.z = wrist2_rot.z;
                
                this.UR3E_wrist3.rotation.x = wrist3_rot.x;
                this.UR3E_wrist3.rotation.y = wrist3_rot.y;
                this.UR3E_wrist3.rotation.z = wrist3_rot.z;

                this.UR3E_handE.rotation.x = handE_rot.x;
                this.UR3E_handE.rotation.y = handE_rot.y;
                this.UR3E_handE.rotation.z = handE_rot.z;
            }
        }
        
        drawHololensPose(){
            if (this.hololensModel){
                let hololensPos = this.unityToWorldPos(this.dataSource.hololensPosition);
                this.hololensModel.position.x = hololensPos.x;
                this.hololensModel.position.y = hololensPos.y;
                this.hololensModel.position.z = hololensPos.z;
            }
            if (this.hololensModel) {
                let hololensRot = this.unityToWorldRot(this.dataSource.hololensRotation);
                this.hololensModel.rotation.x = hololensRot.x;
                this.hololensModel.rotation.y = hololensRot.y;
                this.hololensModel.rotation.z = hololensRot.z;
            }
            if (this.handRight){
                let handRightPos = this.unityToWorldPos(this.dataSource.hololensRightHandPosition);
                this.handRight.position.x = handRightPos.x;
                this.handRight.position.y = handRightPos.y;
                this.handRight.position.z = handRightPos.z;
            } 
            if (this.handLeft){
                let handLeftPos = this.unityToWorldPos(this.dataSource.hololensLeftHandPosition);
                this.handLeft.position.x = handLeftPos.x;
                this.handLeft.position.y = handLeftPos.y;
                this.handLeft.position.z = handLeftPos.z;
            } 
        }
        
        drawSkels(skels) {
            for (let id in this.skelVisses) {
                this.skelVisses[id].updated = true;
            }

            for (let skel of skels) {
                if (!skel.angles && skel.joints.length > 0) {
                    realityEditor.gui.ar.desktopRenderer.rebaScore.augmentSkel(skel);
                    skel.angles = realityEditor.gui.ar.desktopRenderer.rebaScore.getAngles(skel);
                    realityEditor.gui.ar.desktopRenderer.rebaScore.calculateReba(skel);
                    skel.rebaScore = realityEditor.gui.ar.desktopRenderer.rebaScore.overallRebaCalculation(skel);
                }

                if (this.skelVisses.hasOwnProperty(skel.id)) {
                    // Length 0 is a tombstone object
                    if (skel.joints.length === 0) {
                        this.skelVisses[skel.id].updated = false;
                        continue;
                    }
                    this.skelVisses[skel.id].update(skel, this.dataSource.lastDataTime);
                    this.skelVisses[skel.id].lastUpdate = Date.now();
                } else if (skel.joints.length === 0) {
                    continue;
                } else {
                    if (skel.joints.length === realityEditor.gui.ar.desktopRenderer.POSE_NET_JOINTS_LEN) {
                        this.skelVisses[skel.id] = new realityEditor.gui.ar.desktopRenderer.PoseNetSkelVis(skel, this.floorOffset);
                    } else {
                        console.warn('what are you giving the poor skel vis', skel);
                    }
                    this.skelVisses[skel.id].addToScene();
                    this.skelVisses[skel.id].updated = true;
                    this.skelVisses[skel.id].lastUpdate = Date.now();
                }
            }
            for (let id in this.skelVisses) {
                if (!this.skelVisses[id].updated ||
                    Date.now() - this.skelVisses[id].lastUpdate > 1500) {
                    this.skelVisses[id].removeFromScene();
                    delete this.skelVisses[id];
                }
            }
        }
    };

})(realityEditor.gui.ar.desktopRenderer);
