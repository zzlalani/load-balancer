/**
 * Generic Proxy Controller
 * Handles forwarding any request to backend instances
 */

/**
 * Create a proxy controller
 * @param {Object} requestForwarder - Request forwarder instance
 * @param {Object} logger - Logger instance
 */
function createProxyController(requestForwarder, logger) {
  /**
   * Handle any request by forwarding it to a backend instance
   */
  const handleRequest = async (req, res) => {
    const startTime = Date.now();

    try {
      logger.info(`Received ${req.method} request: ${req.originalUrl}`);

      const response = await requestForwarder.forwardRequest(req);

      // Copy response headers
      Object.entries(response.headers).forEach(([key, value]) => {
        // Skip headers that might cause issues
        if (!['transfer-encoding', 'connection'].includes(key.toLowerCase())) {
          res.set(key, value);
        }
      });

      // Send response with appropriate status code and data
      res.status(response.status).send(response.data);

      const duration = Date.now() - startTime;
      logger.info(`Request completed in ${duration}ms`);

    } catch (error) {
      const duration = Date.now() - startTime;
      logger.error(`Request failed: ${error.message} (${duration}ms)`);

      const statusCode = error.response?.status || 500; // Default to Internal Server Error
      res.status(statusCode).json({
        error: 'Failed to process request',
        message: error.message
      });
    }
  };

  return {
    handleRequest
  };
}

module.exports = createProxyController;
