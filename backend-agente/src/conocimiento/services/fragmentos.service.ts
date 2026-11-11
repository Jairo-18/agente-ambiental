import { Injectable } from '@nestjs/common';
import { FragmentoNorma } from '../../shared/repositories/normaFragmento.repository';
import { Rango } from '../interfaces/base-conocimiento.interface';
import { ConocimientoService } from './conocimiento.service';

const NIVELES: [clave: 'prevencion' | 'alerta' | 'emergencia', etiqueta: string][] = [
  ['prevencion', 'prevención'], ['alerta', 'alerta'], ['emergencia', 'emergencia'],
];
const PROMEDIO: Record<string, string> = { anual: 'anual', '24h': 'de 24 horas', '8h': 'de 8 horas', '1h': 'de 1 hora' };
const UNIDAD: Record<string, string> = { ppb: 'partes por billón (ppb)', ppm: 'partes por millón (ppm)' };

const num = (v: number) => String(v);
const rango = (r: Rango) => `desde ${num(r[0])} µg/m³` + (r[1] !== null ? ` hasta ${num(r[1])} µg/m³` : ' sin tope superior');
const compactar = (s: string) => s.split(/\s+/).filter(Boolean).join(' ');

/**
 * La norma partida en fragmentos de texto autocontenidos, con clave estable, tipo y fuente. El buscador vectorial
 * los indexa y, al responder, cita la clave: así cada cita se puede comprobar contra este texto. Las cifras se
 * escriben tal cual están en el YAML para que el verificador de cifras pueda contrastar una respuesta.
 */
@Injectable()
export class FragmentosService {
  constructor(private readonly conocimiento: ConocimientoService) {}

