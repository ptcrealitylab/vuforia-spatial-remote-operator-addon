/*
* Copyright © 2021 PTC
*/

createNameSpace('realityEditor.device');

(function(exports) {

    class KeyboardListener {
        constructor() {
            /**
             * Enum mapping readable keyboard names to their keyCode
             * @type {Readonly<{LEFT: number, UP: number, RIGHT: number, DOWN: number, ONE: number, TWO: number, ESCAPE: number, W: number, A: number, S: number, D: number}>}
             */
            this.keyCodes = Object.freeze({
                LEFT: 37,
                UP: 38,
                RIGHT: 39,
                DOWN: 40,
                ONE: 49,
                TWO: 50,
                ESCAPE: 27,
                W: 87,
                A: 65,
                S: 83,
                D: 68,
                Q: 81,
                E: 69,
                V: 86,
                M: 77,
                N: 78,
                O: 79,
                SHIFT: 16
            });
            this.keyStates = {};
            this.callbacks = {
                onKeyDown: [],
                onKeyUp: []
            };

            // set up the keyStates map with default value of "up" for each key
            Object.keys(this.keyCodes).forEach(function(keyName) {
                this.keyStates[this.keyCodes[keyName]] = 'up';
            }.bind(this));

            this.initListeners();
        }
        initListeners() {
            // when a key is pressed down, automatically update that entry in keyStates and trigger callbacks
            document.addEventListener('keydown', function(event) {
                event.preventDefault();
                var code = event.keyCode ? event.keyCode : event.which;
                if (this.keyStates.hasOwnProperty(code)) {
                    this.keyStates[code] = 'down';
                    this.callbacks.onKeyDown.forEach(function(cb) {
                        cb(code);
                    });
                }
            }.bind(this));

            // when a key is released, automatically update that entry in keyStates and trigger callbacks
            document.addEventListener('keyup', function(event) {
                event.preventDefault();
                var code = event.keyCode ? event.keyCode : event.which;
                if (this.keyStates.hasOwnProperty(code)) {
                    this.keyStates[code] = 'up';
                    this.callbacks.onKeyUp.forEach(function(cb) {
                        cb(code);
                    });
                }
            }.bind(this));
        }
        onKeyDown(callback) {
            this.callbacks.onKeyDown.push(callback);
        }
        onKeyUp(callback) {
            this.callbacks.onKeyUp.push(callback);
        }

    }

    exports.KeyboardListener = KeyboardListener;
})(realityEditor.device);
