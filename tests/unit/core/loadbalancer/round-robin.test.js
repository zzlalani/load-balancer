/**
 * Unit tests for Round Robin Load Balancer
 */
const RoundRobinLoadBalancer = require('../../../../src/core/loadbalancer/round-robin');
const mockLogger = require('../../../mocks/logger.mock');
const mockConfig = require('../../../mocks/config.mock');

describe('RoundRobinLoadBalancer', () => {
  let loadBalancer;

  beforeEach(() => {
    // Reset mock logger
    mockLogger.mockReset();

    // Create a new load balancer instance for each test
    loadBalancer = new RoundRobinLoadBalancer(mockConfig.app, mockLogger);
  });

  test('should initialize with the configured endpoints', () => {
    expect(loadBalancer.endpoints).toEqual(mockConfig.app.endpoints);
    expect(loadBalancer.currentIndex).toBe(0);
    expect(mockLogger.info).toHaveBeenCalledWith(expect.stringContaining('initialized with 3 endpoints'));
  });

  test('getNextEndpoint should return endpoints in round-robin order', () => {
    expect(loadBalancer.getNextEndpoint()).toBe('http://localhost:8080');
    expect(loadBalancer.getNextEndpoint()).toBe('http://localhost:8081');
    expect(loadBalancer.getNextEndpoint()).toBe('http://localhost:8082');
    // Should wrap around back to the first endpoint
    expect(loadBalancer.getNextEndpoint()).toBe('http://localhost:8080');
  });

  test('should return null if no endpoints are configured', () => {
    // Create a load balancer with no endpoints
    const emptyConfig = JSON.parse(JSON.stringify(mockConfig.app));
    emptyConfig.endpoints = [];
    const emptyLoadBalancer = new RoundRobinLoadBalancer(emptyConfig, mockLogger);

    expect(emptyLoadBalancer.getNextEndpoint()).toBeNull();
    expect(mockLogger.warn).toHaveBeenCalledWith(expect.stringContaining('No endpoints configured'));
  });

  test('should mark endpoints as failed and skip them', () => {
    // Mark the first endpoint as failed multiple times to exceed the threshold
    for (let i = 0; i < mockConfig.app.healthCheck.failThreshold; i++) {
      loadBalancer.markEndpointFailed('http://localhost:8080');
    }

    // The first endpoint should be skipped
    expect(loadBalancer.getNextEndpoint()).toBe('http://localhost:8081');
    expect(loadBalancer.getNextEndpoint()).toBe('http://localhost:8082');
    expect(loadBalancer.getNextEndpoint()).toBe('http://localhost:8081');

    // Verify warning was logged
    expect(mockLogger.warn).toHaveBeenCalledWith(expect.stringContaining('Skipping unhealthy endpoint'));
  });

  test('should reset failure count when endpoint succeeds', () => {
    // Mark endpoint as failed twice
    loadBalancer.markEndpointFailed('http://localhost:8080');
    loadBalancer.markEndpointFailed('http://localhost:8080');

    // Get health data to check failure count
    const healthData = loadBalancer.getEndpointHealth();
    expect(healthData['http://localhost:8080'].consecutiveFailures).toBe(2);

    // Mark endpoint as successful
    loadBalancer.markEndpointSuccess('http://localhost:8080');

    // Check failure count is reset
    const updatedHealthData = loadBalancer.getEndpointHealth();
    expect(updatedHealthData['http://localhost:8080'].consecutiveFailures).toBe(0);
  });

  test('should record and track response times', () => {
    // Record a response time
    loadBalancer.recordResponseTime('http://localhost:8080', 150);

    // Get health data and check response time
    const healthData = loadBalancer.getEndpointHealth();
    expect(healthData['http://localhost:8080'].avgResponseTimeMs).toBe(150);

    // Record another response time
    loadBalancer.recordResponseTime('http://localhost:8080', 250);

    // Get health data and check the average response time has been updated
    const updatedHealthData = loadBalancer.getEndpointHealth();
    expect(updatedHealthData['http://localhost:8080'].avgResponseTimeMs).toBeGreaterThan(150);
    expect(updatedHealthData['http://localhost:8080'].avgResponseTimeMs).toBeLessThan(250);
  });

  test('should get health data for all endpoints', () => {
    const healthData = loadBalancer.getEndpointHealth();

    expect(healthData).toHaveProperty('http://localhost:8080');
    expect(healthData).toHaveProperty('http://localhost:8081');
    expect(healthData).toHaveProperty('http://localhost:8082');

    expect(healthData['http://localhost:8080']).toHaveProperty('healthy', true);
    expect(healthData['http://localhost:8080']).toHaveProperty('consecutiveFailures', 0);
    expect(healthData['http://localhost:8080']).toHaveProperty('avgResponseTimeMs');
  });

  test('should return an unhealthy endpoint as last resort if all are unhealthy', () => {
    // Mark all endpoints as failed
    mockConfig.app.endpoints.forEach(endpoint => {
      for (let i = 0; i < mockConfig.app.healthCheck.failThreshold; i++) {
        loadBalancer.markEndpointFailed(endpoint);
      }
    });

    // Should still return an endpoint as last resort
    expect(loadBalancer.getNextEndpoint()).toBe('http://localhost:8080');
    expect(mockLogger.warn).toHaveBeenCalledWith(expect.stringContaining('All endpoints are unhealthy'));
  });

  // Additional tests for performance-based load balancing
  test('should use round-robin when no response time data exists', () => {
    // Spy on the round robin method
    const roundRobinSpy = jest.spyOn(loadBalancer, 'getEndpointRoundRobin');

    // Get next endpoint
    loadBalancer.getNextEndpoint(true);

    // Should use round robin since no response time data yet
    expect(roundRobinSpy).toHaveBeenCalled();
  });

  test('should prioritize faster endpoints when response time data exists', () => {
    // Mock different response times for each endpoint
    loadBalancer.recordResponseTime('http://localhost:8080', 300); // Slowest
    loadBalancer.recordResponseTime('http://localhost:8081', 50);  // Fastest
    loadBalancer.recordResponseTime('http://localhost:8082', 150); // Medium

    // Sample a large number of endpoint selections
    const selectedEndpoints = {
      'http://localhost:8080': 0,
      'http://localhost:8081': 0,
      'http://localhost:8082': 0
    };

    // Run multiple selections to get a statistically significant sample
    for (let i = 0; i < 1000; i++) {
      const endpoint = loadBalancer.getNextEndpoint(true);
      selectedEndpoints[endpoint]++;
    }

    // The fastest endpoint should be selected more often than the slowest
    expect(selectedEndpoints['http://localhost:8081']).toBeGreaterThan(selectedEndpoints['http://localhost:8080']);
    expect(selectedEndpoints['http://localhost:8081']).toBeGreaterThan(selectedEndpoints['http://localhost:8082']);
  });

  test('should use round robin if all endpoints are unhealthy', () => {
    // Mark all endpoints as failed
    for (const endpoint of mockConfig.app.endpoints) {
      for (let i = 0; i < mockConfig.app.healthCheck.failThreshold; i++) {
        loadBalancer.markEndpointFailed(endpoint);
      }
    }

    // Add response time data
    loadBalancer.recordResponseTime('http://localhost:8080', 100);
    loadBalancer.recordResponseTime('http://localhost:8081', 200);
    loadBalancer.recordResponseTime('http://localhost:8082', 300);

    // Get next endpoint - should fall back to last resort logic
    const endpoint = loadBalancer.getNextEndpoint(true);

    // Should be the first endpoint (as per the last resort logic)
    expect(endpoint).toBe('http://localhost:8080');
    expect(mockLogger.warn).toHaveBeenCalledWith(expect.stringContaining('All endpoints are unhealthy'));
  });

});
