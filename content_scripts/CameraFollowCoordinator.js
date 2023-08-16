const PERSPECTIVES = [
    {
        keyboardShortcut: '_1',
        menuBarName: 'Follow 1st-Person',
        distanceToCamera: 0,
    },
    {
        keyboardShortcut: '_2',
        menuBarName: 'Follow 1st-Person (Wide)',
        distanceToCamera: 1500,
    },
    {
        keyboardShortcut: '_3',
        menuBarName: 'Follow 3rd-Person',
        distanceToCamera: 3000,
    },
    {
        keyboardShortcut: '_4',
        menuBarName: 'Follow 3rd-Person (Wide)',
        distanceToCamera: 4500,
    },
    {
        keyboardShortcut: '_5',
        menuBarName: 'Follow Aerial',
        distanceToCamera: 6000,
    }
];

const changeTargetButtons = [
    { name: 'Follow Next Target', shortcutKey: 'RIGHT', dIndex: 1 },
    { name: 'Follow Previous Target', shortcutKey: 'LEFT',  dIndex: -1 }
];

/**
 * Wraps a reference to a followable element in a class that we add/delete
 * without accidentally deleting the referenced class instance
 */
class CameraFollowTarget {
    constructor(followable) {
        this.followable = followable;
        this.id = this.followable.id;
        this.displayName = this.followable.displayName;
    }
}

/**
 * Adding CameraFollowTargets to a CameraFollowCoordinator allows it to control
 * its virtualCamera and make it follow the followable target.
 */
