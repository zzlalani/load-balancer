/**
 * Integration tests for the API routes
 * Tests the complete Round Robin API functionality with mock backend servers
 */
const request = require('supertest');
const MockHttpServer = require('mock-http-server');

// Set TEST_SPECIFIC for the API tests
process.env.TEST_SPECIFIC = 'api';

describe('API Routes Integration', () => {
  let app;
  let server1;
  let server2;

  // Set up mock backend servers and our app
  beforeAll(async () => {
    // Create mock backend servers
    server1 = new MockHttpServer({ host: 'localhost', port: 9081 });
    server2 = new MockHttpServer({ host: 'localhost', port: 9082 });

    // Start mock servers
    await new Promise(resolve => server1.start(resolve));
    await new Promise(resolve => server2.start(resolve));

    // Import the app - environment variables are already set by dotenvx
    const createApp = require('../../src/app');
    const appResult = createApp();
    app = appResult.app;
  });

  // Clean up after tests
  afterAll(async () => {
    // Stop mock servers
    await new Promise(resolve => server1.stop(resolve));
    await new Promise(resolve => server2.stop(resolve));
  });

  beforeEach(() => {
    // Reset mock server requests before each test
    server1.reset();
    server2.reset();
  });

  describe('Health Endpoint', () => {
    test('GET /health should return health status', async () => {
      const response = await request(app)
        .get('/health')
        .expect('Content-Type', /json/)
        .expect(200);

      expect(response.body).toHaveProperty('status', 'UP');
      expect(response.body).toHaveProperty('timestamp');
      expect(response.body).toHaveProperty('endpoints');

      // Check that both endpoints are in the health data
      expect(response.body.endpoints).toHaveProperty('http://localhost:9081');
      expect(response.body.endpoints).toHaveProperty('http://localhost:9082');

      // Verify the endpoint health data structure
      const endpoint1Health = response.body.endpoints['http://localhost:9081'];
      expect(endpoint1Health).toHaveProperty('healthy');
      expect(endpoint1Health).toHaveProperty('consecutiveFailures');
      expect(endpoint1Health).toHaveProperty('avgResponseTimeMs');
    });
  });

  describe.only('Request Forwarding', () => {
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
        .expect(200)
        .end((err, res) => {
          console.error(err);
          console.log(res.body, res.status, res.statusCode);
        });

      // Check response
      expect(response.body).toHaveProperty('success', true);
      expect(response.body).toHaveProperty('message', 'Test response');
      expect(response.body).toHaveProperty('received', true);

      // Check that the request was received by the mock server
      expect(server1.requests()).toHaveLength(1);
      expect(server1.requests()[0]).toHaveProperty('method', 'POST');
      expect(server1.requests()[0]).toHaveProperty('path', '/api/test');

      // Check that the request body was correctly forwarded
      const receivedBody = JSON.parse(server1.requests()[0].body);
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
      expect(server1.requests()[0]).toHaveProperty('path', '/api/resource/123');

      // Check that the request body was correctly forwarded
      const receivedBody = JSON.parse(server1.requests()[0].body);
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
      expect(server1.requests()[0]).toHaveProperty('path', '/api/resource/123');
    });
  });

  describe('Request Routing', () => {
    test('should preserve query parameters when forwarding requests', async () => {
      // Configure mock server to echo query parameters
      server1.on({
        method: 'GET',
        path: '/api/query',
        reply: {
          status: 200,
          headers: { 'content-type': 'application/json' },
          body: (req) => JSON.stringify({ query: req.query })
        }
      });

      // Send request with query parameters
      const response = await request(app)
        .get('/api/query?param1=value1&param2=value2&array[]=1&array[]=2')
        .expect(200);

      // Check that query parameters were preserved
      expect(response.body.query).toEqual({
        param1: 'value1',
        param2: 'value2',
        'array[]': ['1', '2']
      });
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
  });

  describe('Round Robin Load Balancing', () => {
    test('should distribute requests across backend servers', async () => {
      // Configure both mock servers to respond to the same endpoint
      const endpoint = '/api/balance';

      [server1, server2].forEach((server, index) => {
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

      // Check that requests were distributed to both servers
      expect(server1.requests().length).toBe(2); // Should handle 2 requests
      expect(server2.requests().length).toBe(2); // Should handle 2 requests

      // The responses should alternate between server 1 and 2
      expect(response1.body.server).toBe(1);
      expect(response2.body.server).toBe(2);
      expect(response3.body.server).toBe(1);
      expect(response4.body.server).toBe(2);
    });
  });

  describe('Error Handling', () => {
    test('should handle backend server errors', async () => {
      // Configure mock server to respond with an error
      server1.on({
        method: 'GET',
        path: '/api/error',
        reply: {
          status: 500,
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ error: 'Internal server error' })
        }
      });

      // Configure server2 to respond successfully to test retry mechanism
      server2.on({
        method: 'GET',
        path: '/api/error',
        reply: {
          status: 200,
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ success: true, from: 'server2' })
        }
      });

      // Send request to our app - it should fail on server1 and retry with server2
      const response = await request(app)
        .get('/api/error')
        .expect(200);

      // Check that the request was retried and succeeded with server2
      expect(response.body).toHaveProperty('success', true);
      expect(response.body).toHaveProperty('from', 'server2');

      // Verify that both servers received the request
      expect(server1.requests().length).toBe(1);
      expect(server2.requests().length).toBe(1);
    });

    test('should return 502 when all backend servers fail', async () => {
      // Configure both servers to fail
      [server1, server2].forEach(server => {
        server.on({
          method: 'GET',
          path: '/api/all-fail',
          reply: {
            status: 500,
            body: JSON.stringify({ error: 'Server error' })
          }
        });
      });

      // Send request - should try both servers and then fail
      const response = await request(app)
        .get('/api/all-fail')
        .expect(502);

      // Check error response
      expect(response.body).toHaveProperty('error', 'Failed to process request');

      // Verify both servers received requests
      expect(server1.requests().filter(r => r.path === '/api/all-fail').length).toBe(1);
      expect(server2.requests().filter(r => r.path === '/api/all-fail').length).toBe(1);
    });

    test('should handle connection timeout', async () => {
      // Configure server to delay response beyond timeout
      server1.on({
        method: 'GET',
        path: '/api/timeout',
        reply: (req, res) => {
          // Delay longer than the timeout set in .env.test (1000ms)
          setTimeout(() => {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ response: 'too late' }));
          }, 2000); // 2 second delay
        }
      });

      // Configure server2 to respond successfully
      server2.on({
        method: 'GET',
        path: '/api/timeout',
        reply: {
          status: 200,
          body: JSON.stringify({ response: 'quick' })
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
        data: Array(50000).fill(0).map((_, i) => `Item ${i} with some padding to make it larger`)
      };

      // Configure mock server to handle large payload
      server1.on({
        method: 'POST',
        path: '/api/large',
        reply: {
          status: 200,
          headers: { 'content-type': 'application/json' },
          body: (req) => {
            const receivedBody = JSON.parse(req.body);
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
      expect(response.body).toHaveProperty('itemCount', 50000);
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
  });
});
