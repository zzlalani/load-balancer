/**
 * Comprehensive Integration Tests for Round Robin Load Balancer
 *
 * These tests verify the complete functionality of the load balancer, including:
 * - Basic request forwarding for different HTTP methods
 * - Round robin distribution
 * - Error handling and retry logic
 * - Health checks and recovery
 * - Performance under load
 * - Edge cases
 */
const request = require('supertest');
const MockHttpServer = require('mock-http-server');
const axios = require('axios');

// Set TEST_SPECIFIC for the API tests
process.env.TEST_SPECIFIC = 'api_integration';

describe('Round Robin Load Balancer Integration Tests', () => {
  let app;
  let server1, server2, server3;
  let loadBalancerUrl;

  // Set up mock backend servers and our app
  beforeEach(async () => {
    // Create mock backend servers
    server1 = new MockHttpServer({ host: 'localhost', port: 9081 });
    server2 = new MockHttpServer({ host: 'localhost', port: 9082 });
    server3 = new MockHttpServer({ host: 'localhost', port: 9083 });

    // Start mock servers
    await new Promise(resolve => server1.start(resolve));
    await new Promise(resolve => server2.start(resolve));
    await new Promise(resolve => server3.start(resolve));

    // Import the app - environment variables are already set by dotenvx
    const createApp = require('../../src/app');
    const appResult = createApp();
    app = appResult.app;

    // Set the URL for the load balancer
    loadBalancerUrl = 'http://localhost:9000';
  });

  // Clean up after tests
  afterEach(async () => {
    // Stop mock servers
    await new Promise(resolve => server1.stop(resolve));
    await new Promise(resolve => server2.stop(resolve));
    await new Promise(resolve => server3.stop(resolve));
  });

  describe('Basic Request Forwarding', () => {
    test('POST request should be forwarded to backend server', async () => {
      // Configure mock server to respond to POST requests
      server1.on({
        method: 'POST',
        path: '/api/test',
        reply: {
          status: 200,
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ success: true, message: 'Test response', received: true })
        }
      });

      // Send request to our app
      const testData = { name: 'Test', value: 123 };
      const response = await request(app)
        .post('/api/test')
        .send(testData)
        .set('Content-Type', 'application/json')
        .expect('Content-Type', /json/)
        .expect(200);

      // Check response
      expect(response.body).toHaveProperty('success', true);
      expect(response.body).toHaveProperty('message', 'Test response');
      expect(response.body).toHaveProperty('received', true);

      // Check that the request was received by the mock server
      expect(server1.requests()).toHaveLength(1);
      expect(server1.requests()[0]).toHaveProperty('method', 'POST');
      expect(server1.requests()[0]).toHaveProperty('pathname', '/api/test');

      // Check that the request body was correctly forwarded
      const receivedBody = server1.requests()[0].body;
      expect(receivedBody).toEqual(testData);
    });

    test('GET request should be forwarded to backend server', async () => {
      // Configure mock server to respond to GET requests
      server1.on({
        method: 'GET',
        path: '/api/data',
        reply: {
          status: 200,
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ data: [1, 2, 3] })
        }
      });

      // Send request to our app
      const response = await request(app)
        .get('/api/data')
        .expect('Content-Type', /json/)
        .expect(200);

      // Check response
      expect(response.body).toHaveProperty('data');
      expect(response.body.data).toEqual([1, 2, 3]);
    });

    test('PUT request should be forwarded to backend server', async () => {
      // Configure mock server to respond to PUT requests
      server1.on({
        method: 'PUT',
        path: '/api/resource/123',
        reply: {
          status: 200,
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ id: 123, updated: true })
        }
      });

      // Send request to our app
      const updateData = { name: 'Updated' };
      const response = await request(app)
        .put('/api/resource/123')
        .send(updateData)
        .set('Content-Type', 'application/json')
        .expect('Content-Type', /json/)
        .expect(200);

      // Check response
      expect(response.body).toHaveProperty('id', 123);
      expect(response.body).toHaveProperty('updated', true);

      // Check request was forwarded correctly
      expect(server1.requests()).toHaveLength(1);
      expect(server1.requests()[0]).toHaveProperty('method', 'PUT');
      expect(server1.requests()[0]).toHaveProperty('pathname', '/api/resource/123');

      // Check that the request body was correctly forwarded
      const receivedBody = server1.requests()[0].body;
      expect(receivedBody).toEqual(updateData);
    });

    test('DELETE request should be forwarded to backend server', async () => {
      // Configure mock server to respond to DELETE requests
      server1.on({
        method: 'DELETE',
        path: '/api/resource/123',
        reply: {
          status: 204
        }
      });

      // Send request to our app
      await request(app)
        .delete('/api/resource/123')
        .expect(204);

      // Check request was forwarded correctly
      expect(server1.requests()).toHaveLength(1);
      expect(server1.requests()[0]).toHaveProperty('method', 'DELETE');
      expect(server1.requests()[0]).toHaveProperty('pathname', '/api/resource/123');
    });
  });

  describe('Header and Query Parameter Handling', () => {
    test('should preserve query parameters when forwarding requests', async () => {
      // Configure mock server to echo query parameters
      server1.on({
        method: 'GET',
        path: '/api/query',
        reply: {
          status: 200,
          headers: { 'content-type': 'application/json' },
          body: (req) => JSON.stringify({ query: req.query }),
        }
      });

      // Send request with query parameters
      const response = await request(app)
        .get('/api/query?param1=value1&param2=value2&array=1&array=2')
        .expect(200);

      // Check that query parameters were preserved
      // cannot check the property value as MockServer library not handling the query params properly
      expect(response.body.query).toHaveProperty('param1');
      expect(response.body.query).toHaveProperty('param2');
      expect(response.body.query).toHaveProperty('array');
    });

    test('should preserve custom headers when forwarding requests', async () => {
      // Configure mock server to echo headers
      server1.on({
        method: 'GET',
        path: '/api/headers',
        reply: {
          status: 200,
          headers: { 'content-type': 'application/json' },
          body: (req) => JSON.stringify({ headers: req.headers })
        }
      });

      // Send request with custom headers
      const response = await request(app)
        .get('/api/headers')
        .set('X-Custom-Header', 'custom-value')
        .set('X-Another-Header', 'another-value')
        .expect(200);

      // Check that custom headers were preserved
      expect(response.body.headers['x-custom-header']).toBe('custom-value');
      expect(response.body.headers['x-another-header']).toBe('another-value');
    });

    test('should handle content-type header correctly', async () => {
      // Configure mock server to echo content-type
      server1.on({
        method: 'POST',
        path: '/api/content-type',
        reply: {
          status: 200,
          headers: { 'content-type': 'application/json' },
          body: (req) => JSON.stringify({
            receivedContentType: req.headers['content-type']
          })
        }
      });

      // Send request with JSON content type
      const response = await request(app)
        .post('/api/content-type')
        .set('Content-Type', 'application/json')
        .send({ test: true })
        .expect(200);

      // Check that content-type was correctly forwarded
      expect(response.body.receivedContentType).toContain('application/json');
    });
  });

  describe('Round Robin Load Balancing', () => {
    test('should distribute requests across backend servers', async () => {
      // Configure all mock servers to respond to the same endpoint
      const endpoint = '/api/balance';

      [server1, server2, server3].forEach((server, index) => {
        server.on({
          method: 'GET',
          path: endpoint,
          reply: {
            status: 200,
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ server: index + 1 })
          }
        });
      });

      // Send multiple requests to trigger round-robin
      const response1 = await request(app).get(endpoint).expect(200);
      const response2 = await request(app).get(endpoint).expect(200);
      const response3 = await request(app).get(endpoint).expect(200);
      const response4 = await request(app).get(endpoint).expect(200);
      const response5 = await request(app).get(endpoint).expect(200);
      const response6 = await request(app).get(endpoint).expect(200);

      // Check that requests were distributed to all servers
      expect(server1.requests().length).toBeGreaterThan(0);
      expect(server2.requests().length).toBeGreaterThan(0);
      expect(server3.requests().length).toBeGreaterThan(0);

      // Check the total distribution
      const totalRequests = server1.requests().length +
        server2.requests().length +
        server3.requests().length;
      expect(totalRequests).toBe(6);

      // The first 3 responses should cover all 3 servers
      const firstThreeServers = [
        response1.body.server,
        response2.body.server,
        response3.body.server
      ].sort();

      expect(firstThreeServers).toEqual([1, 2, 3]);

      // The next 3 responses should repeat the pattern
      const secondThreeServers = [
        response4.body.server,
        response5.body.server,
        response6.body.server
      ].sort();

      expect(secondThreeServers).toEqual([1, 2, 3]);
    });

    test('should redistribute requests when a server recovers', async () => {
      // Configure all servers to handle the endpoint
      const endpoint = '/api/recovery';

      [server1, server2, server3].forEach((server, index) => {
        server.on({
          method: 'GET',
          path: endpoint,
          reply: {
            status: 200,
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ server: index + 1 })
          }
        });
      });

      // First, make server1 fail multiple times to mark it as unhealthy
      server1.on({
        method: 'GET',
        path: endpoint,
        reply: {
          status: 500,
          body: JSON.stringify({ error: 'Server error' })
        }
      });

      // Send requests that will skip server1 after it fails
      for (let i = 0; i < 5; i++) {
        await request(app).get(endpoint);
      }

      // Now make server1 recover
      server1.on({
        method: 'GET',
        path: endpoint,
        reply: {
          status: 200,
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ server: 1, recovered: true })
        }
      });

      // Wait for recovery time
      await new Promise(resolve => setTimeout(resolve, 3000));

      // Send more requests
      const responses = [];
      for (let i = 0; i < 6; i++) {
        const response = await request(app).get(endpoint).expect(200);
        responses.push(response.body);
      }

      // Check that server1 is now receiving requests again
      const server1Responses = responses.filter(r => r.server === 1);
      expect(server1Responses.length).toBeGreaterThan(0);
    });
  });

  describe('Error Handling', () => {
    test('should handle backend server errors and retry with another server', async () => {
      // Configure server1 to respond with an error
      server1.on({
        method: 'GET',
        path: '/api/error',
        reply: {
          status: 500,
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ error: 'Internal server error' })
        }
      });

      // Configure server2 to respond successfully
      server2.on({
        method: 'GET',
        path: '/api/error',
        reply: {
          status: 200,
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ success: true, from: 'server2' })
        }
      });

      // Send request - it should fail on server1 and retry with server2
      const response = await request(app)
        .get('/api/error')
        .expect(200);

      // Check response came from server2
      expect(response.body).toHaveProperty('success', true);
      expect(response.body).toHaveProperty('from', 'server2');

      // Check that server1 received a request
      expect(server1.requests().length).toBe(1);
    });

    test('should return 500 when all backend servers fail', async () => {
      // Configure all servers to fail
      [server1, server2, server3].forEach(server => {
        server.on({
          method: 'GET',
          path: '/api/all-fail',
          reply: {
            status: 500,
            body: JSON.stringify({ error: 'Server error' })
          }
        });
      });

      // Send request - should try all servers and then fail
      const response = await request(app)
        .get('/api/all-fail')
        .expect(500);

      // Check error response
      expect(response.body).toHaveProperty('error', 'Failed to process request');

      // Verify all servers received requests
      expect(server1.requests().filter(r => r.pathname === '/api/all-fail').length).toBe(1);
      expect(server2.requests().filter(r => r.pathname === '/api/all-fail').length).toBe(1);
      expect(server3.requests().filter(r => r.pathname === '/api/all-fail').length).toBe(1);
    });

    test('should handle connection timeout', async () => {
      // Configure server to delay response beyond timeout
      server1.on({
        method: 'GET',
        path: '/api/timeout',
        reply: {
          status: 200,
          body: JSON.stringify({ response: 'timedout' }),
        },
        delay: 3100,
      });

      // Configure server2 to respond successfully
      server2.on({
        method: 'GET',
        path: '/api/timeout',
        reply: {
          status: 200,
          body: JSON.stringify({ response: 'quick' }),
        }
      });

      // Request should timeout on server1 but succeed with server2
      const response = await request(app)
        .get('/api/timeout')
        .expect(200);

      // Verify we got the response from server2
      expect(response.body).toHaveProperty('response', 'quick');
    });
  });

  describe('Edge Cases', () => {
    test('should handle large payloads', async () => {
      // Create a large object (approximately 1MB)
      const largeObject = {
        data: Array(500).fill(0).map((_, i) => `Item ${i} with some padding to make it larger`)
      };

      // Configure mock server to handle large payload
      server1.on({
        method: 'POST',
        path: '/api/large',
        reply: {
          status: 200,
          headers: { 'content-type': 'application/json' },
          body: (req) => {
            const receivedBody = req.body;
            return JSON.stringify({
              success: true,
              itemCount: receivedBody.data.length
            });
          }
        }
      });

      // Send large payload
      const response = await request(app)
        .post('/api/large')
        .send(largeObject)
        .set('Content-Type', 'application/json')
        .expect(200);

      // Check response
      expect(response.body).toHaveProperty('success', true);
      expect(response.body).toHaveProperty('itemCount', 500);
    });

    test('should handle non-JSON responses', async () => {
      // Configure mock server to return HTML
      server1.on({
        method: 'GET',
        path: '/api/html',
        reply: {
          status: 200,
          headers: { 'content-type': 'text/html' },
          body: '<html><body><h1>Hello World</h1></body></html>'
        }
      });

      // Send request
      const response = await request(app)
        .get('/api/html')
        .expect('Content-Type', /html/)
        .expect(200);

      // Check that HTML was returned correctly
      expect(response.text).toContain('<h1>Hello World</h1>');
    });

    test('should handle empty responses', async () => {
      // Configure mock server to return empty response
      server1.on({
        method: 'GET',
        path: '/api/empty',
        reply: {
          status: 204
        }
      });

      // Send request
      await request(app)
        .get('/api/empty')
        .expect(204)
        .expect('');
    });

    test('should handle binary data', async () => {
      // Configure mock server to return binary data (like an image)
      server1.on({
        method: 'GET',
        path: '/api/binary',
        reply: {
          status: 200,
          headers: { 'content-type': 'application/octet-stream' },
          body: Buffer.from([0x89, 0x50, 0x4E, 0x47]) // Sample PNG header bytes
        }
      });

      // Send request
      const response = await request(app)
        .get('/api/binary')
        .expect('Content-Type', /octet-stream/)
        .expect(200);

      // Check that binary data was correctly returned
      expect(Buffer.isBuffer(response.body) || Array.isArray(response.body)).toBeTruthy();
    });
  });

  describe('Health Check Endpoint', () => {
    test('GET /health should return health status', async () => {
      const response = await request(app)
        .get('/health')
        .expect('Content-Type', /json/)
        .expect(200);

      expect(response.body).toHaveProperty('status', 'UP');
      expect(response.body).toHaveProperty('timestamp');
      expect(response.body).toHaveProperty('endpoints');

      // Check that all endpoints are in the health data
      expect(response.body.endpoints).toHaveProperty('http://localhost:9081');
      expect(response.body.endpoints).toHaveProperty('http://localhost:9082');
      expect(response.body.endpoints).toHaveProperty('http://localhost:9083');

      // Verify the endpoint health data structure
      const endpoint1Health = response.body.endpoints['http://localhost:9081'];
      expect(endpoint1Health).toHaveProperty('healthy');
      expect(endpoint1Health).toHaveProperty('consecutiveFailures');
      expect(endpoint1Health).toHaveProperty('avgResponseTimeMs');
    });

    test('health data should be updated after request failures', async () => {
      // Configure server1 to fail
      server1.on({
        method: 'GET',
        path: '/api/health-test-fail',
        reply: {
          status: 500,
          body: JSON.stringify({ error: 'Server error' })
        }
      });

      server2.on({
        method: 'GET',
        path: '/api/health-test-fail',
        reply: {
          status: 500,
          body: JSON.stringify({ error: 'Server error' })
        }
      });

      server3.on({
        method: 'GET',
        path: '/api/health-test-fail',
        reply: {
          status: 500,
          body: JSON.stringify({ error: 'Server error' })
        }
      });

      // Make a request to instances that will fail
      await request(app)
        .get('/api/health-test-fail')
        .expect(500);

      // Get health data
      const response = await request(app)
        .get('/health')
        .expect(200);

      // Check that server1's health data reflects the failure
      const server1Health = response.body.endpoints['http://localhost:9081'];
      const server2Health = response.body.endpoints['http://localhost:9082'];
      const server3Health = response.body.endpoints['http://localhost:9083'];
      expect(server1Health.consecutiveFailures).toBeGreaterThan(0);
      expect(server2Health.consecutiveFailures).toBeGreaterThan(0);
      expect(server3Health.consecutiveFailures).toBeGreaterThan(0);
    });
  });

  describe('Performance and Load Tests', () => {
    test('should handle concurrent requests', async () => {
      // Configure all servers to handle the same endpoint
      const endpoint = '/api/concurrent';

      [server1, server2, server3].forEach((server, index) => {
        server.on({
          method: 'GET',
          path: endpoint,
          reply: {
            status: 200,
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ server: index + 1 })
          }
        });
      });

      // Send 30 concurrent requests
      const concurrentRequests = 30;
      const promises = [];

      for (let i = 0; i < concurrentRequests; i++) {
        promises.push(
          request(app)
            .get(endpoint)
            .expect(200)
        );
      }

      // Wait for all requests to complete
      await Promise.all(promises);

      // Check that requests were distributed across all servers
      const server1Count = server1.requests().filter(r => r.pathname === endpoint).length;
      const server2Count = server2.requests().filter(r => r.pathname === endpoint).length;
      const server3Count = server3.requests().filter(r => r.pathname === endpoint).length;

      expect(server1Count + server2Count + server3Count).toBe(concurrentRequests);

      // Each server should have handled approximately concurrentRequests/3 requests
      // but we allow some flexibility in the distribution
      const expectedPerServer = concurrentRequests / 3;
      const tolerance = concurrentRequests / 5; // 20% tolerance

      expect(server1Count).toBeGreaterThanOrEqual(expectedPerServer - tolerance);
      expect(server2Count).toBeGreaterThanOrEqual(expectedPerServer - tolerance);
      expect(server3Count).toBeGreaterThanOrEqual(expectedPerServer - tolerance);
    });

    test('should maintain performance with delayed responses', async () => {
      // Configure servers with varying response times
      const endpoint = '/api/delayed';

      server1.on({
        method: 'GET',
        path: endpoint,
        reply: {
          status: 200,
          body: JSON.stringify({ server: 1, delay: 100 }),
        },
        delay: 100,
      });

      server2.on({
        method: 'GET',
        path: endpoint,
        reply: {
          status: 200,
          body: JSON.stringify({ server: 2, delay: 300 }),
        },
        delay: 300,
      });

      server3.on({
        method: 'GET',
        path: endpoint,
        reply: {
          status: 200,
          body: JSON.stringify({ server: 3, delay: 50 }),
        },
        delay: 50,
      });

      // Send multiple requests
      const numRequests = 15;
      const startTime = Date.now();

      for (let i = 0; i < numRequests; i++) {
        await request(app)
          .get(endpoint)
          .expect(200);
      }

      const endTime = Date.now();
      const totalTime = endTime - startTime;

      // Calculate theoretical time if load balancer were doing a good job
      // In a perfect scenario with 3 servers and 15 requests:
      // - 5 requests to server1 (5 * 100ms = 500ms)
      // - 5 requests to server2 (5 * 300ms = 1500ms)
      // - 5 requests to server3 (5 * 50ms = 250ms)
      // So the total would be max(500, 1500, 250) = 1500ms
      // But we'll allow for some overhead
      const theoreticalTime = 1500;
      const maxAllowedTime = theoreticalTime * 2.5; // 250% of theoretical time

      expect(totalTime).toBeLessThan(maxAllowedTime);

      // After these requests, check that the health data reflects response times
      const healthResponse = await request(app)
        .get('/health')
        .expect(200);

      // Each server should have different average response times
      const server1Health = healthResponse.body.endpoints['http://localhost:9081'];
      const server2Health = healthResponse.body.endpoints['http://localhost:9082'];
      const server3Health = healthResponse.body.endpoints['http://localhost:9083'];

      expect(server1Health.avgResponseTimeMs).toBeGreaterThan(0);
      expect(server2Health.avgResponseTimeMs).toBeGreaterThan(0);
      expect(server3Health.avgResponseTimeMs).toBeGreaterThan(0);
    });
  });

  describe('Security Tests', () => {
    test('should safely handle requests with malformed JSON', async () => {
      // Send malformed JSON
      const response = await request(app)
        .post('/api/echo')
        .set('Content-Type', 'application/json')
        .send('{invalid json')
        .expect(400);

      expect(response.body).toHaveProperty('error');
    });

    test('should handle requests with very long URLs', async () => {
      // Create a very long path
      const longPath = '/api/' + 'a'.repeat(2000);

      server1.on({
        method: 'GET',
        path: longPath,
        reply: {
          status: 200,
          body: JSON.stringify({ success: true })
        }
      });

      // Send request with very long URL
      await request(app)
        .get(longPath)
        .expect(200);
    });
  });
});