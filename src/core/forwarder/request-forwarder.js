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

    const MB1 = 1000000;

    // Create axios instance with default settings
    this.client = axios.create({
      timeout: config.server.timeoutMs,
      maxBodyLength: MB1,
      maxContentLength: MB1,
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
      const endpoint = this.loadBalancer.getNextEndpoint(this.config.performanceBasedRouting);
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
          headers: this.prepareHeaders(req.headers, endpoint),
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
        const shouldRetry = this.handleRequestError(error, targetUrl, endpoint);
        lastError = error

        // Only continue retry loop if the error is retryable
        if (!shouldRetry && error.response) {
          // If it's a client error (not server's fault), return it directly
          this.logger.info(`Client error (${error.response.status}) on ${targetUrl} - returning directly`);
          return {
            status: error.response.status,
            headers: error.response.headers || {},
            data: error.response.data || { error: error.message }
          };
        }

        // Check if we've reached max retries
        if (attempts >= this.config.server.maxRetries) {
          break;
        }

        // Apply exponential backoff for retries after first attempt
        await this.delayedRetry(attempts);
      }
    }

    // If we get here, all retries failed
    throw new Error(`Failed to process request after ${this.config.server.maxRetries} attempts: ${lastError?.message || 'Unknown error'}`);
  }

  /**
   * Delay before retrying a failed request
   * @param attempts
   * @returns {Promise<void>}
   */
  async delayedRetry(attempts) {
    if (attempts > 1 && attempts < this.config.server.maxRetries) {
      const backoffTime = this.calculateBackoffTime(attempts);
      await new Promise(resolve => setTimeout(resolve, backoffTime));
      this.logger.info(`Retrying after ${backoffTime}ms backoff...`);
    }
  }

  /**
   * Calculate backoff time for retrying failed requests
   * @private
   * @param attempt
   * @returns {number}
   */
  calculateBackoffTime(attempt) {
    // Base delay: 100ms * 2^attempt with maximum of 2 seconds
    const baseDelay = Math.min(100 * Math.pow(2, attempt), 2000);
    // Add random jitter (0-100ms) to prevent thundering herd
    const jitter = Math.random() * 100;
    return baseDelay + jitter;
  }

  /**
   * Handle request errors
   * @private
   * @param {Error} error - Error object
   * @param {string} targetUrl - Target URL
   * @param {string} endpoint - Endpoint URL
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

    // Determine if the error is retryable
    const isRetryable = this.isRetryableError(error);

    if (isRetryable) {
      this.loadBalancer.markEndpointFailed(endpoint);
      return true; // Signal that retrying is appropriate
    } else {
      // Don't mark endpoint as failed for client errors
      return false; // Signal that retrying would be futile
    }
  }

  /**
   * Check if an error is retryable
   * @param error
   * @returns {boolean}
   */
  isRetryableError(error) {
    // Connection errors are always retryable
    if (['ECONNREFUSED', 'ECONNABORTED', 'ECONNRESET', 'ETIMEDOUT'].includes(error.code)) {
      return true;
    }

    // Check HTTP status codes if response exists
    if (error.response) {
      const status = error.response.status;

      // Server errors (5xx) are generally retryable
      if (status >= 500 && status < 600) {
        return true;
      }

      // 429 Too Many Requests can be retried
      if (status === 429) {
        return true;
      }

      // Client errors (4xx) are generally not retryable
      // except specific cases like 408 Request Timeout
      if (status === 408) {
        return true;
      }

      // What about 404 Not Found?

      // Client errors (4xx) are generally not retryable
      // except the specific cases above
      return false;
    }

    // Network errors without response are generally retryable
    return true;
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
