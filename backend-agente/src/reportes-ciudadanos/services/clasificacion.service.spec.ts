import { crearCiudadanos } from '../../../test/helpers/dobles';
import { coincidencias, normalizar } from './clasificacion.service';

const { clasificacion, servicio } = crearCiudadanos();

describe('normalizar y coincidencias', () => {
  it('sin tildes, minúsculas y palabras completas (árbol = arbol; "rio" no coincide dentro de "Rionegro")', () => {
    expect(normalizar('¡Están TALANDO un Árbol!')).toBe('estan talando un arbol');
    expect(coincidencias(normalizar('quemaron un árbol'), ['arbol', 'quema'])).toEqual(['arbol']);
    expect(coincidencias(normalizar('vivo en Rionegro'), ['rio'])).toEqual([]);
  });
});

describe('ClasificacionService: tipo por reglas', () => {
  it.each([
    ['están tirando escombros y bolsas de basura en el andén', 'residuos'],
    ['un señor con motosierra está talando un árbol del parque', 'arbolado'],
    ['están quemando llantas, hay mucho humo y llamas', 'quema'],
    ['la discoteca pone música a todo volumen, no deja dormir', 'ruido'],
    ['la fábrica bota humo negro por la chimenea y hay mal olor', 'aire'],
    ['vierten aguas negras al humedal, hay espuma y peces muertos', 'agua'],
    ['quiero felicitar a los barrenderos', 'otro'],
    // regresiones de la evaluación (evaluacion/casos.yaml, W2 y Q4)
    ['en la quebrada La Vieja hay basura y escombros dentro del agua', 'agua'],
    ['los vecinos queman basura cada fin de semana en el andén', 'quema'],
  ])('«%s» → %s', (texto, tipo) => {
    expect(clasificacion.tipoPorReglas(texto).tipo).toBe(tipo);
  });

  it('decide: las reglas mandan si tienen evidencia clara; si no, la propuesta válida del modelo', () => {
    expect(clasificacion.decidirTipo('hay escombros y basura en la esquina', 'ruido')).toMatchObject({ tipo: 'residuos', tipoModelo: 'ruido', tipoReglas: 'residuos' });
    expect(clasificacion.decidirTipo('algo raro pasa en el caño del barrio', 'agua')).toMatchObject({ tipo: 'agua', tipoReglas: 'otro' });
    expect(clasificacion.decidirTipo('algo raro', 'inventado')).toMatchObject({ tipo: 'otro', tipoModelo: null });
    expect(clasificacion.decidirTipo('hay basura', 'residuos').decision).toContain('coinciden');
  });
});

describe('ClasificacionService: prioridad (criterio del proyecto en el YAML)', () => {
  it('quema con fuego activo ahora: alta y EMERGENCIA', () => {
    const p = clasificacion.prioridad('quema', 'se está quemando un lote, hay llamas', true);
    expect(p).toMatchObject({ prioridad: 'alta', emergencia: true });
    expect(p.puntaje).toBe(3 + 3 + 1);
  });

  it('árbol a punto de caer sobre los cables: emergencia aunque no esté "en curso"', () => {
    expect(clasificacion.prioridad('arbolado', 'el árbol está inclinado y se va a caer sobre los cables', false)).toMatchObject({ prioridad: 'alta', emergencia: true });
  });

  it('lo negado no cuenta como peligro ("no hay llamas")', () => {
    expect(clasificacion.prioridad('quema', 'quemaron basura ayer pero no hay llamas ya', false)).toMatchObject({ prioridad: 'media', emergencia: false });
  });

  it('ruido: nocturno y recurrente suben; basura ocasional queda baja', () => {
    expect(clasificacion.prioridad('ruido', 'fiesta con música todas las noches, no deja dormir', true)).toMatchObject({ prioridad: 'alta', puntaje: 1 + 1 + 1 + 1 });
    expect(clasificacion.prioridad('residuos', 'dejaron una bolsa de basura en la esquina', false)).toMatchObject({ prioridad: 'baja', puntaje: 1 });
  });

  it('un lugar sensible (colegio, humedal) suma', () => {
    expect(clasificacion.prioridad('agua', 'vierten aceite al humedal', true).motivos.some((m) => m.includes('humedal'))).toBe(true);
  });
});

