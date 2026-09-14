module.exports = {
  preset: 'jest-expo',

  setupFilesAfterEnv: [
    '<rootDir>/jest.setup.js',
  ],

  testMatch: [
    '**/__tests__/**/*.[jt]s?(x)',
    '**/?(*.)+(spec|test).[jt]s?(x)',
  ],
};