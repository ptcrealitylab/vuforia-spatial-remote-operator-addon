/* eslint-env node */
module.exports = {
    'env': {
        'es2022': true,
    },
    'extends': 'eslint:recommended',
    'globals': {
        'Stats': 'readonly',

        'realityEditor': 'writable',
        'createNameSpace': 'writable',
        'globalStates': 'writable',
        'objects': 'writable',
        'overlayDiv': 'writable',
    },
    'parserOptions': {
        'ecmaVersion': 2022,
        'sourceType': 'module',
    },
    'rules': {
        'no-shadow': 'off',
        'no-useless-escape': 'off',
        'no-prototype-builtins': 'off',
        'no-redeclare': [
            'error',
            {'builtinGlobals': false}
        ],
        'no-unused-vars': [
            'error',
            {
                'varsIgnorePattern': '^_',
                'argsIgnorePattern': '^_',
            },
        ],
        'no-inner-declarations': 'off',
    },
    'overrides': [{
        'files': [
            'content_scripts/**/*.js',
            'tools/**/*.js',
        ],
        'env': {
            'browser': true,
        }
    }, {
        'files': ['interfaces/**/*.js'],
        'env': {
            'node': true,
        }
    }],
};
