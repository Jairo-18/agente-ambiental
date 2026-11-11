import { Injectable } from '@nestjs/common';
import { OllamaService, MensajeOllama } from '../../llm/services/ollama.service';
import { normalizar } from '../../reportes-ciudadanos/services/clasificacion.service';
import { mesTexto } from '../../shared/utils/fechas.util';
import { archivosInventados, numerosPermitidos, verificar } from '../../verificacion/verificador';
import { HERRAMIENTAS, MAX_INTENTOS_RESPUESTA, MAX_PASOS, SISTEMA } from '../constants/asistente.constants';
import { HerramientasService, ResultadoHerramienta } from './herramientas.service';

export interface LlamadaEjecutada {
  herramienta: string;
  argumentos: Record<string, unknown>;
  resultado: ResultadoHerramienta;
}

/** Lo que pasó en una petición: sirve para la interfaz, la auditoría y las pruebas. */
export interface Turno {
  respuesta: string;
  llamadas: LlamadaEjecutada[];
  /** llm: la escribió el modelo y pasó las guardas · plantilla: tras generar un reporte, siempre la escribe el código · codigo: respaldo */
  origen: 'llm' | 'plantilla' | 'codigo';
  problemas: string[];
  pasos: number;
}

const VINETA_NUMERADA = /^\s*\d+[.)]\s+/gm;
// Frases con las que el modelo afirma o anuncia que generó el reporte. Si no hubo una generación real, es falso.
const AFIRMA_GENERACION =
  /(?<![\p{L}])(?:(?:he|ha|han|fue|fueron|queda|quedó|está|están|ya está|ya quedó|se ha)\s+(?:sido\s+)?(?:generad[oa]s?|list[oa]s?)|gener(?:é|aré|ando)|voy a generar|ahora genero)(?![\p{L}])/iu;
// Frases con las que el modelo afirma que registró un reporte ciudadano, y radicados del prototipo (RA-AAAA-NNNNN).
const AFIRMA_REGISTRO =
  /(?<![\p{L}])(?:(?:qued[oó]|ha sido|fue|est[aá]|queda)\s+(?:ya\s+)?registrad[oa]|registr[eé]\s+(?:tu|el|su)\s+reporte|(?:ya\s+)?lo\s+registr[eé])(?![\p{L}])/iu;
const RADICADO = /\bRA-\d{4}-\d{5}\b/g;
/** Palabras de una dirección que no la identifican (si solo coinciden estas, la dirección no salió del ciudadano). */
const GENERICAS = new Set(['calle', 'carrera', 'avenida', 'diagonal', 'transversal', 'cra', 'kra', 'cl', 'av', 'con', 'de', 'del', 'la', 'el', 'los', 'las', 'en', 'y', 'no', 'numero', 'bogota', 'sur', 'norte', 'barrio', 'localidad', 'cerca', 'frente', 'al', 'a']);

/**
 * ¿La dirección que el modelo puso en la herramienta la dijo el ciudadano? Al menos la mitad de sus palabras
 * significativas (números, nombres) tienen que estar en sus mensajes: el modelo no puede suponer el lugar.
 */
export function direccionDicha(direccion: string, mensajesDelUsuario: string[]): boolean {
  const dicho = ` ${normalizar(mensajesDelUsuario.join(' '))} `;
  const claves = normalizar(direccion).split(' ').filter((p) => p && !GENERICAS.has(p) && (p.length >= 3 || /\d/.test(p)));
  if (!claves.length) return false;
  return claves.filter((p) => dicho.includes(` ${p} `)).length / claves.length >= 0.5;
}

