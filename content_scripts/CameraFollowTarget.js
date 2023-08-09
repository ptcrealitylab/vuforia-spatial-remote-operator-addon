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
        // this.isRendering2d = false;
        this.followDistance = 3000;
        this.currentFollowIndex = 0;
        
        this.virtualCamera.onFirstPersonDistanceToggled((isFirstPerson) => {
            if (!this.currentFollowTarget) return;
            if (!this.currentFollowTarget.firstPersonEnabler) return;
            if (isFirstPerson) { // && !this.isRendering2d) {
                console.log('enable first person');
                this.currentFollowTarget.firstPersonEnabler.enableFirstPersonMode();
            } else if (!isFirstPerson) { // && this.isRendering2d) {
                console.log('disable first person');
                this.currentFollowTarget.firstPersonEnabler.disableFirstPersonMode();
            }
            // this.isRendering2d = isFirstPerson;
        });

        this.virtualCamera.onStopFollowing(() => {
            this.unfollow();
        });
    }
    addFollowTarget(id, pointCloudMesh, sceneNode, firstPersonEnabler) {
        this.followTargets[id] = new CameraFollowTarget(id, pointCloudMesh, sceneNode, firstPersonEnabler);
        console.log('added follow target', this.followTargets);
    }
    removeFollowTarget(id) {
        delete this.followTargets[id];
    }
    follow(targetId) {
        if (this.currentFollowTarget && targetId !== this.currentFollowTarget.id) {
            this.unfollow();
        }
        this.currentFollowTarget = this.followTargets[targetId];
        console.log('follow ', targetId, this.currentFollowTarget);
        if (!this.currentFollowTarget) return;
        this.virtualCamera.follow(this.currentFollowTarget.sceneNode, this.followDistance); // , this.isRendering2d);
    }
    unfollow() {
        if (!this.currentFollowTarget) return;
        console.log('unfollow');
        this.currentFollowTarget.firstPersonEnabler.disableFirstPersonMode();
        this.currentFollowTarget = null;
    }
    followNext() {
        if (!this.currentFollowTarget) return;
        // this.unfollow();
        let numTargets = Object.keys(this.followTargets).length;
        this.currentFollowIndex = (this.currentFollowIndex + 1) % numTargets;
        this.chooseFollowTarget(this.currentFollowIndex);
    }
    followPrevious() {
        if (!this.currentFollowTarget) return;
        // this.unfollow();
        let numTargets = Object.keys(this.followTargets).length;
        this.currentFollowIndex = (this.currentFollowIndex - 1) % numTargets;
        if (this.currentFollowIndex < 0) { this.currentFollowIndex += numTargets; }
        this.chooseFollowTarget(this.currentFollowIndex);
    }
    chooseFollowTarget(index) {
        let followTarget = Object.values(this.followTargets)[index];
        if (!followTarget) {
            console.warn('Can\'t find a virtualizer to follow');
            return;
        }
        this.follow(followTarget.id);
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
                // this.isRendering2d = info.render2DVideo;

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
                (itemInfo.dIndex > 0) ? this.followNext() : this.followPrevious();
            });
            menuBar.addItemToMenu(realityEditor.gui.MENU.Camera, item);
        });
    }
}
