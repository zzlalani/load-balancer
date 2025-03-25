/**
 * EndpointHealth - Tracks health metrics for a specific endpoint
 */
class EndpointHealth {
  constructor(url, config) {
    this.url = url;
    this.consecutiveFailures = 0;
    this.lastFailureTime = 0;
    this.avgResponseTimeMs = 0;
    this.config = config;
  }

  isHealthy() {
    if (this.consecutiveFailures >= this.config.healthCheck.failThreshold) {
      const timeSinceFailure = Date.now() - this.lastFailureTime;
      return timeSinceFailure > this.config.healthCheck.recoveryTimeMs;
    }
    return true;
  }

  recordSuccess() {
    this.consecutiveFailures = 0;
  }

  recordFailure() {
    this.consecutiveFailures += 1;
    this.lastFailureTime = Date.now();
  }

  updateResponseTime(responseTimeMs) {
    const alpha = 0.3; // Weight for exponential moving average

    if (this.avgResponseTimeMs === 0) {
      this.avgResponseTimeMs = responseTimeMs;
    } else {
      this.avgResponseTimeMs = (alpha * responseTimeMs) + ((1 - alpha) * this.avgResponseTimeMs);
    }
  }

  getHealthData() {
    return {
      url: this.url,
      healthy: this.isHealthy(),
      consecutiveFailures: this.consecutiveFailures,
      lastFailureTime: this.lastFailureTime ? new Date(this.lastFailureTime).toISOString() : null,
      avgResponseTimeMs: Math.round(this.avgResponseTimeMs * 100) / 100
    };
  }
}

module.exports = EndpointHealth;
