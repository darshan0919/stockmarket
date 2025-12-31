module.exports = {
  testEnvironment: 'node',
  coveragePathIgnorePatterns: ['/node_modules/'],
  testMatch: ['**/tests/**/*.test.js', '**/__tests__/**/*.test.js'],
  collectCoverageFrom: [
    'controllers/**/*.js',
    'utils/**/*.js',
    'api/**/*.js',
    'middleware/**/*.js',
    '!**/node_modules/**',
    '!**/__tests__/**',
  ],
  testTimeout: 20000,
  verbose: true,
};
