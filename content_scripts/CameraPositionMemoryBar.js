import Splatting from '../../src/splatting/Splatting.js';

const IMAGE_SRC = {
    save: 'addons/vuforia-spatial-remote-operator-addon/memory-add.svg',
    // load: 'addons/vuforia-spatial-remote-operator-addon/memory-load.svg',
};

// each thumbnail is only a few kb, but we can prevent filling up localStorage with hundreds of metaverses
// of old thumbnails by imposing a limit, and the thumbnails used least recently will be cleared out
const MAX_LOCAL_STORAGE_ENTRIES = 100;
const ID_PATTERN = /^camera-position-memory-slot-\d+-.*$/;

/**
 * A UI component that allows you to save and load `CameraPositionMemory`s into one of 5 slots
 * Saving a memory stores your camera perspective and a thumbnail of your current view
 * Clicking a saved memory restores your camera position/direction to that view
 * These are saved per-client and per-worldObject, in localStorage (for now – could be shared/sync'd
 * on server for all clients if desired in future).
 */
export class CameraPositionMemoryBar {
    constructor(worldId, cameraPositionGetter) {
        this.worldId = worldId; // used to save/load memories per-world
        this.cameraPositionGetter = cameraPositionGetter;
        this.callbacks = {
            onMemoryLoaded: []
        };

        const NUM_MEMORIES = 5;
        this.memorySlots = this.buildMemorySlots(NUM_MEMORIES);
        this.dom = this.buildDom();
        document.body.appendChild(this.dom);

        this.dom.classList.add('hidden-memory-bar');

        let keyboard = new realityEditor.device.KeyboardListener();
        keyboard.onKeyDown((code) => {
            if (realityEditor.device.keyboardEvents.isKeyboardActive()) { return; } // ignore if a tool is using the keyboard

            // while shift is down, turn on the laser beam
            if (code === keyboard.keyCodes.PERIOD) {
                if (this.dom.classList.contains('hidden-memory-bar')) {
                    this.dom.classList.remove('hidden-memory-bar');
                } else {
                    this.dom.classList.add('hidden-memory-bar');
                }
            }
        });
    }
    /**
     * @return {HTMLDivElement}
     */
    buildDom() {
        let barParent = document.createElement('div');
        barParent.classList.add('camera-position-memory-bar-parent');
        let bar = document.createElement('div');
        bar.classList.add('camera-position-memory-bar')
        this.memorySlots.forEach(slot => {
            bar.appendChild(slot.dom);
        });
        barParent.appendChild(bar);
        return barParent;
    }
    /**
     * @param {number} numMemories
     * @return {CameraPositionMemorySlot[]}
     */
    buildMemorySlots(numMemories) {
        let memories = [];
        for (let i = 0; i < numMemories; i++) {
            let slot = new CameraPositionMemorySlot(this, i);

            // load from localStorage if available
            let savedMemoryString = window.localStorage.getItem(slot.getId());
            if (typeof savedMemoryString === 'string') {
                let memory = JSON.parse(savedMemoryString);
                slot.saveMemory(memory.position, memory.direction, memory.thumbnailSrc, memory.lastUsedDate, memory.createdDate);
            }

            memories.push(slot);
        }
        return memories;
    }
    /**
     * @param {function} cb
     */
    onMemorySelected(cb) {
        this.callbacks.onMemoryLoaded.push(cb);
    }
    /**
     * @param {CameraPositionMemory} memory
     */
    memorySelected(memory) {
        this.callbacks.onMemoryLoaded.forEach(cb => {
            cb(memory.position, memory.direction);
        });
    }
}

