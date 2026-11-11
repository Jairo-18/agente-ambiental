import { validateEnv } from './env.validation';

const BASE = { DB_HOST: 'db', DB_PORT: '5432', DB_USERNAME: 'u', DB_PASSWORD: 'p', DB_DATABASE: 'd' };

describe('validateEnv', () => {
  it('acepta una configuración completa', () => {
    expect(validateEnv({ ...BASE, PORT: '4000', OLLAMA_URL: 'http://host:11434', SIMILARITY_MIN: '0.7' })).toBeTruthy();
  });

  it('dice qué variables faltan, por nombre', () => {
    expect(() => validateEnv({ DB_HOST: 'db' })).toThrow(/DB_PORT es obligatoria[\s\S]*DB_PASSWORD es obligatoria/);
  });

  it('no imprime valores', () => {
    const secreto = 'clave-super-secreta';
    try {
      validateEnv({ ...BASE, DB_PASSWORD: secreto, DB_PORT: 'abc' });
    } catch (e) {
      expect((e as Error).message).not.toContain(secreto);
      expect((e as Error).message).toContain('DB_PORT debe ser un número');
    }
  });

  it('valida números, el rango de la similitud y el formato de la URL', () => {
    expect(() => validateEnv({ ...BASE, SIMILARITY_MIN: '1.5' })).toThrow(/entre 0 y 1/);
    expect(() => validateEnv({ ...BASE, PORT: 'x' })).toThrow(/PORT debe ser un número/);
    expect(() => validateEnv({ ...BASE, OLLAMA_URL: 'localhost:11434' })).toThrow(/OLLAMA_URL/);
  });
});
