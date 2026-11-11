/** Pruebas contra PostgreSQL + pgvector reales (docker compose up -d db). Usan una base aparte: agente_test. */
module.exports = {
  moduleFileExtensions: ['js', 'json', 'ts'],
  rootDir: 'test',
  testRegex: '.*\\.db-spec\\.ts$',
  transform: { '^.+\\.ts$': 'ts-jest' },
  testEnvironment: 'node',
  testTimeout: 30000,
};
