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

  getNextEndpoint(usePerformanceBasedRouting = false) {
    if (this.endpoints.length === 0) {
      this.logger.warn('No endpoints configured for load balancing');
      return null;
    }

    // Use performance-based routing if enabled and we have response time data
    if (usePerformanceBasedRouting && this.hasResponseTimeData()) {
      return this.getEndpointBasedOnPerformance();
    }

    // Otherwise, use standard round-robin with health checks
    return this.getEndpointRoundRobin();
  }

  hasResponseTimeData() {
    // We need at least one endpoint with recorded response time
    let hasData = false;
    this.endpointHealth.forEach(health => {
      if (health.avgResponseTimeMs > 0) {
        hasData = true;
      }
    });
    return hasData;
  }

  /**
   * Select an endpoint based on health and performance (response time)
   * Simpler implementation that favors faster endpoints more
   */
  getEndpointBasedOnPerformance() {
    this.logger.debug('Using performance-based endpoint selection');

    // Get healthy endpoints with response time data
    const healthyEndpoints = [];
    const weights = [];

    this.endpoints.forEach(endpoint => {
      const health = this.endpointHealth.get(endpoint);
      if (health && health.isHealthy()) {
        healthyEndpoints.push(endpoint);
        // Faster endpoints get higher weights (inverse of response time)
        weights.push(health.avgResponseTimeMs > 0 ? 1 / health.avgResponseTimeMs : 1);
      }
    });

    // Fall back to round-robin if no valid endpoints
    if (healthyEndpoints.length === 0) {
      this.logger.warn('No healthy endpoints with response time data, falling back to round-robin');
      return this.getEndpointRoundRobin();
    }

    // Use a simplified selection approach - pick the fastest endpoint 70% of the time,
    // and randomly select from others 30% of the time to prevent starvation
    if (Math.random() < 0.7) {
      // Find the index with maximum weight (fastest endpoint)
      const maxWeightIndex = weights.indexOf(Math.max(...weights));
      const selectedEndpoint = healthyEndpoints[maxWeightIndex];
      this.logger.debug(`Selected fastest endpoint: ${selectedEndpoint}`);
      return selectedEndpoint;
    } else {
      // Randomly select any healthy endpoint (even distribution)
      const randomIndex = Math.floor(Math.random() * healthyEndpoints.length);
      const selectedEndpoint = healthyEndpoints[randomIndex];
      this.logger.debug(`Selected random healthy endpoint: ${selectedEndpoint}`);
      return selectedEndpoint;
    }
  }

  getEndpointRoundRobin() {
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
        this.logger.debug(`Selected endpoint (round-robin): ${endpoint}`);
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
