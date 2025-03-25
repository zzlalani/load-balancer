/**
 * Application setup
 */
const express = require('express');
const cors = require('cors');
const winston = require('winston');
const morgan = require('morgan');
const config = require('./config');
const RoundRobinLoadBalancer = require('./core/loadbalancer/round-robin');
const RequestForwarder = require('./core/forwarder/request-forwarder');
const createProxyController = require('./api/controllers/proxy.controller');
const createHealthController = require('./api/controllers/health.controller');
const createRoutes = require('./api/routes');

/**
 * Create and configure Express application
 */
function createApp() {
  // Initialize logger
  const logger = winston.createLogger({
    level: process.env.LOG_LEVEL || 'info',
    format: winston.format.combine(
      winston.format.timestamp(),
      winston.format.printf(({ level, message, timestamp, ...meta }) => {
        let msg = `${timestamp} [${level}]: ${message}`;
        if (Object.keys(meta).length > 0) {
          msg += ` ${JSON.stringify(meta)}`;
        }
        return msg;
      })
    ),
    transports: [
      new winston.transports.Console({
        format: winston.format.combine(
          winston.format.colorize(),
          winston.format.timestamp(),
          winston.format.printf(({ level, message, timestamp, ...meta }) => {
            let msg = `${timestamp} [${level}]: ${message}`;
            if (Object.keys(meta).length > 0) {
              msg += ` ${JSON.stringify(meta)}`;
            }
            return msg;
          })
        )
      }),
      new winston.transports.File({ filename: 'logs/error.log', level: 'error' }),
      new winston.transports.File({ filename: 'logs/combined.log' })
    ]
  });

  // Initialize load balancer
  const loadBalancer = new RoundRobinLoadBalancer(config.app, logger);

  // Initialize request forwarder
  const requestForwarder = new RequestForwarder(loadBalancer, config.app, logger);

  // Initialize controllers
  const controllers = {
    proxy: createProxyController(requestForwarder, logger),
    health: createHealthController(loadBalancer, config.app, logger)
  };

  // Create Express app
  const app = express();

  // Apply middleware
  app.use(cors());
  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ extended: true }));
  app.use(morgan('combined', { stream: { write: msg => logger.http(msg.trim()) } }));

  // Mount routes
  app.use('/', createRoutes(controllers));

  // Add error handler
  app.use((err, req, res, next) => {
    logger.error(`Unhandled error: ${err.message}`, { stack: err.stack });
    res.status(500).json({
      error: 'Internal server error',
      message: err.message
    });
  });

  return { app, logger };
}

module.exports = createApp;
