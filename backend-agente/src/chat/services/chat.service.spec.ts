import { MODELOS_CLAUDE } from '../../llm/constants/modelos-claude';
import { EstadoProveedor, lineas, ModeloInfo, ProveedorChat, ProveedorId } from '../../llm/interfaces/chat.interface';
import { describir } from '../../llm/services/deepseek.service';
import { ChatService } from './chat.service';

const modelo = (id: string, extra: Partial<ModeloInfo> = {}): ModeloInfo => ({ id, nombre: id, grupo: 'g', descripcion: null, esfuerzos: [], esfuerzoPorDefecto: null, entradas: [], maxCaracteresDocumentos: 1000, ...extra });

const proveedorFalso = (id: ProveedorId, estado: Partial<EstadoProveedor>): ProveedorChat => ({
  id,
  estado: async () => ({ id, nombre: id, disponible: true, modelos: [modelo('m1')], modeloPorDefecto: 'm1', nota: null, ...estado }),
  responder: async function* () { yield { tipo: 'texto', texto: 'hola' }; },
});

describe('ChatService', () => {
  const servicio = new ChatService(
    proveedorFalso('ollama', {}) as never,
    proveedorFalso('deepseek', { disponible: false, nota: 'sin saldo' }) as never,
    proveedorFalso('claude', {
      modelos: [modelo('claude-opus-5-5', { esfuerzos: ['low', 'medium', 'high', 'xhigh', 'max'], esfuerzoPorDefecto: 'medium' }), modelo('claude-haiku-4-5')],
    }) as never,
  );

  it('entrega el proveedor si está disponible y el modelo es suyo, con el esfuerzo por defecto del modelo', async () => {
    const r = await servicio.proveedorListo('claude', 'claude-opus-5-5');
    expect(r.proveedor.id).toBe('claude');
    expect(r.esfuerzo).toBe('medium');
  });

  it('respeta el esfuerzo pedido si el modelo lo admite', async () => {
    await expect(servicio.proveedorListo('claude', 'claude-opus-5-5', 'xhigh')).resolves.toHaveProperty('esfuerzo', 'xhigh');
  });

  it('rechaza un esfuerzo en un modelo que no tiene niveles (Haiku)', async () => {
    await expect(servicio.proveedorListo('claude', 'claude-haiku-4-5', 'high')).rejects.toMatchObject({ status: 400 });
    await expect(servicio.proveedorListo('claude', 'claude-haiku-4-5')).resolves.toHaveProperty('esfuerzo', null);
  });

  it('rechaza un proveedor caído con su motivo (503)', async () => {
    await expect(servicio.proveedorListo('deepseek', 'm1')).rejects.toMatchObject({ status: 503, message: expect.stringContaining('sin saldo') });
  });

  it('no deja pasar un modelo que no está en la lista (nada arbitrario hacia el CLI de Claude)', async () => {
    await expect(servicio.proveedorListo('claude', '--dangerously-skip-permissions')).rejects.toMatchObject({ status: 400 });
  });

  it('suma las instrucciones del usuario al mensaje de sistema', () => {
    expect(servicio.sistema()).not.toContain('Instrucciones del usuario');
    expect(servicio.sistema('  habla como pirata ')).toContain('Instrucciones del usuario para esta conversación:\nhabla como pirata');
  });
});

describe('catálogo de Claude', () => {
  it('ids únicos, los más recientes primero, y cada esfuerzo por defecto es uno de los admitidos', () => {
    const ids = MODELOS_CLAUDE.map((m) => m.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(MODELOS_CLAUDE[0].grupo).toBe('Más recientes');
    for (const m of MODELOS_CLAUDE) expect(m.esfuerzoPorDefecto === null ? m.esfuerzos.length === 0 : m.esfuerzos.includes(m.esfuerzoPorDefecto)).toBe(true);
  });
});

describe('describir (modelos de OpenRouter / DeepSeek)', () => {
  it('nombre limpio, contexto, precio por millón y niveles si anuncia reasoning_effort', () => {
    const m = describir('deepseek/deepseek-v4.1-flash', {
      id: 'deepseek/deepseek-v4.1-flash', name: 'DeepSeek: DeepSeek V4.1 Flash', context_length: 1048576,
      pricing: { prompt: '0.0000003', completion: '0.0000012' }, supported_parameters: ['reasoning', 'reasoning_effort'],
    });
    expect(m).toMatchObject({ nombre: 'DeepSeek V4.1 Flash', grupo: 'Generales', esfuerzos: ['low', 'medium', 'high'], esfuerzoPorDefecto: 'medium' });
    expect(m.descripcion).toBe('1M de contexto · $0.30 / $1.20 por M de tokens');
  });

  it('sin reasoning_effort no hay niveles; un id desconocido para la API queda con su id como nombre', () => {
    expect(describir('deepseek/deepseek-r1-0528', { id: 'deepseek/deepseek-r1-0528', supported_parameters: ['reasoning'] })).toMatchObject({ grupo: 'Razonadores', esfuerzos: [], esfuerzoPorDefecto: null });
    expect(describir('deepseek/nuevo')).toMatchObject({ nombre: 'deepseek/nuevo', descripcion: null });
  });
});

describe('lineas', () => {
  async function* trozos(...partes: string[]) { for (const p of partes) yield new TextEncoder().encode(p); }
  const todas = async (it: AsyncGenerator<string>) => { const r: string[] = []; for await (const l of it) r.push(l); return r; };

  it('reconstruye líneas partidas entre trozos, ignora las vacías y conserva la última sin salto', async () => {
    expect(await todas(lineas(trozos('{"a":1}\n{"b"', ':2}\r\n\n', 'data: [DONE]')))).toEqual(['{"a":1}', '{"b":2}', 'data: [DONE]']);
  });

  it('no rompe caracteres UTF-8 partidos entre dos trozos', async () => {
    const bytes = new TextEncoder().encode('ozono troposférico\n');
    const corte = bytes.indexOf(0xc3) + 1; // en medio de la «é»
    async function* partido() { yield bytes.slice(0, corte); yield bytes.slice(corte); }
    expect(await todas(lineas(partido()))).toEqual(['ozono troposférico']);
  });
});
