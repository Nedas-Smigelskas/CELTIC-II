// jest.config.js
module.exports = {
  // ...
  testEnvironment: 'jsdom',
  transform: {
    '^.+\\.tsx?$': 'babel-jest',
  },
  // ...
}