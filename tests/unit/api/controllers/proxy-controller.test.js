/**
 * Unit tests for Proxy Controller
 */
const createProxyController = require('../../../../src/api/controllers/proxy.controller');
const mockLogger = require('../../../mocks/logger.mock');
const { mockRequest, mockResponse } = require('../../../mocks/express.mock');

describe('Proxy Controller', () => {
  let proxyController;
  let mockRequestForwarder;

  beforeEach(() => {
    // Reset mock logger
    mockLogger.mockReset();

    // Create mock request forwarder
    mockRequestForwarder = {
      forwardRequest: jest.fn()
    };

    // Create proxy controller
    proxyController = createProxyController(mockRequestForwarder, mockLogger);
  });

  test('should forward requests and return responses', async () => {
    // Mock successful request forwarding
    mockRequestForwarder.forwardRequest.mockResolvedValue({
      status: 200,
      headers: { 'content-type': 'application/json' },
      data: { success: true, message: 'Test success' }
    });

    // Create mock request and response
    const req = mockRequest({
      method: 'POST',
      originalUrl: '/api/example',
      body: { data: 'test' }
    });
    const res = mockResponse();

    // Call the handleRequest method
    await proxyController.handleRequest(req, res);

    // Check request was forwarded
    expect(mockRequestForwarder.forwardRequest).toHaveBeenCalledWith(req);

    // Check response headers were set
    expect(res.set).toHaveBeenCalledWith('content-type', 'application/json');

    // Check response status and body
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.send).toHaveBeenCalledWith({ success: true, message: 'Test success' });

    // Check log message
    expect(mockLogger.info).toHaveBeenCalledWith(expect.stringContaining('Received POST request'));
    expect(mockLogger.info).toHaveBeenCalledWith(expect.stringContaining('Request completed'));
  });

  test('should handle errors from request forwarder', async () => {
    // Mock failed request forwarding
    const error = new Error('Test error');
    error.response = { status: 503 };
    mockRequestForwarder.forwardRequest.mockRejectedValue(error);

    // Create mock request and response
    const req = mockRequest({
      method: 'GET',
      originalUrl: '/api/example'
    });
    const res = mockResponse();

    // Call the handleRequest method
    await proxyController.handleRequest(req, res);

    // Check request was forwarded
    expect(mockRequestForwarder.forwardRequest).toHaveBeenCalledWith(req);

    // Check error response
    expect(res.status).toHaveBeenCalledWith(503);
    expect(res.json).toHaveBeenCalledWith({
      error: 'Failed to process request',
      message: 'Test error'
    });

    // Check log message
    expect(mockLogger.error).toHaveBeenCalledWith(expect.stringContaining('Request failed: Test error'));
  });

  test('should use default status code for errors without response status', async () => {
    // Mock failed request forwarding with no response status
    mockRequestForwarder.forwardRequest.mockRejectedValue(new Error('Connection error'));

    // Create mock request and response
    const req = mockRequest();
    const res = mockResponse();

    // Call the handleRequest method
    await proxyController.handleRequest(req, res);

    // Check default status code (500 Internal Server Error)
    expect(res.status).toHaveBeenCalledWith(500);
  });

  test('should measure request duration', async () => {
    // Mock successful request forwarding with delay
    mockRequestForwarder.forwardRequest.mockImplementation(() => {
      return new Promise(resolve => {
        setTimeout(() => {
          resolve({
            status: 200,
            headers: {},
            data: {}
          });
        }, 50); // Small delay to ensure duration > 0
      });
    });

    // Create mock request and response
    const req = mockRequest();
    const res = mockResponse();

    // Call the handleRequest method
    await proxyController.handleRequest(req, res);

    // Check duration was logged
    const infoCall = mockLogger.info.mock.calls.find(call =>
      call[0].includes('Request completed in')
    );

    expect(infoCall).toBeDefined();

    // Extract duration from log message
    const durationMatch = infoCall[0].match(/completed in (\d+)ms/);
    const duration = durationMatch ? parseInt(durationMatch[1], 10) : 0;

    // Duration should be > 0 because of the delay
    expect(duration).toBeGreaterThan(0);
  });

  test('should handle headers that might cause issues', async () => {
    // Mock successful request forwarding with problematic headers
    mockRequestForwarder.forwardRequest.mockResolvedValue({
      status: 200,
      headers: {
        'content-type': 'application/json',
        'transfer-encoding': 'chunked',
        'connection': 'keep-alive'
      },
      data: {}
    });

    // Create mock request and response
    const req = mockRequest();
    const res = mockResponse();

    // Call the handleRequest method
    await proxyController.handleRequest(req, res);

    // Problematic headers should be skipped
    expect(res.set).toHaveBeenCalledWith('content-type', 'application/json');
    expect(res.set).not.toHaveBeenCalledWith('transfer-encoding', expect.any(String));
    expect(res.set).not.toHaveBeenCalledWith('connection', expect.any(String));
  });
});
