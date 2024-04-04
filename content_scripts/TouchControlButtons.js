export class TouchControlButtons {
    constructor() {
        if (realityEditor.device.environment.isDesktop()) {
            console.warn('Are you sure you want to create the TouchControlButtons on desktop?');
        }

        this.buttons = [];
        this.MODES = Object.freeze({
            pointer: 'pointer',
            pan: 'pan',
            rotate: 'rotate',
            zoom: 'zoom'
        });
        this.callbacks = {
            onModeSelected: [],
        };

        let iconSrc = {};
        iconSrc[this.MODES.pointer] = 'addons/vuforia-spatial-remote-operator-addon/touch-controls-white-pointer.svg';
        iconSrc[this.MODES.pan] = 'addons/vuforia-spatial-remote-operator-addon/touch-controls-white-pan.svg';
        iconSrc[this.MODES.rotate] = 'addons/vuforia-spatial-remote-operator-addon/touch-controls-white-rotate.svg';
        iconSrc[this.MODES.zoom] = 'addons/vuforia-spatial-remote-operator-addon/touch-controls-white-zoom.svg';

        // create the elements
        let container = document.createElement('div');
        this.container = container;

        Object.values(this.MODES).forEach(mode => {
            let button = this.createButton(mode, iconSrc[mode]);
            container.appendChild(button);
            this.buttons.push(button);
        });
    }
    createButton(mode, src) {
        let div = document.createElement('div');
        div.classList.add('touchControlButtonContainer');
        div.id = `touchControlButton_${mode}`;
        let icon = document.createElement('img');
        icon.classList.add('touchControlButtonIcon');
        icon.src = src;
        div.appendChild(icon);

        icon.addEventListener('pointerup', () => {
            this.selectMode(mode);
        });

        return div;
    }
    selectMode(mode) {
        this.deselectButtons();
        let button = document.querySelector(`#touchControlButton_${mode}`);
        button.classList.add('selected');

        this.callbacks.onModeSelected.forEach(cb => {
            cb(mode);
        });
    }
    deselectButtons() {
        this.buttons.forEach(button => {
            button.classList.remove('selected');
        });
    }
    onModeSelected(callback) {
        this.callbacks.onModeSelected.push(callback);
    }
}