/** Las llamadas a herramientas de un mensaje: las nativas de Ollama y, si no hay, las que el modelo escribió como JSON. */
export function llamadasDe(msg: MensajeOllama, nombresValidos: string[]): { nombre: string; args: Record<string, unknown> }[] {
  const nativas = (msg.tool_calls ?? []).map((c) => {
    let args = c.function.arguments ?? {};
    if (typeof args === 'string') {
      try {
        args = JSON.parse(args || '{}');
      } catch {
        args = {};
      }
    }
    return { nombre: c.function.name, args: args as Record<string, unknown> };
  });
  if (nativas.length) return nativas;

  const texto = msg.content ?? '';
  const out: { nombre: string; args: Record<string, unknown> }[] = [];
  for (let i = texto.indexOf('{'); i !== -1; ) {
    const fin = cierreDe(texto, i);
    let consumido = i + 1;
    if (fin !== -1) {
      try {
        const dato = JSON.parse(texto.slice(i, fin + 1));
        // nombre antes del JSON: «consultar_norma {…}», «consultar_norma({…})» o con basura en medio («nombre  sourceMapping: {…}»),
        // formatos que qwen2.5 a veces escribe como texto: vale el nombre válido más cercano en los 120 caracteres previos
        const previo = texto.slice(Math.max(0, i - 120), i);
        const nombreAntes = nombresValidos
          .map((n) => ({ n, pos: previo.lastIndexOf(n) }))
          .filter((x) => x.pos >= 0)
          .sort((x, y) => y.pos - x.pos)[0]?.n;
        if (dato && typeof dato === 'object' && nombresValidos.includes(dato.name)) {
          out.push({ nombre: dato.name, args: dato.arguments || dato.parameters || {} });
        } else if (dato && typeof dato === 'object' && nombreAntes && nombresValidos.includes(nombreAntes)) {
          out.push({ nombre: nombreAntes, args: dato });
        }
        consumido = fin + 1;
      } catch {
        /* no era JSON: se sigue buscando */
      }
    }
    i = texto.indexOf('{', consumido);
  }
  return out;
}

/** Posición de la llave que cierra la que abre en `desde`, o -1. Respeta las comillas. */
function cierreDe(texto: string, desde: number): number {
  let profundidad = 0;
  let enCadena = false;
  for (let i = desde; i < texto.length; i++) {
    const c = texto[i];
    if (enCadena) {
      if (c === '\\') i++;
      else if (c === '"') enCadena = false;
    } else if (c === '"') enCadena = true;
    else if (c === '{') profundidad++;
    else if (c === '}' && --profundidad === 0) return i;
  }
  return -1;
}

/**
 * El agente: un bucle entre el modelo y las herramientas fijas. El modelo entiende la petición y elige herramientas; todo
 * lo que se afirma sobre datos y norma sale de ellas. Tres guardas en código que el modelo no puede saltarse:
 *  1. toda cifra de la respuesta debe estar en el mensaje del usuario, en el prompt o en lo que devolvieron las herramientas;
 *  2. no puede afirmar que generó un reporte ni citar un archivo de datos que ninguna herramienta devolvió;
 *  3. tras llamar a `generar_reporte`, la respuesta al usuario la escribe el código, no el modelo.
 */
@Injectable()
export class AgenteService {
  private historial: MensajeOllama[] = [];
  /** Fuentes de cifras permitidas: el prompt, lo que dijo el usuario y lo que devolvieron las herramientas. */
  private fuentes: string[] = [];
  private reportesGenerados = 0;
  /** Reportes ciudadanos registrados o consultados en esta conversación (habilitan hablar de "registrado"). */
  private reportesCiudadanos = 0;
  /** Lo que dijo el ciudadano en esta conversación (para comprobar que la dirección no la inventó el modelo). */
  private delUsuario: string[] = [];
  /** Desde qué mensaje del ciudadano empieza el reporte actual (los anteriores son de otro reporte ya registrado). */
  private inicioReporte = 0;
  private hoy = new Date();

  constructor(
    private readonly ollama: OllamaService,
    private readonly herramientas: HerramientasService,
  ) {
    this.nuevaConversacion();
  }

  /** Fija "hoy" (para que "el mes pasado" tenga sentido) y reinicia la conversación. Útil en pruebas. */
  nuevaConversacion(hoy: Date = new Date()): void {
    this.hoy = hoy;
    const sistema = SISTEMA.replace('{hoy}', hoy.toISOString().slice(0, 10));
    this.historial = [{ role: 'system', content: sistema }];
    this.fuentes = [sistema]; // el prompt también es fuente legítima (p. ej. "Resolución 2254")
    this.reportesGenerados = 0;
    this.reportesCiudadanos = 0;
    this.delUsuario = [];
    this.inicioReporte = 0;
  }

  get mensajes(): readonly MensajeOllama[] {
    return this.historial;
  }

  private recortar(conservar = 40): void {
    if (this.historial.length > conservar + 1) this.historial.splice(1, this.historial.length - conservar - 1);
  }

