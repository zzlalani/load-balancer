/**
 * Health controller
 * Provides health status of load balancer and backend services
 */

/**
 * Create a health controller
 * @param {Object} loadBalancer - Load balancer instance
 * @param {Object} config - Configuration object
 * @param {Object} logger - Logger instance
 */
function createHealthController(loadBalancer, config, logger) {
  /**
   * Get health status
   */
  const getHealth = (req, res) => {
    const healthData = {
      status: 'UP',
      timestamp: new Date().toISOString(),
      endpoints: loadBalancer.getEndpointHealth()
    };

    logger.debug('Health check requested');
    res.json(healthData);
  };

  return {
    getHealth
  };
}

module.exports = createHealthController;
