createNameSpace('realityEditor.gui');

(function(exports) {
    class FileDrop {
        constructor(dropzone) {
            this.dropzone = dropzone;
            this.callbacks = {
                onFileDropped: []
            }
            this.setupEvents();
        }
        setupEvents() {
            this.dropzone.addEventListener('dragover', (event) => {
                event.preventDefault();
                console.log('dragover');

                // Allow other pointer move events during dragover
                // event.dataTransfer.effectAllowed = 'copy';
                
                // other mousemove events are blocked, so manually update the spatial cursor position
                realityEditor.spatialCursor.setCursorPosition(event.clientX, event.clientY);
                realityEditor.spatialCursor.setCursorStyle({highlighted: true});
                
                let isValidDropLocation = realityEditor.spatialCursor.isCursorOnValidPosition();
                
                // render some icon at clientX, clientY
                this.renderDragEffect(event.clientX, event.clientY, isValidDropLocation);
            });
            
            this.dropzone.addEventListener('drop', (event) => {
                event.preventDefault();

                let isValidDropLocation = realityEditor.spatialCursor.isCursorOnValidPosition();
                if (isValidDropLocation) {
                    try {
                        let file = event.dataTransfer.files[0];
                        console.log('dropped file', file);
                        this.callbacks.onFileDropped.forEach(cb => cb(file));
                    } catch(err) {
                        console.warn('error getting file from drop', err);
                    }
                }

                realityEditor.spatialCursor.setCursorStyle({highlighted: false});
                this.hideDragEffect();
            });
        }
        onFileDropped(callback) {
            this.callbacks.onFileDropped.push(callback);
        }
        renderDragEffect(x, y, isValid) {
            // add a 2D effect at the 2d pointer position
            if (!this.dragEffectDiv) {
                this.dragEffectDiv = document.createElement('div');
                this.dragEffectDiv.classList.add('file-drop-overlay-circle');
                document.body.appendChild(this.dragEffectDiv);
            }

            this.dragEffectDiv.style.display = '';
            this.dragEffectDiv.style.transform = `translate3d(${x}px, ${y}px, 1200px)`;
            
            if (isValid) {
                this.dragEffectDiv.classList.remove('file-drop-invalid');
                this.dragEffectDiv.classList.add('file-drop-valid');
            } else {
                this.dragEffectDiv.classList.remove('file-drop-valid');
                this.dragEffectDiv.classList.add('file-drop-invalid');
            }

            // transform the spatial cursor or add something at its position
        }
        hideDragEffect() {
            this.dragEffectDiv.style.display = 'none';
        }
    }

    exports.FileDrop = FileDrop;
})(realityEditor.gui);
