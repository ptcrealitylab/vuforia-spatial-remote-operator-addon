import { captureScreenshot } from '../../src/gui/sceneCapture.js';

// each thumbnail is only a few kb, but we can prevent filling up localStorage with hundreds of metaverses
// of old thumbnails by imposing a limit, and the thumbnails used least recently will be cleared out
const MAX_LOCAL_STORAGE_ENTRIES = 100;
const ID_PATTERN = /^camera-position-memory-slot-\d+-.*$/;

const ADD_MEMORY_SRC = 'addons/vuforia-spatial-remote-operator-addon/memory-add.svg';

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
            onMemorySelected: [],
            onBarVisibilityToggledInternally: [],
        };

        const NUM_MEMORIES = 5;
        this.memorySlots = this.buildMemorySlots(NUM_MEMORIES);
        this.dom = this.buildDom();
        document.body.appendChild(this.dom);

        this.dom.classList.add('hidden-memory-bar');
    }
    /**
     * Create the HTML elements for the memory bar
     * @return {HTMLDivElement}
     */
    buildDom() {
        let barParent = document.createElement('div');
        barParent.classList.add('camera-position-memory-bar-parent');

        let bar = document.createElement('div');
        bar.classList.add('camera-position-memory-bar');
        this.memorySlots.forEach(slot => {
            bar.appendChild(slot.dom);
        });
        barParent.appendChild(bar);

        let label = document.createElement('div');
        label.classList.add('camera-position-memory-bar-label');
        label.textContent = 'Save or load a camera perspective:';
        barParent.appendChild(label);

        let barHide = document.createElement('div');
        barHide.textContent = '–';
        barHide.style.borderTopRightRadius = '10px';
        barHide.classList.add('camera-position-memory-slot-x');
        bar.appendChild(barHide);

        barHide.addEventListener('click', () => {
            this.toggleVisibility(false);
            this.callbacks.onBarVisibilityToggledInternally.forEach((cb) => cb(false));
        });

        return barParent;
    }
    /**
     * Create each of the memory slots, and load them from localStorage if previously saved for this world
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
     * Subscribe to when a memory is selected/loaded
     * @param {function} cb
     */
    onMemorySelected(cb) {
        this.callbacks.onMemorySelected.push(cb);
    }
    /**
     * Subscribe to when the bar is hidden using the close button
     * @param {function} cb
     */
    onBarVisibilityToggledInternally(cb) {
        this.callbacks.onBarVisibilityToggledInternally.push(cb);
    }
    /**
     * Triggers when a memory is clicked on, to tell subscribers to load the memory
     * @param {CameraPositionMemory} memory
     */
    memorySelected(memory) {
        this.callbacks.onMemorySelected.forEach(cb => {
            cb(memory.position, memory.direction);
        });
    }
    /**
     * Show or hide the memory bar
     * @param {boolean} shouldShow
     */
    toggleVisibility(shouldShow) {
        if (shouldShow) {
            this.dom.classList.remove('hidden-memory-bar');
        } else {
            this.dom.classList.add('hidden-memory-bar');
        }
    }
    /**
     * Saves the current camera perspective as a memory in the provided slot index
     * @param {number} index
     */
    saveMemoryInSlot(index) {
        if (index >= this.memorySlots.length) {
            console.warn(`memory slot ${index} doesn't exist; only goes up to ${this.memorySlots.length - 1}`);
            return;
        }
        let memorySlot = this.memorySlots[index];
        if (!memorySlot) return;

        memorySlot.captureMemoryForCurrentState().then(({position, direction, screenshotImageSrc}) => {
            memorySlot.saveMemory(position, direction, screenshotImageSrc, undefined, undefined);
        });
    }

    /**
     * Loads the memory from the provided slot index, if one exists
     * @param {number} index
     */
    loadMemoryFromSlot(index) {
        if (index >= this.memorySlots.length) {
            console.warn(`memory slot ${index} doesn't exist; only goes up to ${this.memorySlots.length - 1}`);
            return;
        }
        let memorySlot = this.memorySlots[index];
        if (!memorySlot) return;

        memorySlot.loadMemory();
    }
}

/**
 * A single slot of the CameraPositionMemoryBar where a memory can be saved and loaded.
 */
