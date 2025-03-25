/**
 * Unit tests for Health Controller
 */
const createHealthController = require('../../../../src/api/controllers/health.controller');
const mockLogger = require('../../../mocks/logger.mock');
const mockConfig = require('../../../mocks/config.mock');
const { mockRequest, mockResponse } = require('../../../mocks/express.mock');

describe('Health Controller', () => {
  let healthController;
  let mockLoadBalancer;

  beforeEach(() => {
    // Reset mock logger
    mockLogger.mockReset();

    // Create mock load balancer
    mockLoadBalancer = {
      getEndpointHealth: jest.fn()
    };

    // Create health controller
    healthController = createHealthController(mockLoadBalancer, mockConfig.app, mockLogger);
  });

  test('should return health status with timestamp and endpoints', () => {
    // Mock endpoint health data
    const mockHealthData = {
      'http://localhost:8080': {
        url: 'http://localhost:8080',
        healthy: true,
        consecutiveFailures: 0,
        lastFailureTime: null,
        avgResponseTimeMs: 123.45
      },
      'http://localhost:8081': {
        url: 'http://localhost:8081',
        healthy: false,
        consecutiveFailures: 5,
        lastFailureTime: '2023-01-01T00:00:00.000Z',
        avgResponseTimeMs: 567.89
      }
    };

    mockLoadBalancer.getEndpointHealth.mockReturnValue(mockHealthData);

    // Create mock request and response
    const req = mockRequest();
    const res = mockResponse();

    // Call the getHealth method
    healthController.getHealth(req, res);

    // Check load balancer was called
    expect(mockLoadBalancer.getEndpointHealth).toHaveBeenCalled();

    // Check response
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      status: 'UP',
      timestamp: expect.any(String),
      endpoints: mockHealthData
    }));

    // Verify timestamp is a valid ISO date string
    const response = res.json.mock.calls[0][0];
    expect(() => new Date(response.timestamp)).not.toThrow();

    // Check debug log
    expect(mockLogger.debug).toHaveBeenCalledWith('Health check requested');
  });

  test('should handle empty endpoint list', () => {
    // Mock empty endpoint health data
    mockLoadBalancer.getEndpointHealth.mockReturnValue({});

    // Create mock request and response
    const req = mockRequest();
    const res = mockResponse();

    // Call the getHealth method
    healthController.getHealth(req, res);

    // Check response
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      status: 'UP',
      endpoints: {}
    }));
  });
});
