/** Palabras en minúscula y sin tildes ni signos, para comparar textos. */
function palabras(texto: string): string[] {
  return texto.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().split(/[^a-z0-9ñ]+/).filter(Boolean);
}

/**
 * ¿El mensaje ya contiene lo que se dictó? La transcripción de una nota de voz vuelve a la caja de texto, pero el
 * usuario puede enviarla vacía (o borrarla): entonces el modelo tiene que recibir la transcripción. Se considera
 * incluida si al menos la mitad de sus palabras están en el mensaje (tolera que el usuario la corrija).
 */
export function transcripcionIncluida(mensaje: string, transcripcion: string): boolean {
  const dichas = palabras(transcripcion);
  if (!dichas.length) return true;
  const enMensaje = new Set(palabras(mensaje));
  return dichas.filter((p) => enMensaje.has(p)).length / dichas.length >= 0.5;
}