class CameraPositionMemorySlot {
    /**
     * @param {CameraPositionMemoryBar} parentBar
     * @param {number} index
     */
    constructor(parentBar, index) {
        this.parentBar = parentBar;
        this.index = index;
        this.dom = this.buildDom();
        this.memory = null;
    }
    /**
     * Sets up the dom elements for this memory slot, and adds the click event listeners
     * @return {HTMLDivElement}
     */
    buildDom() {
        let slot = document.createElement('div');
        slot.classList.add('camera-position-memory-slot');

        let image = document.createElement('div');
        image.classList.add('camera-position-memory-slot-image');
        // image.src = IMAGE_SRC.save;
        image.style.backgroundImage = `url('${IMAGE_SRC.save}')`;
        image.style.backgroundSize = '50%';
        slot.appendChild(image);

        let xButton = document.createElement('div');
        xButton.classList.add('camera-position-memory-slot-x', 'hidden-memory-bar');
        xButton.textContent = 'X';
        slot.appendChild(xButton);

        slot.addEventListener('click', () => {
            if (this.memory) {
                this.loadMemory();
            } else {
                let { position, direction } = this.parentBar.cameraPositionGetter();

                Splatting.captureScreenshot({ outputWidth: 120, useJpgCompression: true, jpgQuality: 0.7 });
                setTimeout(() => {
                    let screenshotImage = Splatting.getMostRecentScreenshot();
                    this.saveMemory(position, direction, screenshotImage, undefined, undefined);
                }, 100);
            }
        });

        // Add click event listener to the X button
        xButton.addEventListener('click', (event) => {
            event.stopPropagation(); // Prevent triggering any parent click events
            console.log('X button clicked');
            // remove the memory from the slot
            this.clearMemory();
        });

        return slot;
    }
    /**
     * Saves the specified arguments (position/direction/thumbnail) into this slot, and saves to localStorage
     * @param {number[]} position – [X,Y,Z] of camera position
     * @param {number[]} direction - [X,Y,Z] of camera direction
     * @param {string} thumbnailSrc - base64-encoded image screenshot of view
     * @param {string} lastUsedDate - ISO date-string of when memory was last saved or restored
     * @param {string} createdDate - ISO date-string of when memory was originally created
     */
    saveMemory(position, direction, thumbnailSrc, lastUsedDate, createdDate) {
        let now = new Date().toISOString(); // Date.now(); // last used date is now. also the created date if no created date provided to function.
        this.memory = new CameraPositionMemory(position, direction, thumbnailSrc, lastUsedDate || now, createdDate || now);
        // set image to thumbnail
        let image = this.dom.querySelector('.camera-position-memory-slot-image');
        image.style.backgroundImage = `url('${thumbnailSrc}')`;
        image.style.backgroundSize = 'cover';
        let xButton = this.dom.querySelector('.camera-position-memory-slot-x');
        if (xButton) {
            xButton.classList.remove('hidden-memory-bar'); // show the delete button
        }

        // save to localStorage, and delete old thumbnails from other worlds from localStorage if there are too many
        try {
            window.localStorage.setItem(this.getId(), this.memory.toString());
            this.manageStoredThumbnails(MAX_LOCAL_STORAGE_ENTRIES);
        } catch (e) {
            if (e.name === 'QuotaExceededError' || e.name === 'NS_ERROR_DOM_QUOTA_REACHED') {
                console.error('Local storage quota exceeded. Clearing old entries.');
                this.manageStoredThumbnails(MAX_LOCAL_STORAGE_ENTRIES / 2); // use stricter limit if error
            } else {
                console.error('Error storing thumbnail:', e);
            }
        }
    }
    /**
     * Removes the memory from this slot, so a new one can be added
     */
    clearMemory() {
        this.memory = null;
        // reset image to "+"
        let image = this.dom.querySelector('.camera-position-memory-slot-image');
        // image.src = IMAGE_SRC.save;
        image.style.backgroundImage = `url('${IMAGE_SRC.save}')`;
        image.style.backgroundSize = '50%';
        window.localStorage.removeItem(this.getId());

        let xButton = this.dom.querySelector('.camera-position-memory-slot-x');
        if (xButton) {
            xButton.classList.add('hidden-memory-bar');
        }
    }
    /**
     * Tell the parent to restore the camera position/direction of this memory into the view
     */
    loadMemory() {
        this.memory.lastUsedDate = new Date().toISOString(); // update last-used date whenever it's used
        window.localStorage.setItem(this.getId(), this.memory.toString());
        this.parentBar.memorySelected(this.memory);
    }

    /**
     * Helper function to get a unique ID for this memory slot in this world
     * @return {string}
     */
    getId() {
        if (!this.parentBar.worldId) {
            console.warn('trying to save/load CameraPositionMemory for null world id; something may be wrong');
        }
        let worldId = this.parentBar.worldId || 'null-world-id';
        return `camera-position-memory-slot-${this.index}-${worldId}`;
    }

    /**
     * Delete the oldest thumbnails from localStorage if more than `limit` thumbnails are saved
     * @param {number} limit
     */
    manageStoredThumbnails(limit) {
        // get all of the localStorage memory keys not part of this world
        let allKeys = this.getAllKeysMatchingPattern(ID_PATTERN);
        let keysFromOtherWorlds = allKeys.filter(key => {
            return !key.includes(this.parentBar.worldId);
        });
        let numKeysInThisWorld = allKeys.length - keysFromOtherWorlds.length;
        // get and sort them by lastUsedDate, and remove the oldest ones if needed
        let keyAges = this.getKeyAges(keysFromOtherWorlds);
        let limitForOtherWorlds = limit - numKeysInThisWorld;
        this.removeOldestKeys(keyAges, limitForOtherWorlds);
    }
    getAllKeysMatchingPattern(thisRegex) {
        let keys = [];
        for (let i = 0; i < window.localStorage.length; i++) {
            let key = window.localStorage.key(i);
            if (thisRegex.test(key)) {
                keys.push(key);
            }
        }
        return keys;
    }
    getKeyAges(keys) {
        return keys.map(key => {
            let item = JSON.parse(window.localStorage.getItem(key));
            return {
                key,
                lastUsedDate: item ? new Date(item.lastUsedDate) : new Date(0)
            };
        });
    }
    removeOldestKeys(keys, limit) {
        keys.sort((a, b) => a.lastUsedDate - b.lastUsedDate);
        while (keys.length > limit) {
            let oldest = keys.shift();
            console.log(`removing ${oldest.key} memory thumbnail from localStorage because too many keys (${keys.length} out of ${limit})`);
            window.localStorage.removeItem(oldest.key);
        }
    }
}

class CameraPositionMemory {
    constructor(position, direction, thumbnailSrc, lastUsedDate, createdDate) {
        this.position = position;
        this.direction = direction;
        this.thumbnailSrc = thumbnailSrc;
        this.lastUsedDate = lastUsedDate;
        this.createdDate = createdDate;
    }
    toString() {
        return JSON.stringify({
            position: this.position,
            direction: this.direction,
            thumbnailSrc: this.thumbnailSrc,
            createdDate: this.createdDate,
            lastUsedDate: this.lastUsedDate,
        });
    }
}
