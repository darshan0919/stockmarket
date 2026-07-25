module.exports = {
  root: true,
  env: {
    node: true,
    es2022: true,
    jest: true,
    browser: true,
  },
  extends: ['eslint:recommended', 'plugin:react/recommended', 'prettier'],
  parserOptions: {
    ecmaVersion: 'latest',
    sourceType: 'module',
    ecmaFeatures: {
      jsx: true,
    },
  },
  settings: {
    react: {
      version: 'detect',
    },
  },
  rules: {
    'no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
    'no-console': 'off',
    'react/react-in-jsx-scope': 'off',
    'react/prop-types': 'off',
    'no-empty': 'warn',
    'no-useless-escape': 'off',
  },
  ignorePatterns: [
    'node_modules/',
    '.next/',
    'coverage/',
    'data/',
    'downloads/',
    '.yarn/',
    '*.json',
    '*.pdf',
    '*.docx',
    'skills/',
    'stock-api/main.js',
    'stock-api/bin/',
    'stock-api/*_tmp*.js',
    'stock-api/fix*.js',
    'check_deals_tmp.js',
    'run_render_pdf_tmp.js',
    'save_gandhar_tmp.js',
  ],
};
