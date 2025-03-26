/**
 * Application configuration
 */
// Build application configuration from environment variables
const config = {
  server: {
    port: parseInt(process.env.PORT || 9000),
    timeoutMs: parseInt(process.env.TIMEOUT_MS || 30000),
    maxRetries: parseInt(process.env.MAX_RETRIES || 3)
  },

  // Parse comma-separated endpoints from env var
  endpoints: process.env.ENDPOINTS
    ? process.env.ENDPOINTS.split(',')
    : ['http://localhost:8080', 'http://localhost:8081', 'http://localhost:8082'],

  healthCheck: {
    enabled: process.env.HEALTH_CHECK_ENABLED !== 'false',
    intervalMs: parseInt(process.env.HEALTH_CHECK_INTERVAL_MS || 30000),
    failThreshold: parseInt(process.env.FAIL_THRESHOLD || 3),
    recoveryTimeMs: parseInt(process.env.RECOVERY_TIME_MS || 30000)
  },

  performanceBasedRouting: process.env.PERFORMANCE_BASED_ROUTING === 'true',
};

module.exports = config;
