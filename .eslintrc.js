module.exports = {
    'env': {
        'browser': true,
        'es2022': true
    },
    'extends': 'eslint:recommended',
    'globals': {
        'Stats': 'readonly',

        'realityEditor': 'writable',
        'createNameSpace': 'writable',
        'globalStates': 'writable',
        'objects': 'writable'
    },
    'parserOptions': {
        'ecmaVersion': 2022,
        sourceType: 'module',
    },
    'rules': {
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
    }
};
