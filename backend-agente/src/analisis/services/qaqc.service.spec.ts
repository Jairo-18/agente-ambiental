import { crearAnalisis, serieSintetica } from '../../../test/helpers/servicios';
import { FilaLarga } from '../../datos/interfaces/fila.interface';
import { fmtFechaHora, HORA_MS } from '../../shared/utils/fechas.util';

const { qaqc, estadistica } = crearAnalisis();
const PERIODO = '2026-10';
const HORAS = estadistica.indice(PERIODO);
const serie = (o = {}) => serieSintetica(HORAS, o);
const codigos = (adv: { codigo: string }[]) => new Set(adv.map((a) => a.codigo));
const hallar = (adv: ReturnType<typeof qaqc.preparar>['advertencias'], codigo: string) => adv.find((a) => a.codigo === codigo)!;

describe('QaqcService.preparar', () => {
  it('el periodo tiene 744 horas de fin de periodo', () => {
    expect(HORAS).toHaveLength(744);
    expect(fmtFechaHora(HORAS[0])).toBe('2026-10-01 01:00:00');
    expect(fmtFechaHora(HORAS[743])).toBe('2026-11-01 00:00:00');
  });

  it('datos limpios solo traen el aviso de datos preliminares', () => {
    const { datos, advertencias } = qaqc.preparar(serie(), PERIODO);
    expect(codigos(advertencias)).toEqual(new Set(['DATOS_PRELIMINARES']));
    expect(datos).toHaveLength(744);
  });

  it('si faltan columnas lanza error y no sigue en silencio', () => {
    const sinValor = serie().map(({ valor, ...resto }) => resto) as unknown as FilaLarga[];
    expect(() => qaqc.preparar(sinValor, PERIODO)).toThrow(/valor/);
  });

  it('no modifica la entrada', () => {
    const d = serie();
    d[0].valor = -5;
    const copia = JSON.parse(JSON.stringify(d));
    qaqc.preparar(d, PERIODO);
    expect(d).toEqual(copia);
  });

  it('una fecha ilegible se excluye y se avisa', () => {
    const d = serie();
    d[3].fecha_hora = 'no es fecha';
    const { datos, advertencias } = qaqc.preparar(d, PERIODO);
    expect(hallar(advertencias, 'FECHA_INVALIDA')).toMatchObject({ severidad: 'error', cantidad: 1 });
    expect(datos).toHaveLength(743);
  });

  it('un valor no numérico pasa a faltante con aviso (un vacío es faltante, no error)', () => {
    const d = serie();
    d[5].valor = '----';
    d[6].valor = '';
    const { datos, advertencias } = qaqc.preparar(d, PERIODO);
    expect(hallar(advertencias, 'VALOR_NO_NUMERICO').cantidad).toBe(1);
    expect(datos.filter((x) => Number.isNaN(x.valor))).toHaveLength(2);
  });

  it('las filas fuera del periodo se excluyen y se avisa', () => {
    const extra = serie().slice(0, 5).map((f, i) => ({ ...f, fecha_hora: fmtFechaHora(HORAS[i] + 40 * 24 * HORA_MS) }));
    const { datos, advertencias } = qaqc.preparar([...serie(), ...extra], PERIODO);
    expect(hallar(advertencias, 'FUERA_DE_PERIODO').cantidad).toBe(5);
    expect(datos).toHaveLength(744);
  });

  it('una hora no exacta se excluye', () => {
    const d = serie();
    d[0].fecha_hora = fmtFechaHora(HORAS[0] + 30 * 60_000);
    const { datos, advertencias } = qaqc.preparar(d, PERIODO);
    expect(codigos(advertencias).has('HORA_NO_EXACTA')).toBe(true);
    expect(datos).toHaveLength(743);
  });

  it('un duplicado idéntico se colapsa y uno conflictivo queda faltante (no se elige al azar)', () => {
    const d = serie();
    const entrada = [...d, { ...d[10] }, { ...d[20], valor: 999 }];
    const { datos, advertencias } = qaqc.preparar(entrada, PERIODO);
    expect(hallar(advertencias, 'DUPLICADO_IDENTICO').cantidad).toBe(1);
    expect(hallar(advertencias, 'DUPLICADO_CONFLICTO').cantidad).toBe(1);
    expect(datos).toHaveLength(744);
    expect(datos.find((x) => x.t === HORAS[20])!.valor).toBeNaN();
    expect(datos.some((x) => x.valor === 999)).toBe(false);
  });

  it('una unidad mixta excluye la serie', () => {
    const d = serie({ variable: 'NO2', unidad: 'ppb' });
    d[0].unidad = 'µg/m3';
    const { datos, advertencias } = qaqc.preparar(d, PERIODO);
    expect(hallar(advertencias, 'UNIDAD_MIXTA').severidad).toBe('error');
    expect(datos).toEqual([]);
  });

  it('una unidad incompatible con el contaminante excluye la serie', () => {
    const { datos, advertencias } = qaqc.preparar(serie({ variable: 'PM10', unidad: 'ppb' }), PERIODO);
    expect(codigos(advertencias).has('UNIDAD_NO_CONVERTIBLE')).toBe(true);
    expect(datos).toEqual([]);
  });

  it('serie vacía y cobertura baja', () => {
    const vacia = serie({ variable: 'SO2', unidad: 'ppb', valores: NaN });
    const baja = serie({ variable: 'OZONO', unidad: 'ppb' });
    for (let i = 0; i < 400; i++) baja[i].valor = null; // 344 de 744 = 46 %
    const { advertencias } = qaqc.preparar([...vacia, ...baja], PERIODO);
    expect(advertencias.some((a) => a.codigo === 'SERIE_VACIA' && a.variable === 'SO2')).toBe(true);
    const a = hallar(advertencias, 'COBERTURA_BAJA');
    expect(a).toMatchObject({ variable: 'OZONO', cantidad: 344 });
    expect(a.mensaje).toContain('indicativos');
  });

  it('un hueco largo se avisa con su longitud', () => {
    const d = serie();
    for (let i = 100; i < 140; i++) d[i].valor = null; // 40 horas seguidas
    expect(hallar(qaqc.preparar(d, PERIODO).advertencias, 'HUECO_LARGO').cantidad).toBe(40);
  });

  it('los negativos se conservan pero se avisan', () => {
    const d = serie();
    d[7].valor = -2.5;
    const { datos, advertencias } = qaqc.preparar(d, PERIODO);
    expect(hallar(advertencias, 'NEGATIVOS').cantidad).toBe(1);
    expect(datos.filter((x) => x.valor === -2.5)).toHaveLength(1);
  });

  it('un sensor congelado se detecta', () => {
    const d = serie();
    for (let i = 50; i < 80; i++) d[i].valor = 17; // 30 horas idénticas
    expect(hallar(qaqc.preparar(d, PERIODO).advertencias, 'VALORES_REPETIDOS').cantidad).toBe(30);
  });

  it('los ceros repetidos no son un sensor congelado', () => {
    const { advertencias } = qaqc.preparar(serie({ variable: 'CO', unidad: 'ppm', valores: 0 }), PERIODO);
    expect(codigos(advertencias).has('VALORES_REPETIDOS')).toBe(false);
  });

  it('un valor atípico se avisa sin borrarlo', () => {
    const d = serie();
    d[9].valor = 400;
    const { datos, advertencias } = qaqc.preparar(d, PERIODO);
    expect(hallar(advertencias, 'ATIPICOS').severidad).toBe('info');
    expect(datos.filter((x) => x.valor === 400)).toHaveLength(1);
  });

  it('las variables sin norma no se revisan por negativos', () => {
    const { advertencias } = qaqc.preparar(serie({ variable: 'Temperatura', unidad: '°C', valores: -3 }), PERIODO);
    expect(codigos(advertencias)).toEqual(new Set(['DATOS_PRELIMINARES']));
  });

  it('cada advertencia trae estacion, variable y cantidad (null si no aplica)', () => {
    for (const a of qaqc.preparar(serie(), PERIODO).advertencias) {
      expect(Object.keys(a).sort()).toEqual(['cantidad', 'codigo', 'estacion', 'mensaje', 'severidad', 'variable']);
    }
  });
});
