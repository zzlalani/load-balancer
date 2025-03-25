/**
 * Mock Express request and response objects for testing
 */

/**
 * Create a mock Express request object
 * @param {Object} options - Request options
 * @returns {Object} Mock request object
 */
function mockRequest(options = {}) {
  const {
    method = 'GET',
    url = '/',
    originalUrl = url,
    params = {},
    query = {},
    body = {},
    headers = {}
  } = options;

  return {
    method,
    url,
    originalUrl,
    params,
    query,
    body,
    headers
  };
}

/**
 * Create a mock Express response object
 * @returns {Object} Mock response object with Jest spy functions
 */
function mockResponse() {
  const res = {};

  // Status function
  res.status = jest.fn().mockReturnValue(res);

  // Send function
  res.send = jest.fn().mockReturnValue(res);

  // JSON function
  res.json = jest.fn().mockReturnValue(res);

  // Set header function
  res.set = jest.fn().mockReturnValue(res);
  res.setHeader = jest.fn().mockReturnValue(res);

  // End function
  res.end = jest.fn().mockReturnValue(res);

  return res;
}

/**
 * Create a mock Express next function
 * @returns {Function} Mock next function
 */
function mockNext() {
  return jest.fn();
}

module.exports = {
  mockRequest,
  mockResponse,
  mockNext
};
