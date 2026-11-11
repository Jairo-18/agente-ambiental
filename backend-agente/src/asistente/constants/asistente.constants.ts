import { TIPOS_REPORTE } from '../../conocimiento/interfaces/reportes-ciudadanos.interface';
import { CONTAMINANTES } from '../../shared/constants/aire.constants';
import { DefinicionHerramienta } from '../../llm/services/ollama.service';

export const MAX_PASOS = 8;
export const MAX_INTENTOS_RESPUESTA = 3;
export const ESPERA_CONFIRMACION_MS = 300_000;

export const SISTEMA = `Eres el agente ambiental de Bogotá para reportes ciudadanos. Hoy es {hoy}. Haces dos cosas:
(A) Recibes reportes de ciudadanos sobre problemas ambientales en Bogotá: basura o escombros, tala o árboles en riesgo, quemas, ruido, humo u olores, y ríos, quebradas o humedales. Los registras, les das un radicado y dices a quién le toca y por dónde ponerlo oficialmente.
(B) Haces el reporte MENSUAL de CALIDAD DEL AIRE con datos de la RMCAB y la Resolución 2254 de 2017.

Reportes ciudadanos (A):
- Solo registra cuando el ciudadano te cuenta un caso concreto que quiere reportar. Si solo pregunta dónde o cómo se reporta algo, contesta con consultar_norma (rutas y canales oficiales) y ofrécele registrarlo si quiere.
- Cada reporte nuevo es un caso nuevo: no reutilices la dirección ni los datos de un reporte anterior.
- Para registrar necesitas: qué pasa, la dirección o un punto de referencia en Bogotá, y si está pasando ahora. Si falta la dirección, pregúntala con una sola pregunta corta. No pidas datos personales: el contacto es opcional.
- Si hay fuego activo, alguien herido o en peligro, olor a gas o un árbol a punto de caer, lo PRIMERO es que llame ya a la línea 123; si además ya sabes el lugar, registra el reporte en el mismo turno (la respuesta del sistema empieza por el 123).
- Con los datos completos llama a registrar_reporte_ciudadano. Propón el tipo, pero la clasificación final, la prioridad y la entidad las decide el sistema; el ciudadano confirmará en la pantalla. Nunca digas que quedó registrado ni des un radicado sin llamar a la herramienta.
- Para saber cómo va un reporte usa consultar_reporte_ciudadano con el radicado (formato RA-AAAA-NNNNN).
- Para dudas de dónde reportar, qué entidad atiende o qué dice la norma (ruido, residuos, agua, quemas, tala, aire) usa consultar_norma y repite lo que devuelva, citando la clave.

Reglas generales:
- No calcules, compares ni juzgues cumplimiento tú. Para cualquier cifra, límite o conclusión usa las herramientas; repite solo lo que ellas devuelvan. Nunca inventes normas, límites, estaciones ni valores.
- Para generar un reporte necesitas un archivo de datos y un periodo AAAA-MM. Si falta el periodo, pregúntalo (no lo adivines; "el mes pasado" es el mes anterior a hoy). Para ver qué datos hay llama a listar_archivos_de_datos; nunca inventes nombres de archivo.
- Si hay varios archivos que cubren el periodo, usa el CSV (el Excel contiene los mismos datos); pregunta cuál solo si de verdad no puedes decidir.
- Para un reporte nuevo: revisar_datos y luego generar_reporte, sin pedir más permiso. Solo detente a preguntar si la revisión devuelve advertencias de severidad error. Al terminar cuenta lo importante: archivo generado, excedencias, series que no se pudieron evaluar y que son datos preliminares (borrador técnico).
- Para preguntas sobre qué dice la norma (límites, niveles, el ICA, conversión de unidades) usa consultar_norma y repite lo que devuelva, citando la clave del fragmento.
- Si una herramienta devuelve un error o dice que el usuario no confirmó, dilo tal cual y no insistas.
- Si el mensaje es una pregunta general o un saludo, responde sin herramientas.
- Responde en español, breve (el usuario puede leer desde el celular), en texto plano: sin Markdown ni listas numeradas.`;