  /** Por qué se rechaza la respuesta final del modelo, o null si pasa las guardas. */
  private problemaDeLaRespuesta(texto: string): string | null {
    if (!texto) return 'respuesta vacía';
    const radicados = [...texto.matchAll(RADICADO)].map((m) => m[0]).filter((r) => !this.fuentes.some((f) => f.includes(r)));
    if (radicados.length) return `radicados que ninguna herramienta devolvió: ${radicados.join(', ')}; para registrar un reporte llama a registrar_reporte_ciudadano`;
    const v = verificar(texto.replace(VINETA_NUMERADA, ''), numerosPermitidos(this.fuentes));
    if (!v.ok) return `cifras que no vienen de las herramientas: ${v.inventadas.join(', ')}`;
    const nombres = archivosInventados(texto, this.fuentes);
    if (nombres.length) {
      return `nombres de archivo que no existen en los resultados de las herramientas: ${nombres.join(', ')} (copia los nombres exactamente como los devolvió listar_archivos_de_datos)`;
    }
    if (!this.reportesCiudadanos && AFIRMA_REGISTRO.test(texto)) {
      return 'dices que el reporte quedó registrado, pero no llamaste a registrar_reporte_ciudadano; si ya tienes los datos, llama a la herramienta';
    }
    if (!this.reportesGenerados && AFIRMA_GENERACION.test(texto)) {
      return 'dices que generaste o vas a generar el reporte, pero no llamaste a generar_reporte; si hay que generarlo, llama a la herramienta en vez de anunciarlo';
    }
    return null;
  }

  async responder(mensaje: string): Promise<Turno> {
    const turno: Turno = { respuesta: '', llamadas: [], origen: 'llm', problemas: [], pasos: 0 };
    this.historial.push({ role: 'user', content: mensaje });
    this.fuentes.push(mensaje);
    this.delUsuario.push(mensaje);
    const nombresValidos = this.herramientas.nombres();
    const vistas = new Set<string>();
    let intentosRespuesta = 0;

    for (let paso = 0; paso < MAX_PASOS; paso++) {
      turno.pasos++;
      this.recortar();
      const msg = await this.ollama.chatConHerramientas(this.historial, HERRAMIENTAS);
      this.historial.push({ role: 'assistant', content: msg.content ?? '', ...(msg.tool_calls?.length ? { tool_calls: msg.tool_calls } : {}) });
      const llamadas = llamadasDe(msg, nombresValidos);

      if (llamadas.length) {
        let generoReporte = false;
        let registroDecidido = false;
        for (const { nombre, args } of llamadas) {
          const clave = `${nombre}:${JSON.stringify(args, Object.keys(args).sort())}`;
          let resultado: ResultadoHerramienta;
          if (vistas.has(clave)) {
            resultado = { error: 'Ya llamaste a esta herramienta con los mismos argumentos; usa el resultado anterior y responde.' };
          } else if (nombre === 'registrar_reporte_ciudadano' && args.direccion && !direccionDicha(String(args.direccion), this.delUsuario)) {
            // guarda: el lugar lo tiene que decir el ciudadano, el modelo no puede suponerlo
            resultado = { error: `La dirección «${args.direccion}» no la dijo el ciudadano. Pregúntale dónde está pasando (dirección o punto de referencia en Bogotá); no la supongas.` };
          } else {
            vistas.add(clave);
            if (nombre === 'registrar_reporte_ciudadano') this.herramientas.contexto.textoCiudadano = this.delUsuario.slice(this.inicioReporte).join('. ');
            resultado = await this.herramientas.ejecutar(nombre, args);
            if (nombre === 'registrar_reporte_ciudadano' && resultado.registrado) this.inicioReporte = this.delUsuario.length;
          }
          turno.llamadas.push({ herramienta: nombre, argumentos: args, resultado });
          const contenido = JSON.stringify(resultado);
          this.fuentes.push(contenido);
          if (!resultado.error) this.fuentes.push(JSON.stringify(args)); // argumentos que la herramienta aceptó (periodo, archivo)
          this.historial.push({ role: 'tool', tool_name: nombre, content: contenido });
          if (nombre === 'generar_reporte') {
            generoReporte = true;
            if (resultado.generado) this.reportesGenerados++;
          }
          // con error (faltan datos) el modelo sigue y pregunta; si la persona ya decidió, responde el código
          if (nombre === 'registrar_reporte_ciudadano' && !resultado.error) registroDecidido = true;
          if ((nombre === 'registrar_reporte_ciudadano' && resultado.registrado) || (nombre === 'consultar_reporte_ciudadano' && !resultado.error)) {
            this.reportesCiudadanos++;
          }
        }
        if (generoReporte) return this.respuestaDeGeneracion(turno);
        if (registroDecidido) return this.respuestaDeRegistro(turno);
        continue;
      }

      const texto = (msg.content ?? '').trim();
      const problema = this.problemaDeLaRespuesta(texto);
      if (problema === null) {
        turno.respuesta = texto;
        return turno;
      }
      turno.problemas.push(problema);
      if (++intentosRespuesta >= MAX_INTENTOS_RESPUESTA) break;
      this.historial.push({
        role: 'user',
        content:
          `[sistema] Tu respuesta fue rechazada: ${problema}. Responde de nuevo usando solo cifras que aparezcan en el mensaje del ` +
          'usuario o en los resultados de las herramientas. Si necesitas datos, llama a una herramienta (' + this.herramientas.nombres().join(', ') + ').',
      });
    }
    return this.respuestaDelCodigo(turno);
  }

