module.exports = {
  testEnvironment: 'node',
  verbose: true,
  collectCoverageFrom: [
    'src/**/*.js',
    '!src/server.js',
    '!**/node_modules/**'
  ],
  coverageThreshold: {
    global: {
      branches: 70,
      functions: 80,
      lines: 80,
      statements: 80
    }
  },
  testPathIgnorePatterns: [
    '/node_modules/'
  ],
  // Set timeout to 10 seconds for all tests
  testTimeout: 10000,
  // Clear all mocks between tests
  clearMocks: true,
  // Reset modules between tests to ensure clean environment
  resetModules: true
};