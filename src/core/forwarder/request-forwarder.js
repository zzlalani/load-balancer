/**
 * Generic Request Forwarder - Forwards any HTTP request to backend services
 */
const axios = require('axios');

class RequestForwarder {
  /**
   * Create a new RequestForwarder
   * @param {Object} loadBalancer - Load balancer instance
   * @param {Object} config - Configuration object
   * @param {Object} logger - Logger instance
   */
  constructor(loadBalancer, config, logger) {
    this.loadBalancer = loadBalancer;
    this.config = config;
    this.logger = logger;

    // Create axios instance with default settings
    this.client = axios.create({
      timeout: config.server.timeoutMs
    });
  }

  /**
   * Forward a request to a backend service
   * @param {Object} req - Express request object
   * @returns {Promise<Object>} Response data
   */
  async forwardRequest(req) {
    let attempts = 0;
    let lastError = null;

    while (attempts < this.config.server.maxRetries) {
      const endpoint = this.loadBalancer.getNextEndpoint();
      if (!endpoint) {
        throw new Error('No endpoints available to process request');
      }

      // Preserve the original path
      const targetUrl = `${endpoint}${req.originalUrl}`;
      attempts++;

      this.logger.info(`Forwarding ${req.method} request to ${targetUrl} (attempt ${attempts}/${this.config.server.maxRetries})`);

      try {
        const startTime = Date.now();

        // Forward request with original method, headers, query params, and body
        const response = await this.client({
          method: req.method,
          url: targetUrl,
          data: req.body,
          params: req.query,
          headers: this.prepareHeaders(req.headers, endpoint)
        });

        const responseTime = Date.now() - startTime;

        this.logger.info(`Request to ${targetUrl} successful (${responseTime}ms)`);
        this.loadBalancer.markEndpointSuccess(endpoint);
        this.loadBalancer.recordResponseTime(endpoint, responseTime);

        return {
          status: response.status,
          headers: response.headers,
          data: response.data
        };
      } catch (error) {
        this.handleRequestError(error, targetUrl, endpoint);
        lastError = error;

        // Check if we've reached max retries
        if (attempts >= this.config.server.maxRetries) {
          break;
        }
      }
    }

    // If we get here, all retries failed
    throw new Error(`Failed to process request after ${this.config.server.maxRetries} attempts: ${lastError?.message || 'Unknown error'}`);
  }

  /**
   * Handle request errors
   * @private
   */
  handleRequestError(error, targetUrl, endpoint) {
    if (error.code === 'ECONNABORTED') {
      this.logger.error(`Request to ${targetUrl} timed out`);
    } else if (error.code === 'ECONNREFUSED') {
      this.logger.error(`Connection refused to ${targetUrl} - verify the service is running`);
    } else if (error.response) {
      this.logger.error(`Server error from ${targetUrl}: Status ${error.response.status}`);
    } else {
      this.logger.error(`Error on request to ${targetUrl}: ${error.message}`);
    }

    this.loadBalancer.markEndpointFailed(endpoint);
  }

  /**
   * Prepare headers for forwarding request
   * @private
   */
  prepareHeaders(originalHeaders, endpoint) {
    const headers = { ...originalHeaders };

    // Replace host header with target host
    if (endpoint) {
      try {
        headers.host = new URL(endpoint).host;
      } catch (error) {
        this.logger.warn(`Invalid endpoint URL: ${endpoint}`);
      }
    }

    // Remove headers that might cause issues
    delete headers['content-length'];

    return headers;
  }
}

module.exports = RequestForwarder;