export class CameraFollowCoordinator {
    constructor(virtualCamera) {
        this.virtualCamera = virtualCamera;
        this.followTargets = {};
        this.currentFollowTarget = null;
        this.followDistance = 3000;
        this.currentFollowIndex = 0;

        this.virtualCamera.onFirstPersonDistanceToggled((isFirstPerson, currentDistance) => {
            if (!this.currentFollowTarget) return;
            this.currentFollowTarget.followable.onFollowDistanceUpdated(currentDistance);
            if (isFirstPerson) {
                this.currentFollowTarget.followable.enableFirstPersonMode();
            } else if (!isFirstPerson) {
                this.currentFollowTarget.followable.disableFirstPersonMode();
            }
        });

        this.virtualCamera.onStopFollowing(() => {
            this.unfollow();
        });
    }
    addFollowTarget(followable) {
        this.followTargets[followable.id] = new CameraFollowTarget(followable);
        this.updateFollowMenu();
    }
    removeFollowTarget(id) {
        delete this.followTargets[id];
        this.updateFollowMenu();
    }
    follow(targetId) {
        if (this.currentFollowTarget && targetId !== this.currentFollowTarget.id) {
            this.unfollow();
        }
        this.currentFollowTarget = this.followTargets[targetId];
        if (!this.currentFollowTarget) return;
        if (this.currentFollowTarget.followable) {
            this.currentFollowTarget.followable.onCameraStartedFollowing();
        }
        
        // if the followable specifies a frameKey, try to focus on that envelope when following
        if (typeof this.currentFollowTarget.followable.frameKey !== 'undefined') {
            realityEditor.envelopeManager.focusEnvelope(this.currentFollowTarget.followable.frameKey );
        }

        this.virtualCamera.follow(this.currentFollowTarget.followable.sceneNode, this.followDistance);
    }
    unfollow() {
        if (!this.currentFollowTarget) return;

        // if the followable specifies a frameKey, try to stop focusing
        if (typeof this.currentFollowTarget.followable.frameKey !== 'undefined') {
            realityEditor.envelopeManager.blurEnvelope(this.currentFollowTarget.followable.frameKey );
        }
        this.currentFollowTarget.followable.onCameraStoppedFollowing();
        this.currentFollowTarget.followable.disableFirstPersonMode();
        this.currentFollowTarget = null;
    }
    followNext() {
        if (!this.currentFollowTarget) return;
        let numTargets = Object.keys(this.followTargets).length;
        this.currentFollowIndex = (this.currentFollowIndex + 1) % numTargets;
        this.followTargetAtIndex(this.currentFollowIndex);
    }
    followPrevious() {
        if (!this.currentFollowTarget) return;
        let numTargets = Object.keys(this.followTargets).length;
        this.currentFollowIndex = (this.currentFollowIndex - 1) % numTargets;
        if (this.currentFollowIndex < 0) { this.currentFollowIndex += numTargets; }
        this.followTargetAtIndex(this.currentFollowIndex);
    }
    followTargetAtIndex(index) {
        let followTarget = Object.values(this.followTargets)[index];
        if (!followTarget) {
            console.warn('Can\'t find a virtualizer to follow');
            return;
        }
        this.follow(followTarget.id);
    }
    update() {
        Object.values(this.followTargets).forEach(followTarget => {
            try {
                followTarget.followable.updateSceneNode();
            } catch (_e) {
                // console.warn('error in updateSceneNode for one of the followTargets')
            }
        });
    }
    addMenuItems() {
        let menuBar = realityEditor.gui.getMenuBar();
        let numTargets = Object.keys(this.followTargets).length;

        // Setup Following Menu Items for each perspective
        PERSPECTIVES.forEach(info => {
            const followItem = new realityEditor.gui.MenuItem(info.menuBarName, { shortcutKey: info.keyboardShortcut, toggle: false, disabled: (numTargets === 0) }, () => {
                if (Object.values(this.followTargets).length === 0) {
                    console.warn('Can\'t find a virtualizer to follow');
                    return;
                }

                if (this.currentFollowIndex >= Object.keys(this.followTargets).length) {
                    this.currentFollowIndex = 0;
                }
                let thisTarget = Object.values(this.followTargets)[this.currentFollowIndex];

                this.followDistance = info.distanceToCamera;

                this.follow(thisTarget.id);
            });
            menuBar.addItemToMenu(realityEditor.gui.MENU.Camera, followItem);
        });

        changeTargetButtons.forEach(itemInfo => {
            const item = new realityEditor.gui.MenuItem(itemInfo.name, { shortcutKey: itemInfo.shortcutKey, toggle: false, disabled: (numTargets === 0) }, () => {
                if (Object.values(this.followTargets).length === 0) return; // can't swap targets if not following anything
                if (!this.currentFollowTarget) return;
                (itemInfo.dIndex > 0) ? this.followNext() : this.followPrevious();
            });
            menuBar.addItemToMenu(realityEditor.gui.MENU.Camera, item);
        });
    }
    // Updates the Follow menu to contain a menu item for each available follow target
    updateFollowMenu() {
        let menuBar = realityEditor.gui.getMenuBar();
        let numTargets = Object.keys(this.followTargets).length;

        // show/hide Follow menu and enable/disable following buttons if >0 targets
        if (numTargets === 0) {
            menuBar.hideMenu(realityEditor.gui.followMenu);
            realityEditor.gui.getMenuBar().setItemEnabled(realityEditor.gui.ITEM.StopFollowing, false);
            Object.values(PERSPECTIVES).forEach(info => {
                realityEditor.gui.getMenuBar().setItemEnabled(info.menuBarName, false);
            });
            changeTargetButtons.forEach(info => {
                realityEditor.gui.getMenuBar().setItemEnabled(info.name, false);
            });
        } else {
            menuBar.unhideMenu(realityEditor.gui.followMenu);
            realityEditor.gui.getMenuBar().setItemEnabled(realityEditor.gui.ITEM.StopFollowing, true);
            Object.values(PERSPECTIVES).forEach(info => {
                realityEditor.gui.getMenuBar().setItemEnabled(info.menuBarName, true);
            });
            changeTargetButtons.forEach(info => {
                realityEditor.gui.getMenuBar().setItemEnabled(info.name, true);
            });
        }

        let itemsToRemove = [];
        // remove items that don't match current set of follow targets
        realityEditor.gui.followMenu.items.forEach(menuItem => {
            itemsToRemove.push(menuItem.text);
        });

        itemsToRemove.forEach(itemText => {
            menuBar.removeItemFromMenu(realityEditor.gui.MENU.Follow, itemText);
        });

        let itemsToAdd = [];

        // add follow targets that don't exist yet in menu items
        Object.values(this.followTargets).forEach(followTarget => {
            itemsToAdd.push(followTarget.displayName);
        });

        itemsToAdd.forEach(displayName => {
            let itemText = `Follow ${displayName}`;
            this.addTargetToFollowMenu(displayName, itemText);
        });
    }
    addTargetToFollowMenu(displayName, menuItemText) {
        let menuBar = realityEditor.gui.getMenuBar();
        const targetItem = new realityEditor.gui.MenuItem(menuItemText, { toggle: false, disabled: false }, () => {
            if (Object.values(this.followTargets).length === 0) {
                console.warn('Can\'t find a target to follow');
                return;
            }
            // search the targets for one whose displayName matches the item text
            let targetDisplayNames = Object.values(this.followTargets).map(target => target.displayName);
            let index = targetDisplayNames.indexOf(displayName);
            let thisTarget = Object.values(this.followTargets)[index];
            if (!thisTarget) return;
            this.follow(thisTarget.id);
        });
        menuBar.addItemToMenu(realityEditor.gui.MENU.Follow, targetItem);
    }
}
