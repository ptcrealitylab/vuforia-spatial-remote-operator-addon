import Splatting from '../../src/splatting/Splatting.js';

const IMAGE_SRC = {
    save: 'addons/vuforia-spatial-remote-operator-addon/memory-add.svg',
    // load: 'addons/vuforia-spatial-remote-operator-addon/memory-load.svg',
};

export class CameraPositionMemoryBar {
    constructor(cameraPositionGetter) {
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
            let slot = new CameraPositionMemorySlot(this);
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
     */
    constructor(parentBar) {
        this.parentBar = parentBar;
        this.dom = this.buildDom();
        this.memory = null;
    }
    /**
     * @return {HTMLDivElement}
     */
    buildDom() {
        let slot = document.createElement('div');
        slot.classList.add('camera-position-memory-slot');

        let image = document.createElement('div');
        // image.width = '120px';
        // image.height = '80px';
        image.classList.add('camera-position-memory-slot-image');
        // image.src = IMAGE_SRC.save;
        image.style.backgroundImage = `url('${IMAGE_SRC.save}')`;
        image.style.backgroundSize = '50%';
        slot.appendChild(image);

        let xButton = document.createElement('div');
        xButton.classList.add('camera-position-memory-slot-x');

        slot.addEventListener('click', () => {
            if (this.memory) {
                this.loadMemory();
            } else {
                let { position, direction } = this.parentBar.cameraPositionGetter();

                Splatting.captureScreenshot();
                setTimeout(() => {
                    let screenshotImage = Splatting.getMostRecentScreenshot();
                    this.saveMemory(position, direction, screenshotImage);
                }, 100);
            }
        });

        return slot;
    }
    saveMemory(position, direction, thumbnailSrc) {
        this.memory = new CameraPositionMemory(position, direction);
        // set image to thumbnail
        let image = this.dom.querySelector('.camera-position-memory-slot-image');
        // image.src = thumbnailSrc;
        image.style.backgroundImage = `url('${thumbnailSrc}')`;
        image.style.backgroundSize = 'cover';
    }
    clearMemory() {
        this.memory = null;
        // reset image to "+"
        let image = this.dom.querySelector('.camera-position-memory-slot-image');
        // image.src = IMAGE_SRC.save;
        image.backgroundImage = `url('${IMAGE_SRC.save}')`;
        image.style.backgroundSize = '50%';
    }
    loadMemory() {
        this.parentBar.memorySelected(this.memory);
    }
}

class CameraPositionMemory {
    constructor(position, direction) {
        this.position = position;
        this.direction = direction;
    }
}
