import { RepoEvaluacionFalso } from '../../../test/helpers/dobles';
import { crearNorma } from '../../../test/helpers/servicios';
import { EvaluacionesService } from './evaluaciones.service';

const crear = () => {
  const repo = new RepoEvaluacionFalso();
  return { servicio: new EvaluacionesService(crearNorma().reglas, repo as never), repo };
};

describe('EvaluacionesService', () => {
  it('evalúa con el motor de reglas y guarda un registro de auditoría', async () => {
    const { servicio, repo } = crear();
    const r = await servicio.evaluar({ contaminante: 'PM2.5', promedio: '24h', valor: 41.29 });
    expect(r).toMatchObject({ estado: 'excede', nivel_excepcional: 'prevencion', valor_ugm3: 41.29 });
    expect(r.reglas).toEqual(['LIM-PM25-24H', 'NIV-PM25-24H-PREVENCION']);
    expect(r.explicacion).toHaveLength(2);
    expect(repo.guardadas).toHaveLength(1);
    expect(repo.guardadas[0]).toMatchObject({ contaminante: 'PM2.5', valor: 41.29, unidad: 'µg/m3', estado: 'excede', nivel: 'prevencion' });
  });

  it('convierte unidades y redondea la cifra que se muestra', async () => {
    const { servicio } = crear();
    expect(await servicio.evaluar({ contaminante: 'NO2', promedio: '1h', valor: 100, unidad: 'ppb' })).toMatchObject({ valor_ugm3: 188.04, estado: 'cumple' });
  });

  it('un promedio sin regla no declara cumplimiento', async () => {
    const { servicio } = crear();
    expect((await servicio.evaluar({ contaminante: 'PM10', promedio: '1h', valor: 10 })).estado).toBe('sin_regla');
  });

  it('una unidad incompatible es un error', async () => {
    const { servicio, repo } = crear();
    await expect(servicio.evaluar({ contaminante: 'PM10', promedio: '24h', valor: 10, unidad: 'ppb' })).rejects.toThrow();
    expect(repo.guardadas).toHaveLength(0); // lo que falla no queda registrado como una evaluación
  });
});
