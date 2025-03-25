/**
 * Proxy routes
 * Forwards all requests to backend instances
 */
const express = require('express');

/**
 * Create proxy routes
 * @param {Object} controllers - Controllers object
 */
function createProxyRoutes(controllers) {
  const router = express.Router();

  // Forward all routes and methods to the proxy controller
  router.all('*', controllers.proxy.handleRequest);

  return router;
}

module.exports = createProxyRoutes;