class CameraPositionMemorySlot {
    /**
     * @param {CameraPositionMemoryBar} memoryBar - the CameraPositionMemoryBar that this belongs to
     * @param {number} index
     */
    constructor(memoryBar, index) {
        this.memoryBar = memoryBar;
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
        // image.src = ADD_MEMORY_SRC;
        image.style.backgroundImage = `url('${ADD_MEMORY_SRC}')`;
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
                this.captureMemoryForCurrentState().then(({position, direction, screenshotImageSrc}) => {
                    this.saveMemory(position, direction, screenshotImageSrc, undefined, undefined);
                });
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
     * Asynchronously takes a snapshot of the current perspective and resolves with the information
     * @return {Promise<{position: number[], direction: number[], screenshotImageSrc: string}>}
     */
    captureMemoryForCurrentState() {
        return new Promise((resolve, _reject) => {
            let { position, direction } = this.memoryBar.cameraPositionGetter();

            let canvasId = realityEditor.spatialCursor.isGSActive() ? 'gsCanvas' : 'mainThreejsCanvas';

            captureScreenshot(canvasId, { outputWidth: 120, useJpgCompression: true, jpgQuality: 0.7 }).then(screenshotImageSrc => {
                resolve({position, direction, screenshotImageSrc});
            });
        });
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
        image.style.backgroundImage = `url('${ADD_MEMORY_SRC}')`;
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
        this.memoryBar.memorySelected(this.memory);
    }
    /**
     * Helper function to get a unique ID for this memory slot in this world, which can be used as a localStorage key
     * @return {string}
     */
    getId() {
        if (!this.memoryBar.worldId) {
            console.warn('trying to save/load CameraPositionMemory for null world id; something may be wrong');
        }
        let worldId = this.memoryBar.worldId || 'null-world-id';
        return `camera-position-memory-slot-${this.index}-${worldId}`;
    }
    /**
     * Delete the oldest thumbnails from localStorage if more than `limit` thumbnails are saved
     * Sorted by lastUsedDate (last saved or loaded) to hopefully not delete from recently used worlds
     * Makes sure not to delete thumbnails from the current world
     * @param {number} limit - how many memories can be stored in localStorage before deleting oldest ones
     */
    manageStoredThumbnails(limit) {
        let allKeys = this.getLocalStorageKeysMatchingPattern(ID_PATTERN);
        let keysFromOtherWorlds = allKeys.filter(key => {
            return !key.includes(this.memoryBar.worldId);
        });
        let numKeysInThisWorld = allKeys.length - keysFromOtherWorlds.length;
        // get and sort them by lastUsedDate, and remove the oldest ones if needed
        let keyAges = this.getKeyAges(keysFromOtherWorlds);
        let limitForOtherWorlds = limit - numKeysInThisWorld;
        this.removeOldestKeys(keyAges, limitForOtherWorlds);
    }
    /**
     * Helper function for manageStoredThumbnails to get all relevant entries from localStorage
     * @param {RegExp} thisRegex
     * @return {string[]}
     */
    getLocalStorageKeysMatchingPattern(thisRegex) {
        let keys = [];
        for (let i = 0; i < window.localStorage.length; i++) {
            let key = window.localStorage.key(i);
            if (thisRegex.test(key)) {
                keys.push(key);
            }
        }
        return keys;
    }
    /**
     * Helper function to pair up localStorage keys with the lastUsedDate in their associated stored value
     * @param keys
     * @return {{key: string, lastUsedDate: Date}[]}
     */
    getKeyAges(keys) {
        return keys.map(key => {
            let item = JSON.parse(window.localStorage.getItem(key));
            return {
                key,
                lastUsedDate: item ? new Date(item.lastUsedDate) : new Date(0)
            };
        });
    }
    /**
     * Deletes the oldest keys until there are no more than `limit` keys in storage
     * @param {{key: string, lastUsedDate: Date}[]} keys
     * @param {number} limit
     */
    removeOldestKeys(keys, limit) {
        keys.sort((a, b) => a.lastUsedDate - b.lastUsedDate);
        while (keys.length > limit) {
            let oldest = keys.shift();
            console.log(`removing ${oldest.key} memory thumbnail from localStorage because too many keys (${keys.length} out of ${limit})`);
            window.localStorage.removeItem(oldest.key);
        }
    }
}

/**
 * Simple class to store all of the information associated with a saved camera perspective
 */
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
