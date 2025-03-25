/**
 * Routes index
 */
const express = require('express');
const createProxyRoutes = require('./proxy.routes');
const createHealthRoutes = require('./health.routes');

/**
 * Create all routes
 * @param {Object} controllers - Controllers object
 */
function createRoutes(controllers) {
  const router = express.Router();

  // Mount health routes first so they don't get caught by the proxy
  router.use('/health', createHealthRoutes(controllers));

  // Mount proxy routes to handle everything else
  router.use('/api', createProxyRoutes(controllers));

  return router;
}

module.exports = createRoutes;
