/* global SpatialInterface */

let spatialInterface;

if (!spatialInterface) {
    spatialInterface = new SpatialInterface();
}

const ShaderMode = {
    HIDDEN: 'HIDDEN',
    SOLID: 'SOLID',
    DIFF: 'DIFF',
    DIFF_DEPTH: 'DIFF_DEPTH',
};

let shaderMode = 'SOLID';

const launchButton = document.getElementById('launchButton');
launchButton.addEventListener('pointerup', function () {
    switch (shaderMode) {
    case ShaderMode.HIDDEN:
        shaderMode = ShaderMode.SOLID;
        break;
    case ShaderMode.SOLID: // skips over DIFF and DIFF_DEPTH for now
    default:
        shaderMode = ShaderMode.HIDDEN;
        break;
    }
    spatialInterface.patchSetShaderMode(shaderMode);
    spatialInterface.writePublicData('storage', 'shaderMode', shaderMode);
}, false);

// add random init gradient for the tool icon
const randomDelay = -Math.floor(Math.random() * 100);
launchButton.style.animationDelay = `${randomDelay}s`;

spatialInterface.onSpatialInterfaceLoaded(function() {
    spatialInterface.setVisibilityDistance(100);
    spatialInterface.setMoveDelay(300);
    // spatialInterface.setAlwaysFaceCamera(true);

    spatialInterface.initNode('storage', 'storeData');

    spatialInterface.addReadPublicDataListener('storage', 'serialization', serialization => {
        spatialInterface.patchHydrate(serialization);
    });

    spatialInterface.addReadPublicDataListener('storage', 'shaderMode', storedShaderMode => {
        if (storedShaderMode !== shaderMode) {
            shaderMode = storedShaderMode;
            spatialInterface.patchSetShaderMode(shaderMode);
        }
    });
});
