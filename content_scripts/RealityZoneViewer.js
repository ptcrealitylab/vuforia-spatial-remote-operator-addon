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

            this.UR3EModel = new THREE.Group();
            this.container.add(this.UR3EModel);

            this.humanoidModel = new THREE.Group();
            this.container.add(this.humanoidModel);
            this.humanoid = [];

            // Load UR3E model
            const fbxLoader = new FBXLoader();
            fbxLoader.load(
                '/addons/vuforia-spatial-remote-operator-addon/UnityRobotics_RF3_s1.fbx',
                (object) => {

                    console.log('Add UR3E', object);
                    this.UR3EModel.add(object);
                    object.rotation.z = - Math.PI / 2;
                    object.scale.set(1000,1000,1000);
                    object.position.x -= 1000;
                },
                (xhr) => {
                    console.log((xhr.loaded / xhr.total) * 100 + '% loaded')
                },
                (error) => {
                    console.log(error)
                }
            );

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
            
            let mirurNode = realityEditor.sceneGraph.getSceneNodeById('MIRUR_ufva2zpinam');
            let worldId = realityEditor.worldObjects.getBestWorldObject().objectId;
            let worldNode = realityEditor.sceneGraph.getSceneNodeById(worldId);

            let mirurMatrix = mirurNode.getMatrixRelativeTo(worldNode);
            
            console.log('MIRUR worldId: ', worldId);
            console.log('MIRUR Matrix: ', mirurMatrix);

            const geometry = new THREE.BoxGeometry( 100, 400, 200 );
            const material = new THREE.MeshBasicMaterial( {color: 'cyan', transparent: true, opacity: 0.5} );
            const cube = new THREE.Mesh( geometry, material );
            this.container.add( cube );
            
            //cube.matrixAutoUpdate = false;
            //cube.matrix.set(mirurMatrix);
            //cube.updateMatrixWorld();

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
            return {x: - rotation.y, y: - rotation.x, z: rotation.z};
        }
        
        drawRobotPose(){
            if (this.UR3EModel){
                let robotData = this.dataSource.robotData;
                
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
