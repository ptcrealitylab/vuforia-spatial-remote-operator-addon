/* global SpatialInterface */

const ShaderMode = {
    HIDDEN: 'HIDDEN',
    SOLID: 'SOLID',
    DIFF: 'DIFF',
    DIFF_DEPTH: 'DIFF_DEPTH',
};

let shaderMode = 'SOLID';

let spatialInterface;

if (!spatialInterface) {
    spatialInterface = new SpatialInterface();

    // allow the tool to be nested inside of envelopes
    let envelopeContents = new EnvelopeContents(spatialInterface, document.body);
    
    // hide the associated spatial snapshot when the parent envelope containing this tool closes
    envelopeContents.onClose(() => {
        spatialInterface.patchSetShaderMode(ShaderMode.HIDDEN);
    });

    // restore the associated spatial snapshot when the parent envelope containing this tool opens
    envelopeContents.onOpen(() => {
        spatialInterface.patchSetShaderMode(shaderMode);
    });
}

const launchButton = document.getElementById('launchButton');
launchButton.classList.add('launchButtonExpanded');

launchButton.addEventListener('pointerup', function () {
    launchButton.classList.remove('launchButtonPressed');

    switch (shaderMode) {
    case ShaderMode.HIDDEN:
        shaderMode = ShaderMode.SOLID;
        break;
    case ShaderMode.SOLID: // skips over DIFF and DIFF_DEPTH for now
    default:
        shaderMode = ShaderMode.HIDDEN;
        break;
    }
    setShaderMode(shaderMode);
    spatialInterface.writePublicData('storage', 'shaderMode', shaderMode);
}, false);

// add some slight visual feedback when you tap on the button
launchButton.addEventListener('pointerdown', () => {
    launchButton.classList.add('launchButtonPressed');
});

// add random init gradient for the tool icon
const randomDelay = -Math.floor(Math.random() * 100);
launchButton.style.animationDelay = `${randomDelay}s`;

function setShaderMode(shaderMode) {
    // add some visual feedback, so you know if it's open or closed
    if (shaderMode === ShaderMode.HIDDEN) {
        launchButton.classList.remove('launchButtonExpanded');
        launchButton.classList.add('launchButtonCollapsed');
    } else if (shaderMode === ShaderMode.SOLID) {
        launchButton.classList.remove('launchButtonCollapsed');
        launchButton.classList.add('launchButtonExpanded');
    }
    spatialInterface.patchSetShaderMode(shaderMode);
}

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
            setShaderMode(shaderMode);
        }
    });
});
