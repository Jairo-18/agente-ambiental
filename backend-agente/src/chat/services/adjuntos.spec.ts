import { Workbook } from 'exceljs';
import { ModeloInfo } from '../../llm/interfaces/chat.interface';
import { ChatAdjunto } from '../../shared/entities/chatAdjunto.entity';
import { ChatMensaje } from '../../shared/entities/chatMensaje.entity';
import { ContextoService } from './contexto.service';
import { clasificar, ExtraccionService, limpiar } from './extraccion.service';
import { fragmentar } from './memoria.service';

const modelo = (extra: Partial<ModeloInfo> = {}): ModeloInfo => ({
  id: 'm', nombre: 'Modelo', grupo: 'g', descripcion: null, esfuerzos: [], esfuerzoPorDefecto: null, entradas: [], maxCaracteresDocumentos: 10_000, ...extra,
});
const mensaje = (id: number, rol: 'usuario' | 'asistente', contenido: string) => ({ chatMensajeId: id, rol, contenido }) as ChatMensaje;
const adjunto = (extra: Partial<ChatAdjunto>) =>
  ({ chatAdjuntoId: 'a1', tipo: 'documento', nombre: 'informe.pdf', mime: 'application/pdf', texto: 'texto', estado: 'listo', dictado: false, paginas: 1, datos: Buffer.from('x'), ...extra }) as ChatAdjunto;