  private cerrar(turno: Turno, texto: string, origen: Turno['origen']): Turno {
    turno.origen = origen;
    turno.respuesta = texto;
    this.historial.push({ role: 'assistant', content: texto });
    return turno;
  }

  /**
   * Tras `generar_reporte` la respuesta la escribe el código. Un modelo que narra el resultado puede decir "sin excedencias"
   * cuando las hubo (pasó en las pruebas): lo que se le cuenta al usuario sale de lo que devolvió la herramienta.
   */
  private respuestaDeGeneracion(turno: Turno): Turno {
    const r = [...turno.llamadas].reverse().find((l) => l.herramienta === 'generar_reporte')!.resultado;
    if (r.error) return this.cerrar(turno, `No pude generar el reporte: ${r.error}`, 'plantilla');
    if (!r.generado) return this.cerrar(turno, r.motivo, 'plantilla');

    const revision = [...turno.llamadas].reverse().find((l) => l.herramienta === 'revisar_datos' && !l.resultado.error)?.resultado;
    const partes = [`Reporte de ${mesTexto(r.periodo)} generado: ${r.carpeta}/${r.archivo} (con gráficos, hechos.json y trazabilidad.md).`, r.texto_usuario];
    if (revision) {
      const s = revision.n_advertencias_por_severidad;
      partes.push(`Revisión de los datos: ${s.aviso} avisos y ${s.error} errores (detalle en trazabilidad.md).`);
    }
    const textos = Object.values(r.redaccion as Record<string, string>);
    if (textos.length) {
      partes.push(`Redacción: ${textos.filter((o) => o === 'llm').length} de ${textos.length} comentarios escritos por el modelo y verificados; el resto salió de plantilla.`);
    }
    return this.cerrar(turno, partes.join('\n\n'), 'plantilla');
  }

  /**
   * Tras registrar un reporte ciudadano la respuesta la escribe el código: el radicado, la prioridad y los canales
   * oficiales salen tal cual de la herramienta (y se leen en voz alta: no puede haber un radicado inventado).
   */
  private respuestaDeRegistro(turno: Turno): Turno {
    const r = [...turno.llamadas].reverse().find((l) => l.herramienta === 'registrar_reporte_ciudadano')!.resultado;
    if (!r.registrado) return this.cerrar(turno, 'No registré el reporte porque no lo confirmaste. Si quieres, dime qué corrijo y lo intento de nuevo.', 'plantilla');
    const partes: string[] = [];
    if (r.emergencia) partes.push('Primero lo urgente: si el peligro sigue, llama ya a la línea 123.');
    partes.push(`Listo, registré tu reporte de ${String(r.tipo_nombre).toLowerCase()} con el radicado ${r.radicado}. Prioridad ${r.prioridad}.`);
    partes.push(`Le corresponde a: ${r.entidad}.`);
    const canales = ((r.como_reportar ?? []) as string[]).slice(0, 3);
    if (canales.length) partes.push(`Para que la autoridad actúe, ponlo también por un canal oficial: ${canales.join('; o ')}.`);
    const dup = (r.posibles_duplicados ?? []) as { radicado: string }[];
    if (dup.length) partes.push(`Ojo: en la misma zona hay ${dup.length} reporte(s) parecido(s) del último mes (${dup.map((d) => d.radicado).join(', ')}).`);
    partes.push('Ese radicado es de este prototipo, no es oficial; con él puedes preguntarme cómo va tu reporte.');
    return this.cerrar(turno, partes.join('\n\n'), 'plantilla');
  }

  /** Último recurso: el código redacta con lo que devolvieron las herramientas, sin pasar por el modelo. */
  private respuestaDelCodigo(turno: Turno): Turno {
    const partes: string[] = [];
    for (const { herramienta, resultado } of turno.llamadas) {
      if (resultado.error) partes.push(`No pude completar ${herramienta}: ${resultado.error}`);
      else if (resultado.conclusion) partes.push(resultado.conclusion);
    }
    return this.cerrar(
      turno,
      partes.join('\n\n') || 'No pude responder con cifras verificadas. Dime el archivo y el periodo (AAAA-MM) para consultar o generar el reporte.',
      'codigo',
    );
  }
}
