/**
 * Mock logger for testing
 */
module.exports = {
  error: jest.fn(),
  warn: jest.fn(),
  info: jest.fn(),
  http: jest.fn(),
  verbose: jest.fn(),
  debug: jest.fn(),
  silly: jest.fn(),

  // Reset all mocks
  mockReset: function() {
    this.error.mockReset();
    this.warn.mockReset();
    this.info.mockReset();
    this.http.mockReset();
    this.verbose.mockReset();
    this.debug.mockReset();
    this.silly.mockReset();
  }
};
