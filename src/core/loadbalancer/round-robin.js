/**
 * RoundRobinLoadBalancer - Distributes requests across multiple endpoints
 */
const EndpointHealth = require("./endpoint-health");

class RoundRobinLoadBalancer {
  constructor(config, logger) {
    this.endpoints = config.endpoints;
    this.currentIndex = 0;
    this.endpointHealth = new Map();
    this.config = config;
    this.logger = logger;

    // Initialize health tracking for all endpoints
    this.endpoints.forEach(endpoint => {
      this.endpointHealth.set(endpoint, new EndpointHealth(endpoint, config));
    });

    logger.info(`Load balancer initialized with ${this.endpoints.length} endpoints`);
  }

  getNextEndpoint() {
    if (this.endpoints.length === 0) {
      this.logger.warn('No endpoints configured for load balancing');
      return null;
    }

    // Try each endpoint once to find a healthy one
    for (let i = 0; i < this.endpoints.length; i++) {
      // Get next index with wrap-around
      const index = (this.currentIndex + i) % this.endpoints.length;
      const endpoint = this.endpoints[index];

      const health = this.endpointHealth.get(endpoint);
      if (!health) {
        this.logger.warn(`Health data not found for endpoint: ${endpoint}`);
        continue;
      }

      if (health.isHealthy()) {
        // Update current index for next call
        this.currentIndex = (index + 1) % this.endpoints.length;
        this.logger.debug(`Selected endpoint: ${endpoint}`);
        return endpoint;
      }

      this.logger.warn(`Skipping unhealthy endpoint: ${endpoint}`);
    }

    // If all endpoints are unhealthy, try the next one anyway as a last resort
    const index = this.currentIndex;
    this.currentIndex = (this.currentIndex + 1) % this.endpoints.length;
    const endpoint = this.endpoints[index];

    this.logger.warn(`All endpoints are unhealthy, trying ${endpoint} as a last resort`);
    return endpoint;
  }

  markEndpointSuccess(endpoint) {
    const health = this.endpointHealth.get(endpoint);
    if (health) {
      health.recordSuccess();
    }
  }

  markEndpointFailed(endpoint) {
    const health = this.endpointHealth.get(endpoint);
    if (health) {
      health.recordFailure();
      this.logger.warn(`Marked endpoint as failed: ${endpoint}, consecutive failures: ${health.consecutiveFailures}`);
    }
  }

  recordResponseTime(endpoint, responseTimeMs) {
    const health = this.endpointHealth.get(endpoint);
    if (health) {
      health.updateResponseTime(responseTimeMs);
    }
  }

  getEndpointHealth() {
    const healthData = {};

    this.endpointHealth.forEach((health, endpoint) => {
      healthData[endpoint] = health.getHealthData();
    });

    return healthData;
  }
}

module.exports = RoundRobinLoadBalancer;
