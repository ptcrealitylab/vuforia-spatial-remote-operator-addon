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

            this.humanoidModel = new THREE.Group();
            this.container.add(this.humanoidModel);
            this.humanoid = [];

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
                    
                    /*let skeleton = new THREE.SkeletonHelper( rootBone );
                    skeleton.visible = true;
                    this.container.add( skeleton );*/

                    //rootBone.children[0].rotation.z = - Math.PI / 2;  // Change spine position

                    console.log('Root Bone child: ', rootBone.children[0]); // Spine
                    
                },
                (xhr) => {
                    console.log((xhr.loaded / xhr.total) * 100 + '% loaded')
                },
                (error) => {
                    console.log(error)
                }
            );

            this.draw = this.draw.bind(this);
            window.rzv = this;
            
        }

        draw() {
            let skels = this.dataSource.poses;
            this.drawSkels(skels);
            
            this.drawHololensPose();

            window.requestAnimationFrame(this.draw);
        }
        
        unityToWorldPos(position){
            return {x: position.y * 1000, y:position.x * 1000, z:position.z * 1000};
        }

        unityToWorldRot(rotation){
            return {x: - rotation.y, y: - rotation.x, z: rotation.z};
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
