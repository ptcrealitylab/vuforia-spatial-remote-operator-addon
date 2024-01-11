/* global SpatialInterface, EnvelopeContents */

const SYSTEM_PROMPT = `Describe what you can see in the image, and generate the description so it is suitable to be used for alt-text.`;
const apiKey = '';

const ShaderMode = {
    HIDDEN: 'HIDDEN',
    SOLID: 'SOLID',
    DIFF: 'DIFF',
    DIFF_DEPTH: 'DIFF_DEPTH',
};

let shaderMode = 'SOLID';

let spatialInterface;
let envelopeContents;

if (!spatialInterface) {
    spatialInterface = new SpatialInterface();

    // allow the tool to be nested inside of envelopes
    envelopeContents = new EnvelopeContents(spatialInterface, document.body);

    // hide the associated spatial snapshot when the parent envelope containing this tool closes
    envelopeContents.onClose(() => {
        spatialInterface.patchSetShaderMode(ShaderMode.HIDDEN);
    });

    // restore the associated spatial snapshot when the parent envelope containing this tool opens
    envelopeContents.onOpen(() => {
        spatialInterface.patchSetShaderMode(shaderMode);
    });

    // listen for isEditable and expandFrame messages from envelope
    envelopeContents.onMessageFromEnvelope(function(e) {
        console.log('spatial patch got message from envelope', e);
        if (typeof e.toggleVisibility !== 'undefined') {
            let newShaderMode = e.toggleVisibility ? ShaderMode.SOLID : ShaderMode.HIDDEN;
            setShaderMode(newShaderMode);
            spatialInterface.writePublicData('storage', 'shaderMode', shaderMode);
        }
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

    if (envelopeContents) {
        console.log('spatial patch sending new toggle state to envelope');
        envelopeContents.sendMessageToEnvelope({
            toggleVisibility: shaderMode === ShaderMode.SOLID
        });
    }

    spatialInterface.writePublicData('storage', 'shaderMode', shaderMode);
}, false);

// add some slight visual feedback when you tap on the button
launchButton.addEventListener('pointerdown', () => {
    launchButton.classList.add('launchButtonPressed');
});

// add random init gradient for the tool icon
const randomDelay = -Math.floor(Math.random() * 100);
launchButton.style.animationDelay = `${randomDelay}s`;

function setShaderMode(newShaderMode) {
    shaderMode = newShaderMode;
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

async function generateDescription(serialization) {
    const messages = [{
        role: 'system',
        content: SYSTEM_PROMPT,
    }, {
        role: 'user',
        content: [{
            type: 'image',
            image_url: {
                url: serialization.texture,
            }
        }],
    }];

    const body = {
        model: 'gpt-4-vision-preview',
        max_tokens: 4096,
        temperature: 0,
        messages,
    };

    try {
        const response = await fetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${apiKey}`,
                'Content-type': 'application/json',
            },
            body: JSON.stringify(body),
        });
        const data = await response.json();
        console.log('got openai', data);
        serialization.description = data.choices[0].message.content;
        spatialInterface.writePublicData('storage', 'serialization', serialization);
    } catch (error) {
        console.error('not openai', error);
    }
}


spatialInterface.onSpatialInterfaceLoaded(function() {
    spatialInterface.setVisibilityDistance(100);
    spatialInterface.setMoveDelay(300);
    // spatialInterface.setAlwaysFaceCamera(true);

    spatialInterface.initNode('storage', 'storeData');

    spatialInterface.addReadPublicDataListener('storage', 'serialization', serialization => {
        if (!serialization.description) {
            generateDescription(serialization);
        }
        spatialInterface.patchHydrate(serialization);
    });

    spatialInterface.addReadPublicDataListener('storage', 'shaderMode', storedShaderMode => {
        if (storedShaderMode !== shaderMode) {
            shaderMode = storedShaderMode;

            if (envelopeContents) {
                console.log('spatial patch sending stored toggle state to envelope');
                envelopeContents.sendMessageToEnvelope({
                    toggleVisibility: shaderMode === ShaderMode.SOLID
                });
            }

            setShaderMode(shaderMode);
        }
    });
});