  construir(): FragmentoNorma[] {
    const base = this.conocimiento.base;
    const nombre = (c: string) => base.contaminantes[c].nombre;
    const out: FragmentoNorma[] = [];
    const agregar = (clave: string, tipo: string, titulo: string, texto: string, fuente: string, verificado = true) =>
      out.push({ clave, tipo, titulo, texto: compactar(texto), fuente, verificado });

    const n = base.norma;
    agregar('NORMA-GENERAL', 'norma', 'Resolución 2254 de 2017',
      `La ${n.nombre} del ${n.emisor} se expidió el ${n.expedicion}, tiene vigencia desde ${n.vigencia_desde} y deroga ` +
      `las ${n.deroga.join(' y ')}. Fija los niveles máximos permisibles de contaminantes criterio en el aire ambiente en ` +
      `Colombia. Vigencia verificada el ${n.estado_verificado.fecha}: ${n.estado_verificado.evidencia}`,
      `${n.nombre}, Diario Oficial ${n.diario_oficial}`);

    for (const r of base.limites) {
      const extra = r.limite_inicial !== undefined
        ? ` Entre el 2018-01-01 y el 2018-06-30 rigió un límite inicial de ${num(r.limite_inicial)} µg/m³; desde el 2018-07-01 es ${num(r.limite)} µg/m³.`
        : '';
      agregar(r.id, 'limite', `Límite ${r.contaminante} ${PROMEDIO[r.promedio]}`,
        `El nivel máximo permisible de ${nombre(r.contaminante)} (${r.contaminante}) para un promedio ${PROMEDIO[r.promedio]} es ` +
        `${num(r.limite)} µg/m³ a condiciones de referencia.${extra}`, r.fuente);
    }

    agregar('CRIT-PUNTO-MONITOREO', 'criterio', 'Evaluación por punto de monitoreo',
      'La concentración de un contaminante se evalúa por cada punto de monitoreo. El promedio de diferentes puntos no es ' +
      'válido para evaluar el cumplimiento de la norma.', base.criterios_evaluacion.fuente);

    for (const r of base.metas_2030) {
      agregar(r.id, 'meta', `Meta 2030 ${r.contaminante} ${PROMEDIO[r.promedio]}`,
        `A partir del 2030-01-01 el nivel máximo permisible de ${r.contaminante} para un promedio ${PROMEDIO[r.promedio]} baja a ` +
        `${num(r.limite)} µg/m³. Lo que no figura en esta tabla conserva los valores de la Tabla 1.`, r.fuente);
    }

    for (const r of base.niveles_excepcionales) {
      const partes = NIVELES.map(([clave, etiqueta]) => `${etiqueta} ${rango(r[clave])}`);
      const extra = r.contaminante === 'NO2'
        ? ' Observación: el nivel de prevención de NO2 empieza en 190 µg/m³, por debajo de su límite horario de 200 µg/m³; ' +
          'así figura en el texto de la norma. Cada tabla se aplica por separado.'
        : '';
      agregar(`NIV-${r.contaminante.replace('.', '')}-${r.promedio.toUpperCase()}`, 'nivel',
        `Niveles de prevención, alerta y emergencia ${r.contaminante} ${PROMEDIO[r.promedio]}`,
        `Para ${nombre(r.contaminante)} (${r.contaminante}) con promedio ${PROMEDIO[r.promedio]}: nivel de ${partes[0]}; ` +
        `nivel de ${partes[1]}; nivel de ${partes[2]}.${extra}`, base.niveles_excepcionales_fuente);
    }

    agregar('TOXICOS', 'limite', 'Contaminantes tóxicos (Tabla 3)',
      'Niveles máximos permisibles de contaminantes tóxicos: ' +
      base.toxicos.map((t) => `${t.contaminante} ${num(t.limite)} µg/m³ (promedio ${t.promedio})`).join('; ') +
      '. La RMCAB no los mide en las estaciones de este proyecto.', 'Res. 2254/2017, Art. 4, Tabla 3');

    for (const r of base.ica_categorias) {
      agregar(`ICA-${r.rango[0]}-${r.rango[1]}`, 'ica', `ICA ${r.estado}`,
        `Un Índice de Calidad del Aire entre ${r.rango[0]} y ${r.rango[1]} corresponde al color ${r.color} y al estado ` +
        `«${r.estado}». Efectos en salud: ${r.efectos}`, base.ica_categorias_fuente);
    }

    const i = base.informes;
    agregar('INFORMES', 'criterio', 'Informes de calidad del aire',
      `Las autoridades ambientales deben publicar como mínimo informes ${i.periodicidad_minima.join(', ')}. Si hay ` +
      'incumplimiento por fenómenos meteorológicos atípicos o transporte global de contaminantes, el informe debe incluir ' +
      'la evaluación técnica de esas circunstancias.', i.fuente);

    const cr = base.condiciones_referencia;
    agregar('CONDICIONES-REFERENCIA', 'metodo', 'Condiciones de referencia de las concentraciones',
      `Las concentraciones se expresan en µg/m³ a condiciones de referencia de ${cr.temperatura_c} °C y ${cr.presion_mmhg} ` +
      'mmHg. Los gases que la RMCAB reporta en ppb o ppm se convierten a µg/m³ con un factor propio de cada gas, que se ' +
      'multiplica por la concentración.', base.factores_conversion_fuente);
    for (const [g, f] of Object.entries(base.factores_conversion)) {
      agregar(`CONV-${g}`, 'metodo', `Conversión de ${nombre(g)} (${g}) de ${f.de} a µg/m³`,
        `Para convertir ${nombre(g)} (${g}) de ${UNIDAD[f.de]} a µg/m³ se multiplica la concentración en ${f.de} por ` +
        `${num(f.factor)}, a condiciones de referencia de ${cr.temperatura_c} °C y ${cr.presion_mmhg} mmHg. La fórmula es ` +
        `factor = masa molar × presión / (R × temperatura) con masa molar ${num(f.masa_molar)} g/mol.`,
        base.factores_conversion_fuente);
    }

    const d = base.datos_validos;
    agregar('DATOS-VALIDOS', 'metodo', 'Representatividad temporal mínima',
      `Para que una estación cuente en los cálculos de un periodo debe tener al menos ${d.representatividad_temporal_minima_pct} % ` +
      `de datos válidos; si no, ${d.si_no_cumple}.`, d.fuente);

    const v = base.validez_promedios;
    agregar('SUPUESTO-VALIDEZ-PROMEDIOS', 'supuesto', 'Validez de promedios de 24 h y 8 h (supuesto del proyecto)',
      `Supuesto del proyecto, no confirmado en la norma: un promedio de 24 horas es válido con al menos ${v.min_horas['24h']} ` +
      `horas y uno de 8 horas con al menos ${v.min_horas['8h']} horas. El promedio de 24 horas es el día calendario y el de ` +
      '8 horas es una media móvil retrospectiva.', v.fuente, false);

    // --- reportes ciudadanos de Bogotá: normas, rutas por tipo, canales oficiales y el criterio de prioridad ---
    const rc = this.conocimiento.reportesCiudadanos;
    for (const nr of rc.normas) agregar(nr.clave, 'norma', nr.titulo, nr.texto, nr.fuente, nr.verificado);
    for (const [clave, t] of Object.entries(rc.tipos)) {
      const canales = t.canales.map((c) => rc.canales[c]?.nombre).filter(Boolean).join('; ');
      agregar(`RUTA-TIPO-${clave.toUpperCase()}`, 'ruta', `Dónde reportar: ${t.nombre}`,
        `En ${rc.territorio}, un reporte de ${t.nombre.toLowerCase()} lo atiende: ${t.entidad}. Canales oficiales: ${canales}. ` +
        `Para reportarlo conviene dar: ${t.datos_a_pedir.join('; ')}.`, `Base de reportes ciudadanos, consultada el ${rc.consultado}`);
    }
    for (const [clave, c] of Object.entries(rc.canales)) {
      agregar(`CANAL-${clave}`, 'canal', c.nombre, `${c.nombre}: ${c.detalle}`, c.fuente, c.verificado);
    }
    const rp = rc.reglas_prioridad;
    agregar('CRITERIO-PRIORIDAD-REPORTES', 'supuesto', 'Cómo se prioriza un reporte ciudadano (criterio del proyecto)',
      'Criterio del proyecto, no es una norma: cada tipo de reporte tiene un puntaje base y se suman puntos si hay peligro para ' +
      'personas (además se trata como emergencia y se indica llamar al 123), si está pasando ahora, si afecta a un hospital, ' +
      `colegio, jardín infantil o humedal, si es recurrente o si es ruido nocturno. Prioridad alta desde ${rp.umbrales.alta} puntos, ` +
      `media desde ${rp.umbrales.media}, baja por debajo.`, rp.fuente, false);
    agregar('AVISO-RADICADO', 'supuesto', 'El radicado de este agente no es oficial', rc.aviso_radicado, 'Proyecto', false);

    agregar('LIMITES-DE-LA-BASE', 'supuesto', 'Lo que la base de conocimiento no tiene',
      'Pendientes de la base de conocimiento: ' + base.pendientes.map((p, k) => `(${k + 1}) ${p}`).join(' '),
      'Proyecto: pendientes del YAML', false);
    return out;
  }
}
