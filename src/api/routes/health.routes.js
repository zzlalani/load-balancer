/**
 * Health routes
 */
const express = require('express');

/**
 * Create health routes
 * @param {Object} controllers - Controllers object
 */
function createHealthRoutes(controllers) {
  const router = express.Router();

  // GET /health - Get health status
  router.get('/', controllers.health.getHealth);

  return router;
}

module.exports = createHealthRoutes;
