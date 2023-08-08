export const perspectives = [
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
    addMenuItems() {
        // realityEditor.gui.getMenuBar().addCallbackToItem(realityEditor.gui.ITEM.FollowVideo, () => {
        //     if (Object.values(videoPlaybackTargets).length > 0) {
        //         let thisVideoPlayer = Object.values(videoPlaybackTargets)[0].videoPlayer;
        //         let sceneGraphNode = realityEditor.sceneGraph.getVisualElement('CameraPlaybackNode' + thisVideoPlayer.id);
        //         if (!sceneGraphNode) {
        //             let parentNode = realityEditor.sceneGraph.getVisualElement('CameraGroupContainer');
        //             let sceneGraphNodeId = realityEditor.sceneGraph.addVisualElement('CameraPlaybackNode' + thisVideoPlayer.id, parentNode);
        //             sceneGraphNode = realityEditor.sceneGraph.getSceneNodeById(sceneGraphNodeId);
        //         }
        //         sceneGraphNode.setLocalMatrix(thisVideoPlayer.phone.matrix.elements);
        //         followVirtualizer(thisVideoPlayer.id, sceneGraphNode, 3000, false);
        //         thisVideoPlayer.enableFirstPersonMode();
        //     }
        // });
        // // Setup Following Menu
        // perspectives.forEach(info => {
        //     const followItem = new realityEditor.gui.MenuItem(info.menuBarName, { shortcutKey: info.keyboardShortcut, toggle: false, disabled: true }, () => {
        //         currentFollowIndex = lastFollowingIndex; // resumes following the previously followed camera. defaults to 0
        //         let followTarget = chooseFollowTarget(currentFollowIndex);
        //         if (!followTarget) {
        //             console.warn('Can\'t find a virtualizer to follow');
        //             return;
        //         }
        //
        //         followVirtualizer(followTarget.id, followTarget.sceneNode, info.distanceToCamera, info.render2DVideo);
        //     });
        //     realityEditor.gui.getMenuBar().addItemToMenu(realityEditor.gui.MENU.Camera, followItem);
        // });
        //
        // // TODO: enable (or add) this only if there are more than one virtualizers
        // let changeTargetButtons = [
        //     { name: 'Follow Next Target', shortcutKey: 'RIGHT', dIndex: 1 },
        //     { name: 'Follow Previous Target', shortcutKey: 'LEFT',  dIndex: -1 }
        // ];
        //
        // changeTargetButtons.forEach(itemInfo => {
        //     const item = new realityEditor.gui.MenuItem(itemInfo.name, { shortcutKey: itemInfo.shortcutKey, toggle: false, disabled: false }, () => {
        //         if (currentlyFollowingId === null) {
        //             return; // can't swap targets if not following anything
        //         }
        //
        //         let numVirtualizers = realityEditor.gui.ar.desktopRenderer.getCameraVisSceneNodes().length;
        //         currentFollowIndex = (currentFollowIndex + itemInfo.dIndex) % numVirtualizers;
        //         if (currentFollowIndex < 0) {
        //             currentFollowIndex += numVirtualizers;
        //         }
        //
        //         let followTarget = chooseFollowTarget(currentFollowIndex);
        //         if (!followTarget) {
        //             console.warn('Can\'t find a virtualizer to follow');
        //             return;
        //         }
        //         followVirtualizer(followTarget.id, followTarget.sceneNode);
        //         lastFollowingIndex = currentFollowIndex;
        //     });
        //     realityEditor.gui.getMenuBar().addItemToMenu(realityEditor.gui.MENU.Camera, item);
        // });
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
}
