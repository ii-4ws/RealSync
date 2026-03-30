/** @type {import('jest').Config} */
module.exports = {
  testEnvironment: "node",
  testMatch: ["**/tests/**/*.test.js"],
  setupFiles: ["./tests/setup.js"],
  // Silence noisy console output from logger during tests
  silent: false,
  testTimeout: 10000,
};
