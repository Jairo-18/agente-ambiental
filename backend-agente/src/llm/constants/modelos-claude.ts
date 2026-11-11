import { Entrada, Esfuerzo, ModeloInfo } from '../interfaces/chat.interface';

const TODOS: Esfuerzo[] = ['low', 'medium', 'high', 'xhigh', 'max'];
const SIN_XHIGH: Esfuerzo[] = ['low', 'medium', 'high', 'max']; // xhigh llegó con Opus 4.7
/** Todos los Claude ven imágenes y leen PDF de forma nativa (también escaneados). ~300k caracteres ≈ 85k tokens de documentos. */
const NATIVO = { entradas: ['imagen', 'pdf'] as Entrada[], maxCaracteresDocumentos: 300_000 };

/**
 * Modelos de Claude que se pueden usar con la suscripción a través de Claude Code (`claude -p --model <id>`).
 * Comprobados uno por uno con el plan Pro el 2026-11-10. Haiku 4.5 no admite niveles de esfuerzo.
 * El esfuerzo por defecto es "medium": para conversar rinde bien y gasta menos cupo que "high".
 */
export const MODELOS_CLAUDE: ModeloInfo[] = [
  { id: 'claude-fable-5-1', nombre: 'Claude Fable 5.1', grupo: 'Más recientes', descripcion: 'El más capaz: razonamiento profundo y tareas largas. Gasta mucho cupo.', esfuerzos: TODOS, esfuerzoPorDefecto: 'medium', ...NATIVO },
  { id: 'claude-opus-5-5', nombre: 'Claude Opus 5.5', grupo: 'Más recientes', descripcion: 'Muy capaz y equilibrado para trabajo exigente.', esfuerzos: TODOS, esfuerzoPorDefecto: 'medium', ...NATIVO },
  { id: 'claude-sonnet-5-5', nombre: 'Claude Sonnet 5.5', grupo: 'Más recientes', descripcion: 'Rápido y capaz, para el día a día.', esfuerzos: TODOS, esfuerzoPorDefecto: 'medium', ...NATIVO },
  { id: 'claude-haiku-4-5', nombre: 'Claude Haiku 4.5', grupo: 'Más recientes', descripcion: 'El más rápido y liviano; consume poco cupo.', esfuerzos: [], esfuerzoPorDefecto: null, ...NATIVO },
  { id: 'claude-fable-5', nombre: 'Claude Fable 5', grupo: 'Anteriores', descripcion: 'Generación anterior de Fable.', esfuerzos: TODOS, esfuerzoPorDefecto: 'medium', ...NATIVO },
  { id: 'claude-opus-5', nombre: 'Claude Opus 5', grupo: 'Anteriores', descripcion: 'Opus de la generación 5.', esfuerzos: TODOS, esfuerzoPorDefecto: 'medium', ...NATIVO },
  { id: 'claude-opus-4-8', nombre: 'Claude Opus 4.8', grupo: 'Anteriores', descripcion: 'Opus de la generación 4.', esfuerzos: TODOS, esfuerzoPorDefecto: 'medium', ...NATIVO },
  { id: 'claude-opus-4-7', nombre: 'Claude Opus 4.7', grupo: 'Anteriores', descripcion: 'Opus de la generación 4.', esfuerzos: TODOS, esfuerzoPorDefecto: 'medium', ...NATIVO },
  { id: 'claude-opus-4-6', nombre: 'Claude Opus 4.6', grupo: 'Anteriores', descripcion: 'Opus de la generación 4.', esfuerzos: SIN_XHIGH, esfuerzoPorDefecto: 'medium', ...NATIVO },
  { id: 'claude-sonnet-5', nombre: 'Claude Sonnet 5', grupo: 'Anteriores', descripcion: 'Sonnet de la generación 5.', esfuerzos: TODOS, esfuerzoPorDefecto: 'medium', ...NATIVO },
  { id: 'claude-sonnet-4-6', nombre: 'Claude Sonnet 4.6', grupo: 'Anteriores', descripcion: 'Sonnet de la generación 4.', esfuerzos: SIN_XHIGH, esfuerzoPorDefecto: 'medium', ...NATIVO },
];
