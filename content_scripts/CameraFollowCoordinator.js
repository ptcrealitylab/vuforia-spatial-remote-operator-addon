const followPerspectiveMenuText = 'Follow Perspective';
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
            this.currentFollowTarget.isFollowing2D = isFirstPerson;
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
    follow(targetId, followDistance) {
        if (this.currentFollowTarget && targetId !== this.currentFollowTarget.id) {
            this.unfollow();
        }
        this.currentFollowTarget = this.followTargets[targetId];
        // make sure the follow index updates if we manually select a follow target
        this.currentFollowIndex = Object.keys(this.followTargets).indexOf(targetId);
        if (!this.currentFollowTarget) return;
        if (this.currentFollowTarget.followable) {
            this.currentFollowTarget.followable.onCameraStartedFollowing();
        }
        this.followDistance = followDistance;
        this.virtualCamera.follow(this.currentFollowTarget.followable.sceneNode, this.followDistance);
        this.updateFollowMenu();
    }
    unfollow() {
        if (!this.currentFollowTarget) return;
        
        this.currentFollowTarget.followable.onCameraStoppedFollowing();
        this.currentFollowTarget.followable.disableFirstPersonMode();
        this.currentFollowTarget = null;
        this.virtualCamera.stopFollowing();
        this.updateFollowMenu();
    }
    followNext() {
        if (!this.currentFollowTarget) return;
        this.close2D_UI();
        let numTargets = Object.keys(this.followTargets).length;
        this.currentFollowIndex = (this.currentFollowIndex + 1) % numTargets;
        this.followTargetAtIndex(this.currentFollowIndex);
    }
    followPrevious() {
        if (!this.currentFollowTarget) return;
        this.close2D_UI();
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
        realityEditor.envelopeManager.focusEnvelope(followTarget.followable.frameKey);
        this.follow(followTarget.id, this.followDistance);
    }
    close2D_UI() {
        // if the followable specifies a frameKey, try to stop focusing
        if (typeof this.currentFollowTarget.followable.frameKey !== 'undefined') {
            realityEditor.envelopeManager.blurEnvelope(this.currentFollowTarget.followable.frameKey );
        }
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

        const perspectiveItemMenu = new realityEditor.gui.MenuItemSubmenu(followPerspectiveMenuText, { toggle: false, disabled: false });
        menuBar.addItemToMenu(realityEditor.gui.MENU.Follow, perspectiveItemMenu);

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

                this.follow(thisTarget.id, this.followDistance);
            });
            perspectiveItemMenu.addItemToSubmenu(followItem)
        });

        changeTargetButtons.forEach(itemInfo => {
            const item = new realityEditor.gui.MenuItem(itemInfo.name, { shortcutKey: itemInfo.shortcutKey, toggle: false, disabled: (numTargets === 0) }, () => {
                if (Object.values(this.followTargets).length === 0) return; // can't swap targets if not following anything
                if (!this.currentFollowTarget) return;
                (itemInfo.dIndex > 0) ? this.followNext() : this.followPrevious();
            });
            menuBar.addItemToMenu(realityEditor.gui.MENU.Follow, item);
        });

        // move this one to the bottom of the menu by adding it again
        menuBar.addItemToMenu(realityEditor.gui.MENU.Follow, realityEditor.gui.stopFollowingItem);

        // adds a horizontal rule to the menu to visually separate these items from the list of followables
        let separator2 = new realityEditor.gui.MenuItem('', { isSeparator: true });
        menuBar.addItemToMenu(realityEditor.gui.MENU.Follow, separator2);
    }
    // Updates the Follow menu to contain a menu item for each available follow target
    updateFollowMenu() {
        let menuBar = realityEditor.gui.getMenuBar();
        let numTargets = Object.keys(this.followTargets).length;

        // show/hide Follow menu and enable/disable following buttons if >0 targets
        if (numTargets === 0) {
            menuBar.disableMenu(realityEditor.gui.followMenu);
            realityEditor.gui.getMenuBar().setItemEnabled(realityEditor.gui.ITEM.StopFollowing, false);
            Object.values(PERSPECTIVES).forEach(info => {
                realityEditor.gui.getMenuBar().setItemEnabled(info.menuBarName, false);
            });
        } else {
            menuBar.enableMenu(realityEditor.gui.followMenu);
            realityEditor.gui.getMenuBar().setItemEnabled(realityEditor.gui.ITEM.StopFollowing, true);
            Object.values(PERSPECTIVES).forEach(info => {
                realityEditor.gui.getMenuBar().setItemEnabled(info.menuBarName, true);
            });
        }

        // only enable the change-target buttons if following and there's another
        let changeTargetsEnabled = numTargets >= 2 && this.currentFollowTarget;
        changeTargetButtons.forEach(info => {
            realityEditor.gui.getMenuBar().setItemEnabled(info.name, changeTargetsEnabled);
        });

        // don't remove the Stop Following or Prev/Next items
        let itemsToSkip = [
            realityEditor.gui.ITEM.StopFollowing,
            followPerspectiveMenuText
        ];
        changeTargetButtons.forEach(itemInfo => {
            itemsToSkip.push(itemInfo.name);
        });
        PERSPECTIVES.forEach(itemInfo => {
            itemsToSkip.push(itemInfo.menuBarName);
        });

        let itemsToRemove = [];
        // remove items that don't match current set of follow targets
        realityEditor.gui.followMenu.items.forEach(menuItem => {
            if (itemsToSkip.includes(menuItem.text)) return;
            if (menuItem.options.isSeparator) return;

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
            this.follow(thisTarget.id, this.followDistance);
        });
        menuBar.addItemToMenu(realityEditor.gui.MENU.Follow, targetItem);
    }
}
