/**
 * Mock configuration for testing
 */
module.exports = {
  app: {
    server: {
      port: 9000,
      timeoutMs: 5000,
      maxRetries: 3
    },
    endpoints: [
      'http://localhost:8080',
      'http://localhost:8081',
      'http://localhost:8082'
    ],
    healthCheck: {
      enabled: true,
      intervalMs: 30000,
      failThreshold: 3,
      recoveryTimeMs: 30000
    },
    performanceBasedRouting: false
  }
};
