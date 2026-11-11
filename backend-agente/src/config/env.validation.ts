/** Variables sin las que el backend no debe arrancar (la base de datos). El resto tiene valores por defecto. */
const REQUIRED = ['DB_HOST', 'DB_PORT', 'DB_USERNAME', 'DB_PASSWORD', 'DB_DATABASE'] as const;
const NUMERICAS = ['PORT', 'DB_PORT', 'SIMILARITY_MIN', 'CHAT_HISTORIAL_MAXIMO', 'DEEPSEEK_MAX_TOKENS', 'CHAT_ADJUNTO_MAX_MB'] as const;

/**
 * Validación de arranque (fail-fast) para `ConfigModule.forRoot({ validate })`: si falta algo, el backend no
 * arranca y el error dice qué. Nunca imprime valores, solo nombres de variables.
 */
export function validateEnv(env: Record<string, unknown>): Record<string, unknown> {
  const errores: string[] = [];
  const texto = (k: string) => (typeof env[k] === 'string' ? (env[k] as string).trim() : '');

  for (const k of REQUIRED) if (!texto(k)) errores.push(`${k} es obligatoria.`);
  for (const k of NUMERICAS) {
    if (texto(k) && !Number.isFinite(Number(texto(k)))) errores.push(`${k} debe ser un número.`);
  }
  const similitud = Number(texto('SIMILARITY_MIN'));
  if (texto('SIMILARITY_MIN') && (similitud < 0 || similitud > 1)) errores.push('SIMILARITY_MIN debe estar entre 0 y 1.');
  for (const k of ['OLLAMA_URL', 'DEEPSEEK_URL', 'STT_URL']) {
    if (texto(k) && !/^https?:\/\//.test(texto(k))) errores.push(`${k} debe empezar por http:// o https://.`);
  }

  if (errores.length) throw new Error(`Configuración inválida:\n - ${errores.join('\n - ')}`);
  return env;
}
