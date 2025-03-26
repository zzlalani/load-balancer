/**
 * Unit tests for Request Forwarder
 */
const axios = require('axios');
const MockAdapter = require('axios-mock-adapter');
const RequestForwarder = require('../../../../src/core/forwarder/request-forwarder');
const mockLogger = require('../../../mocks/logger.mock');
const mockConfig = require('../../../mocks/config.mock');
const { mockRequest } = require('../../../mocks/express.mock');

// Mock the axios module
const mockAxios = new MockAdapter(axios);

describe('RequestForwarder', () => {
  let requestForwarder;
  let mockLoadBalancer;

  beforeEach(() => {
    // Reset mock logger
    mockLogger.mockReset();

    // Reset mock axios
    mockAxios.reset();

    // Create mock load balancer
    mockLoadBalancer = {
      getNextEndpoint: jest.fn(),
      markEndpointSuccess: jest.fn(),
      markEndpointFailed: jest.fn(),
      recordResponseTime: jest.fn()
    };

    // Create a new request forwarder instance for each test
    requestForwarder = new RequestForwarder(mockLoadBalancer, mockConfig.app, mockLogger);
  });

  test('should forward request to the endpoint returned by load balancer', async () => {
    // Mock load balancer to return a specific endpoint
    mockLoadBalancer.getNextEndpoint.mockReturnValue('http://localhost:8080');

    // Mock successful axios response
    mockAxios.onPost('http://localhost:8080/api/example').reply(200, { success: true });

    // Create mock Express request
    const req = mockRequest({
      method: 'POST',
      originalUrl: '/api/example',
      body: { data: 'test' },
      headers: { 'content-type': 'application/json' }
    });

    // Forward the request
    const response = await requestForwarder.forwardRequest(req);

    // Check that the load balancer was used to get an endpoint
    expect(mockLoadBalancer.getNextEndpoint).toHaveBeenCalled();

    // Check that the request was forwarded correctly
    expect(response).toEqual(expect.objectContaining({
      status: 200,
      data: { success: true }
    }));

    // Check that the endpoint was marked as successful
    expect(mockLoadBalancer.markEndpointSuccess).toHaveBeenCalledWith('http://localhost:8080');

    // Check that the response time was recorded
    expect(mockLoadBalancer.recordResponseTime).toHaveBeenCalledWith(
      'http://localhost:8080',
      expect.any(Number)
    );

    // Check that the result was logged
    expect(mockLogger.info).toHaveBeenCalledWith(
      expect.stringContaining('Request to http://localhost:8080/api/example successful')
    );
  });

  test('should retry on server error (5xx)', async () => {
    // Mock load balancer to return different endpoints
    mockLoadBalancer.getNextEndpoint
      .mockReturnValueOnce('http://localhost:8080')
      .mockReturnValueOnce('http://localhost:8081');

    // Mock failed axios response with 500 for first endpoint
    mockAxios.onGet('http://localhost:8080/api/example').reply(500, { error: 'Server error' });

    // Mock successful axios response for second endpoint
    mockAxios.onGet('http://localhost:8081/api/example').reply(200, { success: true });

    // Create mock Express request
    const req = mockRequest({
      method: 'GET',
      originalUrl: '/api/example',
      headers: {}
    });

    // Forward the request
    const response = await requestForwarder.forwardRequest(req);

    // Check that the load balancer was used to get endpoints
    expect(mockLoadBalancer.getNextEndpoint).toHaveBeenCalledTimes(2);

    // Check that the first endpoint was marked as failed
    expect(mockLoadBalancer.markEndpointFailed).toHaveBeenCalledWith('http://localhost:8080');

    // Check that the second endpoint was marked as successful
    expect(mockLoadBalancer.markEndpointSuccess).toHaveBeenCalledWith('http://localhost:8081');

    // Check that the response was from the second endpoint
    expect(response).toEqual(expect.objectContaining({
      status: 200,
      data: { success: true }
    }));
  });

  test('should not retry on client error (4xx)', async () => {
    // Mock load balancer to return endpoints
    mockLoadBalancer.getNextEndpoint.mockReturnValue('http://localhost:8080');

    // Mock failed axios response with 404 client error
    mockAxios.onGet('http://localhost:8080/api/example').reply(404, { error: 'Not found' });

    // Create mock Express request
    const req = mockRequest({
      method: 'GET',
      originalUrl: '/api/example',
      headers: {}
    });

    // Forward the request (should return the 404 error directly)
    const response = await requestForwarder.forwardRequest(req);

    // Check that the load balancer was used to get endpoint only once
    expect(mockLoadBalancer.getNextEndpoint).toHaveBeenCalledTimes(1);

    // Check that the endpoint was NOT marked as failed (client errors don't indicate endpoint failure)
    expect(mockLoadBalancer.markEndpointFailed).not.toHaveBeenCalled();

    // Check that the response has the 404 status
    expect(response).toEqual(expect.objectContaining({
      status: 404,
      data: { error: 'Not found' }
    }));
  });

  test('should retry on failure', async () => {
    // Mock load balancer to return different endpoints
    mockLoadBalancer.getNextEndpoint
      .mockReturnValueOnce('http://localhost:8080')
      .mockReturnValueOnce('http://localhost:8081');

    // Mock failed axios response for first endpoint
    mockAxios.onGet('http://localhost:8080/api/example').reply(500, { error: 'Server error' });

    // Mock successful axios response for second endpoint
    mockAxios.onGet('http://localhost:8081/api/example').reply(200, { success: true });

    // Create mock Express request
    const req = mockRequest({
      method: 'GET',
      originalUrl: '/api/example',
      headers: {}
    });

    // Forward the request
    const response = await requestForwarder.forwardRequest(req);

    // Check that the load balancer was used to get endpoints
    expect(mockLoadBalancer.getNextEndpoint).toHaveBeenCalledTimes(2);

    // Check that the first endpoint was marked as failed
    expect(mockLoadBalancer.markEndpointFailed).toHaveBeenCalledWith('http://localhost:8080');

    // Check that the second endpoint was marked as successful
    expect(mockLoadBalancer.markEndpointSuccess).toHaveBeenCalledWith('http://localhost:8081');

    // Check that the response was from the second endpoint
    expect(response).toEqual(expect.objectContaining({
      status: 200,
      data: { success: true }
    }));
  });

  test('should throw error when all retries fail', async () => {
    // Mock load balancer to return endpoints
    mockLoadBalancer.getNextEndpoint
      .mockReturnValueOnce('http://localhost:8080')
      .mockReturnValueOnce('http://localhost:8081')
      .mockReturnValueOnce('http://localhost:8082');

    // Mock failed axios responses for all endpoints
    mockAxios.onGet('http://localhost:8080/api/example').reply(500, { error: 'Server error' });
    mockAxios.onGet('http://localhost:8081/api/example').reply(500, { error: 'Server error' });
    mockAxios.onGet('http://localhost:8082/api/example').reply(500, { error: 'Server error' });

    // Create mock Express request
    const req = mockRequest({
      method: 'GET',
      originalUrl: '/api/example',
      headers: {}
    });

    // Forward the request (should throw)
    await expect(requestForwarder.forwardRequest(req)).rejects.toThrow(
      'Failed to process request after 3 attempts'
    );

    // Check that the load balancer was used to get endpoints for all retries
    expect(mockLoadBalancer.getNextEndpoint).toHaveBeenCalledTimes(3);

    // Check that all endpoints were marked as failed
    expect(mockLoadBalancer.markEndpointFailed).toHaveBeenCalledTimes(3);
    expect(mockLoadBalancer.markEndpointFailed).toHaveBeenCalledWith('http://localhost:8080');
    expect(mockLoadBalancer.markEndpointFailed).toHaveBeenCalledWith('http://localhost:8081');
    expect(mockLoadBalancer.markEndpointFailed).toHaveBeenCalledWith('http://localhost:8082');
  });

  test('should handle connection errors', async () => {
    // Mock load balancer to return a specific endpoint
    mockLoadBalancer.getNextEndpoint.mockReturnValue('http://localhost:8080');

    // Mock a network error
    mockAxios.onGet('http://localhost:8080/api/example').networkError();

    // Create mock Express request
    const req = mockRequest({
      method: 'GET',
      originalUrl: '/api/example',
      headers: {}
    });

    // Forward the request (should throw)
    await expect(requestForwarder.forwardRequest(req)).rejects.toThrow();

    // Check that the endpoint was marked as failed
    expect(mockLoadBalancer.markEndpointFailed).toHaveBeenCalledWith('http://localhost:8080');

    // Check that the error was logged
    expect(mockLogger.error).toHaveBeenCalled();
  });

  test('should throw error when no endpoints are available', async () => {
    // Mock load balancer to return null (no endpoints available)
    mockLoadBalancer.getNextEndpoint.mockReturnValue(null);

    // Create mock Express request
    const req = mockRequest({
      method: 'GET',
      originalUrl: '/api/example',
      headers: {}
    });

    // Forward the request (should throw)
    await expect(requestForwarder.forwardRequest(req)).rejects.toThrow(
      'No endpoints available to process request'
    );
  });

  test('should prepare headers correctly', () => {
    // This test accesses a private method directly
    const originalHeaders = {
      'host': 'original-host.com',
      'content-type': 'application/json',
      'content-length': '123',
      'user-agent': 'test-agent'
    };

    const endpoint = 'http://new-host.com';

    // Use the private method via the instance
    const result = requestForwarder.prepareHeaders(originalHeaders, endpoint);

    // Check that host was changed to match the endpoint
    expect(result.host).toBe('new-host.com');

    // Check that content-length was removed
    expect(result['content-length']).toBeUndefined();

    // Check that other headers were preserved
    expect(result['content-type']).toBe('application/json');
    expect(result['user-agent']).toBe('test-agent');
  });
});