/** PDF mínimo de una página con una línea de texto (sin librerías). */
function pdfConTexto(linea: string): Buffer {
  const flujo = `BT /F1 18 Tf 20 50 Td (${linea}) Tj ET`;
  const objetos = [
    '<< /Type /Catalog /Pages 2 0 R >>', '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 400 100] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>',
    `<< /Length ${flujo.length} >>\nstream\n${flujo}\nendstream`, '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
  ];
  let pdf = '%PDF-1.4\n';
  const offs: number[] = [];
  objetos.forEach((o, i) => { offs.push(pdf.length); pdf += `${i + 1} 0 obj\n${o}\nendobj\n`; });
  const xref = pdf.length;
  pdf += `xref\n0 ${objetos.length + 1}\n0000000000 65535 f \n${offs.map((o) => `${String(o).padStart(10, '0')} 00000 n \n`).join('')}`;
  pdf += `trailer\n<< /Size ${objetos.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return Buffer.from(pdf);
}

describe('fragmentar', () => {
  it('un texto corto es un solo fragmento; vacío, ninguno', () => {
    expect(fragmentar('hola')).toEqual(['hola']);
    expect(fragmentar('   ')).toEqual([]);
  });

  it('parte en trozos de como mucho el tamaño, cortando en frases y solapando', () => {
    const frases = Array.from({ length: 60 }, (_, i) => `La frase número ${i} habla del PM10 en Kennedy.`).join(' ');
    const trozos = fragmentar(frases, 300, 50);
    expect(trozos.length).toBeGreaterThan(5);
    for (const t of trozos) expect(t.length).toBeLessThanOrEqual(300);
    // cada trozo (menos el último) termina en fin de frase
    for (const t of trozos.slice(0, -1)) expect(t).toMatch(/\.$/);
    // no se pierde nada: la última frase está en el último trozo
    expect(trozos[trozos.length - 1]).toContain('número 59');
  });
});

describe('clasificar', () => {
  it('por MIME o, si el navegador no lo dice, por extensión', () => {
    expect(clasificar('image/png', 'a.png')).toEqual({ tipo: 'imagen', mime: 'image/png' });
    expect(clasificar('', 'datos.csv')).toEqual({ tipo: 'documento', mime: 'text/plain' });
    expect(clasificar('application/octet-stream', 'informe.pdf')).toEqual({ tipo: 'documento', mime: 'application/pdf' });
    expect(clasificar('audio/webm;codecs=opus', 'nota.webm')).toEqual({ tipo: 'audio', mime: 'audio/webm' });
    expect(clasificar('video/webm', 'nota.webm')).toEqual({ tipo: 'audio', mime: 'audio/webm' });
    expect(clasificar('', 'script.py').tipo).toBe('documento');
  });

  it('rechaza lo que no sabe leer', () => {
    expect(() => clasificar('application/x-msdownload', 'virus.exe')).toThrow(/No sé leer/);
    expect(() => clasificar('image/svg+xml', 'dibujo.svg')).toThrow(/No sé leer/);
  });
});

describe('ExtraccionService', () => {
  const ex = new ExtraccionService();

  it('lee el texto de un PDF por páginas', async () => {
    const r = await ex.extraer(pdfConTexto('PM10 en Kennedy: 80,24 ug/m3'), 'application/pdf');
    expect(r.paginas).toBe(1);
    expect(r.texto).toContain('[Página 1]');
    expect(r.texto).toContain('PM10 en Kennedy: 80,24');
  });

  it('pasa un Excel a texto, hoja por hoja', async () => {
    const libro = new Workbook();
    const hoja = libro.addWorksheet('Octubre');
    hoja.addRow(['Estación', 'PM10']);
    hoja.addRow(['Kennedy', 80.24]);
    const datos = Buffer.from(await libro.xlsx.writeBuffer());
    const r = await ex.extraer(datos, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    expect(r.texto).toBe('[Hoja: Octubre]\nEstación | PM10\nKennedy | 80.24');
  });

  it('texto plano tal cual, sin BOM y con espacios normalizados', async () => {
    expect((await ex.extraer(Buffer.from('﻿hola   mundo\r\n\r\n\r\nadiós'), 'text/plain')).texto).toBe('hola mundo\n\nadiós');
    expect(limpiar('  a \t b  ')).toBe('a b');
  });
});

describe('ContextoService', () => {
  const memoria = { buscar: jest.fn() };
  const ctx = new ContextoService(memoria as never);
  beforeEach(() => memoria.buscar.mockReset());

  it('si los documentos caben, van completos dentro del mensaje que los trajo', async () => {
    const hist = [mensaje(1, 'usuario', 'resume el informe'), mensaje(2, 'asistente', 'ok'), mensaje(3, 'usuario', '¿y Kennedy?')];
    const { mensajes, uso } = await ctx.armar(hist, new Map([[1, [adjunto({ texto: 'Kennedy excedió el 28-oct' })]]]), modelo());
    expect(uso).toEqual({ modo: 'completo', archivos: 1, fragmentos: 0 });
    expect(mensajes[0].contenido).toMatch(/^<archivo nombre="informe.pdf" tipo="documento" paginas="1">\nKennedy excedió el 28-oct\n<\/archivo>\n\nresume el informe$/);
    expect(memoria.buscar).not.toHaveBeenCalled();
  });

  it('si no caben, usa la memoria vectorial: fragmentos relevantes en el último mensaje (RAG)', async () => {
    memoria.buscar.mockResolvedValue([{ nombre: 'informe.pdf', orden: 4, similitud: 0.81, texto: 'Kennedy PM2.5 41,29' }]);
    const largo = adjunto({ texto: 'x'.repeat(50_000) });
    const { mensajes, uso } = await ctx.armar([mensaje(1, 'usuario', '¿qué pasó en Kennedy?')], new Map([[1, [largo]]]), modelo({ maxCaracteresDocumentos: 12_000 }));
    expect(uso).toEqual({ modo: 'fragmentos', archivos: 1, fragmentos: 1 });
    expect(memoria.buscar).toHaveBeenCalledWith('¿qué pasó en Kennedy?', 10, ['a1']);
    expect(mensajes[0].contenido).toContain('<fragmentos_relevantes>\n[«informe.pdf», fragmento 5 · similitud 0.81]\nKennedy PM2.5 41,29');
    expect(mensajes[0].contenido).not.toContain('xxxx');
  });

  it('sin memoria vectorial (Ollama caído) recorta cada documento en proporción', async () => {
    memoria.buscar.mockRejectedValue(new Error('Ollama no responde'));
    const { mensajes, uso } = await ctx.armar([mensaje(1, 'usuario', 'resume')], new Map([[1, [adjunto({ texto: 'y'.repeat(20_000) })]]]), modelo());
    expect(uso.modo).toBe('recortado');
    expect(mensajes[0].contenido).toContain('recortado: no cabía entero');
    expect(mensajes[0].contenido.length).toBeLessThan(11_000);
  });

  it('la nota de voz dictada no se repite (su texto ya es el mensaje); las imágenes van como archivo en el último', async () => {
    const voz = adjunto({ chatAdjuntoId: 'v', tipo: 'audio', nombre: 'nota.webm', mime: 'audio/webm', texto: 'hola desde el micrófono', dictado: true });
    const img = adjunto({ chatAdjuntoId: 'i', tipo: 'imagen', nombre: 'grafico.png', mime: 'image/png', texto: null });
    const { mensajes } = await ctx.armar([mensaje(1, 'usuario', 'hola desde el micrófono')], new Map([[1, [voz, img]]]), modelo({ entradas: ['imagen'] }));
    expect(mensajes[0].contenido).toBe('hola desde el micrófono');
    expect(mensajes[0].archivos).toEqual([{ nombre: 'grafico.png', mime: 'image/png', base64: Buffer.from('x').toString('base64') }]);
  });

  it('la nota de voz dictada enviada con la caja vacía sí le llega al modelo (regresión 2026-11-11)', async () => {
    const voz = adjunto({ chatAdjuntoId: 'v', tipo: 'audio', nombre: 'nota.webm', mime: 'audio/webm', texto: 'Necesito que me digas para qué sirve este agente.', dictado: true });
    const { mensajes } = await ctx.armar([mensaje(1, 'usuario', 'Revisa los archivos adjuntos.')], new Map([[1, [voz]]]), modelo());
    expect(mensajes[0].contenido).toContain('[Nota de voz transcrita: Necesito que me digas para qué sirve este agente.]');
    // corregida a mano en la caja: no se repite
    const { mensajes: m2 } = await ctx.armar([mensaje(1, 'usuario', 'necesito que me digas para que sirve este agente de reportes')], new Map([[1, [voz]]]), modelo());
    expect(m2[0].contenido).not.toContain('Nota de voz');
  });

  it('valida: imágenes en un modelo sin visión y PDF escaneado fuera de Claude', () => {
    expect(() => ctx.validar([adjunto({ tipo: 'imagen', mime: 'image/png' })], modelo())).toThrow(/no ve imágenes/);
    expect(() => ctx.validar([adjunto({ texto: null })], modelo())).toThrow(/no tiene texto/);
    expect(() => ctx.validar([adjunto({ texto: null })], modelo({ entradas: ['imagen', 'pdf'] }))).not.toThrow();
  });
});
