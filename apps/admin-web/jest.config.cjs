/** Jest 설정 — API 통합 테스트(핵심 mutation)용. Next.js 호환 */
const nextJest = require('next/jest');

const createJestConfig = nextJest({ dir: __dirname });

/** @type {import('jest').Config} */
const config = {
  testEnvironment: 'node',
  testMatch: ['**/__tests__/**/*.test.ts'],
  moduleNameMapper: { '^@/(.*)$': '<rootDir>/$1' },
  setupFilesAfterEnv: ['<rootDir>/__tests__/setup.ts'],
  testPathIgnorePatterns: ['/node_modules/', '/.next/', '/e2e/'],
};

module.exports = createJestConfig(config);