describe('ClasificacionService: "en curso" lo dice el texto', () => {
  it.each([
    ['están quemando basura en el lote', true],
    ['un camión está botando escombros', true],
    ['hay una fiesta ahora mismo', true],
    ['botaron escombros en el andén', false],
    ['un taller hace ruido durante el día', false],
  ])('«%s» → %s', (texto, esperado) => {
    expect(clasificacion.pasaAhora(texto)).toBe(esperado);
  });
});

describe('ReportesCiudadanosService.analizar (regresiones de la evaluación)', () => {
  it('el lugar sensible cuenta aunque el modelo lo ponga en la dirección (R4, N4)', () => {
    const a = servicio.analizar({ descripcion: 'hay un botadero de basura y llantas', direccion: 'frente al colegio de la calle 56 sur con carrera 19', enCurso: false });
    expect(a.prioridad).toMatchObject({ prioridad: 'media', puntaje: 2 });
  });

  it('por el agente, "en curso" del modelo no cuenta si el texto no lo dice (R1)', () => {
    const d = { descripcion: 'botaron escombros y un colchón viejo en el andén', direccion: 'carrera 50 con calle 3', enCurso: true };
    expect(servicio.analizar(d, '', { verificarEnCurso: true })).toMatchObject({ enCurso: false, prioridad: { prioridad: 'baja' } });
    expect(servicio.analizar(d)).toMatchObject({ enCurso: true, prioridad: { prioridad: 'media' } }); // formulario: lo marcó la persona
  });
});

describe('ClasificacionService: enrutamiento y localidad', () => {
  it('cada tipo tiene entidad y canales oficiales del YAML', () => {
    const ruido = clasificacion.enrutar('ruido');
    expect(ruido.entidad).toContain('SDA');
    expect(ruido.canales.map((c) => c.clave)).toEqual(['SDA-RUIDO', 'EMERGENCIAS-123', 'SDA-ATENCION']);
    expect(ruido.canales[0].detalle).toContain('3778936');
    expect(clasificacion.enrutar('quema').canales[0].clave).toBe('EMERGENCIAS-123');
  });

  it('encuentra la localidad en el campo o en la dirección, con su nombre oficial', () => {
    expect(clasificacion.localidad(null, 'cra 80 con calle 38 sur, kennedy')).toBe('Kennedy');
    expect(clasificacion.localidad('rafael uribe uribe')).toBe('Rafael Uribe Uribe');
    expect(clasificacion.localidad('ciudad bolivar')).toBe('Ciudad Bolívar');
    expect(clasificacion.localidad(null, 'en mi casa')).toBeNull();
  });
});

describe('ReportesCiudadanosService', () => {
  it('crea con radicado, tipo por reglas, prioridad, entidad y canales; sin Ollama no busca duplicados pero guarda', async () => {
    const r = await servicio.crear(
      { descripcion: 'Están quemando basura en el lote, hay llamas y humo', direccion: 'Calle 38 sur con 80, Kennedy', enCurso: true, tipoPropuesto: 'quema' },
      { canal: 'voz', autor: 'agente' },
    );
    expect(r).toMatchObject({ radicado: 'RA-2026-00001', tipo: 'quema', localidad: 'Kennedy', prioridad: 'alta', emergencia: true, canal: 'voz', estado: 'recibido' });
    expect(r.canales_oficiales[0]).toContain('123');
    expect(r.clasificacion).toEqual({ tipo_modelo: 'quema', tipo_reglas: 'quema' });
    expect(r.posibles_duplicados).toEqual([]);
  });

  it('sin descripción o sin dirección no se registra', async () => {
    await expect(servicio.crear({ descripcion: 'basura', direccion: 'x', enCurso: false }, { canal: 'texto', autor: 'agente' })).rejects.toThrow(/describir/);
    await expect(servicio.crear({ descripcion: 'hay basura en la calle', direccion: '', enCurso: false }, { canal: 'texto', autor: 'agente' })).rejects.toThrow(/dirección/);
  });
});
