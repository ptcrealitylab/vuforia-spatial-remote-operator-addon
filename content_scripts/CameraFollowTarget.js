export const PERSPECTIVES = [
    {
        keyboardShortcut: '_1',
        menuBarName: 'Follow 1st-Person',
        distanceToCamera: 0,
        render2DVideo: true
    },
    {
        keyboardShortcut: '_2',
        menuBarName: 'Follow 1st-Person (Wide)',
        distanceToCamera: 1500,
        render2DVideo: false
    },
    {
        keyboardShortcut: '_3',
        menuBarName: 'Follow 3rd-Person',
        distanceToCamera: 3000,
        render2DVideo: false
    },
    {
        keyboardShortcut: '_4',
        menuBarName: 'Follow 3rd-Person (Wide)',
        distanceToCamera: 4500,
        render2DVideo: false
    },
    {
        keyboardShortcut: '_5',
        menuBarName: 'Follow Aerial',
        distanceToCamera: 6000,
        render2DVideo: false
    }
];

export class CameraFollowTarget {
    constructor(id, pointCloudMesh, sceneNode, firstPersonEnabler) {
        this.id = id;
        this.pointCloudMesh = pointCloudMesh;
        this.sceneNode = sceneNode;
        this.firstPersonEnabler = firstPersonEnabler;
    }
}

export class CameraFollowCoordinator {
    constructor(virtualCamera) {
        this.virtualCamera = virtualCamera;
        /**
         * @type {{string: CameraFollowTarget}}
         */
        this.followTargets = {};
        this.currentFollowTarget = null;
        this.isRendering2d = false;
        this.followDistance = 3000;
        this.currentFollowIndex = 0;
        
        this.virtualCamera.onFirstPersonDistanceToggled((isFirstPerson) => {
            if (!this.currentFollowTarget) return;
            if (!this.currentFollowTarget.firstPersonEnabler) return;
            if (isFirstPerson && !this.isRendering2d) {
                this.currentFollowTarget.firstPersonEnabler.enableFirstPersonMode();
            } else if (!isFirstPerson && this.isRendering2d) {
                this.currentFollowTarget.firstPersonEnabler.disableFirstPersonMode();
            }
            this.isRendering2d = isFirstPerson;
        });
    }
    addFollowTarget(id, pointCloudMesh, sceneNode, firstPersonEnabler) {
        this.followTargets[id] = new CameraFollowTarget(id, pointCloudMesh, sceneNode, firstPersonEnabler);
        // TODO: to go to first person, we can do firstPersonEnabler.enableFirstPersonMode();
        
        console.log('added follow target', this.followTargets);
    }
    removeFollowTarget(id) {
        delete this.followTargets[id];
    }

    follow(targetId) {
        this.currentFollowTarget = this.followTargets[targetId];
        if (!this.currentFollowTarget) return;
        this.virtualCamera.follow(this.currentFollowTarget.sceneNode, targetId, this.followDistance, this.isRendering2d);
    }
    unfollow() {
        this.currentFollowTarget = null;
    }
    followNext() {
        this.currentFollowIndex++;
        if (this.currentFollowIndex > Object.keys(this.followTargets).length) {
            this.currentFollowIndex = 0;
        }
        this.chooseFollowTarget(this.currentFollowIndex);
    }
    followPrevious() {
        this.currentFollowIndex--;
        if (this.currentFollowIndex < 0) {
            this.currentFollowIndex = Object.keys(this.followTargets).length;
        }
        this.chooseFollowTarget(this.currentFollowIndex);
    }
    chooseFollowTarget() {
        
    }
    addMenuItems() {
        let menuBar = realityEditor.gui.getMenuBar();
        
        menuBar.addCallbackToItem(realityEditor.gui.ITEM.FollowVideo, () => {
            if (Object.values(this.followTargets).length === 0) return;
            let thisTarget = Object.values(this.followTargets)[0];
            let sceneGraphNode = realityEditor.sceneGraph.getVisualElement('CameraPlaybackNode' + thisTarget.id);
            sceneGraphNode.setLocalMatrix(thisTarget.pointCloudMesh.matrix.elements);
            this.follow(thisTarget.id);
            // followVirtualizer(thisVideoPlayer.id, sceneGraphNode, 3000, false);
            // thisVideoPlayer.enableFirstPersonMode();
        });
        
        // Setup Following Menu
        PERSPECTIVES.forEach(info => {
            const followItem = new realityEditor.gui.MenuItem(info.menuBarName, { shortcutKey: info.keyboardShortcut, toggle: false, disabled: false }, () => {
                // currentFollowIndex = lastFollowingIndex; // resumes following the previously followed camera. defaults to 0
                // let followTarget = chooseFollowTarget(currentFollowIndex);
                if (Object.values(this.followTargets).length === 0) {
                    console.warn('Can\'t find a virtualizer to follow');
                    return;
                }

                let thisTarget = Object.values(this.followTargets)[0];
                
                this.followDistance = info.distanceToCamera;
                this.isRendering2d = info.render2DVideo;

                this.follow(thisTarget.id);
                // followVirtualizer(followTarget.id, followTarget.sceneNode, info.distanceToCamera, info.render2DVideo);
            });
            menuBar.addItemToMenu(realityEditor.gui.MENU.Camera, followItem);
        });

        // TODO: enable (or add) this only if there are more than one virtualizers
        const changeTargetButtons = [
            { name: 'Follow Next Target', shortcutKey: 'RIGHT', dIndex: 1 },
            { name: 'Follow Previous Target', shortcutKey: 'LEFT',  dIndex: -1 }
        ];

        changeTargetButtons.forEach(itemInfo => {
            const item = new realityEditor.gui.MenuItem(itemInfo.name, { shortcutKey: itemInfo.shortcutKey, toggle: false, disabled: false }, () => {
                if (Object.values(this.followTargets).length === 0) return; // can't swap targets if not following anything
                if (!this.currentFollowTarget) return;
                
                // let newIndex = Math.floor(Math.random() * Object.values(this.followTargets).length);
                let numTargets = Object.values(this.followTargets).length;
                
                this.currentFollowIndex = (this.currentFollowIndex + itemInfo.dIndex) % numTargets;
                if (this.currentFollowIndex < 0) {
                    this.currentFollowIndex += numTargets;
                }

                // let followTarget = chooseFollowTarget(currentFollowIndex);
                let followTarget = Object.values(this.followTargets)[this.currentFollowIndex];
                if (!followTarget) {
                    console.warn('Can\'t find a virtualizer to follow');
                    return;
                }
                // followVirtualizer(followTarget.id, followTarget.sceneNode);
                
                this.follow(followTarget.id);
                
                // this.lastFollowingIndex = this.currentFollowIndex;
            });
            menuBar.addItemToMenu(realityEditor.gui.MENU.Camera, item);
        });
    }
}
