// Mock for electron-log
const log = {
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
  initialize: jest.fn()
}
module.exports = log
