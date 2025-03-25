/**
 * Server entry point
 */
const http = require('http');
const createApp = require('./app');
const config = require('./config');

/**
 * Start the server
 */
function startServer() {
  // Create app and get logger
  const { app, logger } = createApp();

  // Get port from configuration
  const port = config.app.server.port;

  // Create HTTP server
  const server = http.createServer(app);

  // Start listening
  server.listen(port, () => {
    logger.info(`Server listening on port ${port}`);
    logger.info(`Load balancing requests to: ${config.app.endpoints.join(', ')}`);
  });

  // Handle graceful shutdown
  process.on('SIGTERM', () => gracefulShutdown(server, logger));
  process.on('SIGINT', () => gracefulShutdown(server, logger));

  return server;
}

/**
 * Gracefully shutdown the server
 */
function gracefulShutdown(server, logger) {
  logger.info('Shutting down server...');

  server.close(() => {
    logger.info('Server stopped');
    process.exit(0);
  });

  // Force shutdown after timeout
  setTimeout(() => {
    logger.error('Forced shutdown due to timeout');
    process.exit(1);
  }, 10000);
}

// Start server if this file is run directly
if (require.main === module) {
  startServer();
}

module.exports = { startServer };