/** Herramientas fijas del agente. Ninguna ejecuta comandos ni recibe rutas de salida: solo estas ocho. */
export const HERRAMIENTAS: DefinicionHerramienta[] = [
  {
    type: 'function',
    function: {
      name: 'registrar_reporte_ciudadano',
      description:
        'Registra el reporte ambiental de un ciudadano en Bogotá, solo cuando cuenta un caso concreto (no si solo pregunta dónde reportar). El sistema clasifica el tipo con sus reglas, calcula la prioridad, ' +
        'asigna la entidad responsable y los canales oficiales, y pide confirmación al ciudadano antes de guardarlo. Devuelve el radicado.',
      parameters: {
        type: 'object',
        properties: {
          tipo: { type: 'string', enum: [...TIPOS_REPORTE], description: 'Tipo que propones: residuos, arbolado (tala/poda/árbol en riesgo), quema, ruido, aire (humo/olores), agua (ríos/quebradas/humedales), otro' },
          descripcion: { type: 'string', description: 'Qué está pasando, con las palabras del ciudadano (incluye detalles: qué, cuánto, quién lo causa si lo dijo)' },
          direccion: { type: 'string', description: 'Dirección o punto de referencia en Bogotá, tal como lo dijo el ciudadano' },
          localidad: { type: 'string', description: 'Localidad de Bogotá si el ciudadano la mencionó (Kennedy, Suba, Bosa...)' },
          barrio: { type: 'string' },
          cuando: { type: 'string', description: 'Cuándo pasa: "ahora", "anoche", "todas las noches", una fecha...' },
          en_curso: { type: 'boolean', description: 'true solo si el ciudadano dice que está pasando en este momento; si no lo dice, false (no lo preguntes)' },
          contacto: { type: 'string', description: 'Solo si el ciudadano lo dio voluntariamente' },
        },
        required: ['tipo', 'descripcion', 'direccion'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'consultar_reporte_ciudadano',
      description: 'Consulta el estado y el historial de un reporte ciudadano por su radicado (RA-AAAA-NNNNN).',
      parameters: { type: 'object', properties: { radicado: { type: 'string' } }, required: ['radicado'] },
    },
  },
  {
    type: 'function',
    function: {
      name: 'listar_archivos_de_datos',
      description:
        'Lista los archivos de datos disponibles (CSV en formato estándar o Excel de la RMCAB) y, para los CSV, el rango de fechas y las estaciones que contienen.',
      parameters: { type: 'object', properties: {} },
    },
  },
  {
    type: 'function',
    function: {
      name: 'revisar_datos',
      description: 'Revisa un archivo de datos para un mes (QA/QC): advertencias y representatividad temporal por estación y contaminante. No genera nada.',
      parameters: {
        type: 'object',
        properties: {
          archivo: { type: 'string', description: 'Nombre del archivo, tal como lo lista listar_archivos_de_datos' },
          periodo: { type: 'string', description: 'Mes en formato AAAA-MM, por ejemplo 2026-10' },
        },
        required: ['archivo', 'periodo'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'evaluar_valor',
      description: 'Evalúa un valor ya promediado contra la Resolución 2254/2017: cumple o excede, nivel excepcional, regla y fuente.',
      parameters: {
        type: 'object',
        properties: {
          contaminante: { type: 'string', enum: [...CONTAMINANTES] },
          promedio: { type: 'string', enum: ['1h', '8h', '24h'], description: 'Tiempo de exposición' },
          valor: { type: 'number' },
          unidad: { type: 'string', description: 'µg/m3 (por defecto), ppb o ppm' },
        },
        required: ['contaminante', 'promedio', 'valor'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'generar_reporte',
      description:
        'Genera el reporte mensual de calidad del aire (DOCX, gráficos, hechos y trazabilidad). Si el mes ya tiene reporte, pide confirmación al usuario antes de sobrescribir.',
      parameters: {
        type: 'object',
        properties: {
          archivo: { type: 'string' },
          periodo: { type: 'string', description: 'AAAA-MM' },
          con_llm: { type: 'boolean', description: 'Redactar los comentarios con el modelo (true por defecto)' },
        },
        required: ['archivo', 'periodo'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'consultar_reporte',
      description: 'Consulta los hechos ya calculados de un reporte generado (media, máximos, excedencias, representatividad) de una estación y un contaminante.',
      parameters: {
        type: 'object',
        properties: {
          periodo: { type: 'string', description: 'AAAA-MM' },
          estacion: { type: 'string' },
          contaminante: { type: 'string', enum: [...CONTAMINANTES] },
        },
        required: ['periodo', 'estacion', 'contaminante'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'consultar_norma',
      description:
        'Responde una pregunta sobre normativa ambiental y rutas de atención en Bogotá, buscando en la base indexada: Res. 2254/2017 (aire: límites, niveles, ICA, conversión de unidades), Res. 627/2006 (ruido), Código de Policía (ruido, agua, residuos), quemas, tala, y qué entidad atiende cada reporte y por qué canal. Devuelve la respuesta y los fragmentos citados con su fuente.',
      parameters: { type: 'object', properties: { pregunta: { type: 'string' } }, required: ['pregunta'] },
    },
  },
];
