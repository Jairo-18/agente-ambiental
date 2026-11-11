import { Injectable } from '@nestjs/common';
import {
  AlignmentType, Document, HeadingLevel, ImageRun, LevelFormat, Packer, Paragraph, ShadingType, Table, TableCell, TableLayoutType,
  TableRow, TextRun, WidthType,
} from 'docx';
import { Disponible, niveles, recorrer } from '../../analisis/hechos.util';
import { Hechos } from '../../analisis/interfaces/analisis.interface';
import { ConocimientoService } from '../../conocimiento/services/conocimiento.service';
import { Redaccion } from '../../redaccion/services/redaccion.service';
import { TEXTO_NIVEL } from '../../shared/constants/aire.constants';
import { diaTexto, mesTexto } from '../../shared/utils/fechas.util';
import { n2 } from '../../shared/utils/numeros.util';
import { Figura } from './graficos.service';

export interface EntradaDocx {
  hechos: Hechos;
  textos: Record<string, Redaccion>;
  figuras: { pm10: Figura | null; pm25: Figura | null; gases: Figura | null };
  fechaGeneracion: string;
  /** Fecha en que se descargaron los datos, si se conoce. */
  descarga?: string;
}

const ANCHO_IMAGEN_PX = 586; // 15,5 cm
const CM_A_DXA = 567;
const BORDE = { style: 'single' as const, size: 4, color: 'BFBFBF' };
const BORDES = { top: BORDE, bottom: BORDE, left: BORDE, right: BORDE };

/** El informe en Word. Misma estructura de 12 secciones que el esquema `esquema_reporte_aire_mensual`. */
@Injectable()
export class ReporteDocxService {
  constructor(private readonly conocimiento: ConocimientoService) {}

  async construir(e: EntradaDocx): Promise<Buffer> {
    const { hechos, textos, figuras } = e;
    const base = this.conocimiento.base;
    const ref = this.conocimiento.estaciones;
    const estaciones = Object.keys(hechos.estaciones);
    const conReferencia = estaciones.filter((est) => est in ref);
    const hijos: (Paragraph | Table)[] = [];

    const parrafo = (texto: string, italica = false) => new Paragraph({ spacing: { after: 120 }, children: [new TextRun({ text: texto, italics: italica })] });
    const h1 = (texto: string) => new Paragraph({ heading: HeadingLevel.HEADING_1, text: texto });
    const h2 = (texto: string) => new Paragraph({ heading: HeadingLevel.HEADING_2, text: texto });
    const viñeta = (texto: string) => new Paragraph({ numbering: { reference: 'vinetas', level: 0 }, children: [new TextRun(texto)] });

    /** Tabla con encabezado repetido en cada página y filas que no se parten entre páginas. */
    const tabla = (encabezados: string[], filas: (string | number)[][], anchosCm?: number[]) => {
      const dxa = anchosCm?.map((c) => Math.round(c * CM_A_DXA));
      const celda = (texto: string, i: number, cabecera = false) =>
        new TableCell({
          borders: BORDES,
          ...(dxa ? { width: { size: dxa[i], type: WidthType.DXA } } : {}),
          ...(cabecera ? { shading: { type: ShadingType.CLEAR, fill: 'D9E2F3', color: 'auto' } } : {}),
          margins: { top: 40, bottom: 40, left: 80, right: 80 },
          children: [new Paragraph({ children: [new TextRun({ text: texto, bold: cabecera, size: 18 })] })],
        });
      return new Table({
        width: { size: 100, type: WidthType.PERCENTAGE },
        ...(dxa ? { columnWidths: dxa, layout: TableLayoutType.FIXED } : {}),
        rows: [
          new TableRow({ tableHeader: true, cantSplit: true, children: encabezados.map((h, i) => celda(h, i, true)) }),
          ...filas.map((f) => new TableRow({ cantSplit: true, children: f.map((v, i) => celda(String(v), i)) })),
        ],
      });
    };
    const espacio = () => new Paragraph({ text: '' });

    const figura = (f: Figura | null, pie: string) => {
      if (!f) return [parrafo('No hay series evaluables para graficar.', true)];
      return [
        new Paragraph({
          alignment: AlignmentType.CENTER,
          children: [new ImageRun({
            type: 'png', data: f.png, transformation: { width: ANCHO_IMAGEN_PX, height: Math.round((ANCHO_IMAGEN_PX * f.alto) / f.ancho) },
            altText: { name: pie, title: pie, description: pie },
          })],
        }),
        new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 120 }, children: [new TextRun({ text: pie, italics: true })] }),
      ];
    };

    const tablaContaminante = (contaminantes: string[]) => {
      const filas: string[][] = [];
      for (const [est, c, x] of recorrer(hechos, contaminantes)) {
        if (!x.disponible) {
          filas.push([est, c, '—', 'sin datos', '—', '—', '—', '—', '—']);
          continue;
        }
        for (const [t, p] of Object.entries((x as Disponible).promedios)) {
          let maximo: string, cumple: string, exc: string;
          if ((x as Disponible).evaluable) {
            maximo = p.maximo ? `${n2(p.maximo.valor_ugm3)} (${diaTexto(p.maximo.fecha_hora)})` : '—';
            cumple = p.cumple ? 'Sí' : 'No';
            exc = String(p.n_excedencias);
          } else {
            maximo = p.indicativo ? `${n2(p.indicativo.maximo.valor_ugm3)} (indicativo)` : '—';
            [cumple, exc] = ['No evaluable', '—'];
          }
          filas.push([est, c, t, `${n2((x as Disponible).representatividad_pct)} %`, n2((x as Disponible).media_mensual_ugm3), n2(p.limite_ugm3), maximo, exc, cumple]);
        }
      }
      return tabla(['Estación', 'Contaminante', 'Prom.', 'Datos válidos', 'Media mensual µg/m³', 'Límite µg/m³', 'Máximo µg/m³ (cuándo)', 'Excedencias', 'Cumple'], filas);
    };

    // --- portada ---
    hijos.push(
      new Paragraph({ heading: HeadingLevel.TITLE, text: `Informe mensual de calidad del aire — ${mesTexto(hechos.meta.periodo)}` }),
      parrafo('Bogotá D.C. · Red de Monitoreo de Calidad del Aire de Bogotá (RMCAB)'),
      parrafo(`Estaciones: ${estaciones.join(', ')}`),
      parrafo(`Generado automáticamente el ${e.fechaGeneracion} (${hechos.meta.esquema}). Datos preliminares; no reemplaza el informe oficial de la Secretaría Distrital de Ambiente.`, true),
    );

    // --- 1 resumen · 2 introducción ---
    hijos.push(h1('1. Resumen'), parrafo(textos.resumen.texto));
    hijos.push(
      h1('2. Introducción'),
      parrafo(
        'La RMCAB mide en estaciones automáticas los contaminantes criterio PM10, PM2.5, O3, SO2, NO2 y CO y variables meteorológicas. ' +
        `Este informe compara los promedios de corto plazo de cada estación con los niveles máximos permisibles de la ${base.norma.nombre} ` +
        `(${base.norma.emisor}). El cumplimiento se evalúa por punto de monitoreo, sin promediar estaciones (Art. 2, parágrafo 2).`,
      ),
      tabla(['Estación', 'Sigla', 'Localidad', 'Tipo de zona', 'Tipo de estación'], conReferencia.map((s) => [s, ref[s].sigla, ref[s].localidad, ref[s].tipo_zona, ref[s].tipo_estacion])),
      espacio(),
    );

    // --- 3 calidad de los datos ---
    hijos.push(
      h1('3. Calidad y representatividad de los datos'),
      parrafo(`Una serie necesita al menos ${base.datos_validos.representatividad_temporal_minima_pct} % de horas válidas en el mes para evaluarse; si no, se presenta como indicativa.`),
    );
    const filasCalidad: string[][] = [];
    for (const [est, c, x] of recorrer(hechos)) {
      filasCalidad.push(
        x.disponible
          ? [est, c, `${x.n_validos} de ${x.n_esperados}`, `${n2(x.representatividad_pct)} %`, x.evaluable ? 'Sí' : 'No']
          : [est, c, 'sin datos', '—', 'No'],
      );
    }
    hijos.push(tabla(['Estación', 'Contaminante', 'Horas válidas', 'Representatividad', 'Evaluable'], filasCalidad), espacio());
    const avisos = hechos.advertencias.filter((a) => a.severidad === 'aviso' || a.severidad === 'error');
    if (avisos.length) {
      hijos.push(parrafo('Advertencias del control de calidad:'), tabla(['Severidad', 'Código', 'Detalle'], avisos.map((a) => [a.severidad, a.codigo, a.mensaje])), espacio());
    }

    // --- 4 meteorología ---
    hijos.push(h1('4. Variables meteorológicas'));
    hijos.push(
      tabla(
        ['Estación', 'Lluvia total mm / días con lluvia', 'Temperatura °C media (mín. a máx.)', 'Viento m/s medio (máx.)'],
        Object.entries(hechos.estaciones).map(([est, { meteorologia: m }]) => [
          est,
          m.precipitacion.disponible ? `${n2(m.precipitacion.total_mm)} / ${m.precipitacion.dias_con_lluvia}` : '—',
          m.temperatura.disponible ? `${n2(m.temperatura.media_c)} (${n2(m.temperatura.minima_c)} a ${n2(m.temperatura.maxima_c)})` : '—',
          m.viento_velocidad.disponible ? `${n2(m.viento_velocidad.media_ms)} (máx. ${n2(m.viento_velocidad.maxima_ms)})` : '—',
        ]),
      ),
      espacio(),
    );
    for (const d of hechos.meta.definiciones_meteorologia) hijos.push(parrafo(d.replace(/`/g, ''), true));

    // --- 5 PM10 · 6 PM2.5 · 7 gases ---
    hijos.push(h1('5. Material particulado PM10'), tablaContaminante(['PM10']), espacio(), ...figura(figuras.pm10, 'Figura 1. PM10, promedio de 24 h por estación.'), parrafo(textos.comentario_pm10.texto));
    hijos.push(h1('6. Material particulado PM2.5'), tablaContaminante(['PM2.5']), espacio(), ...figura(figuras.pm25, 'Figura 2. PM2.5, promedio de 24 h por estación.'), parrafo(textos.comentario_pm25.texto));
    hijos.push(
      h1('7. Ozono, dióxido de azufre, dióxido de nitrógeno y monóxido de carbono'),
      parrafo('Los gases llegan en ppb o ppm y se convierten a µg/m³ a 25 °C y 760 mmHg antes de compararlos.'),
      tablaContaminante(['O3', 'SO2', 'NO2', 'CO']), espacio(),
      ...figura(figuras.gases, 'Figura 3. Media mensual de gases por estación.'), parrafo(textos.comentario_gases.texto),
    );

    // --- 8 niveles excepcionales ---
    hijos.push(h1('8. Eventos de contaminación y niveles excepcionales'));
    const nivs = niveles(hechos);
    if (nivs.length) {
      hijos.push(tabla(['Estación', 'Contaminante', 'Promedio', 'Cuándo', 'Valor µg/m³', 'Nivel', 'Regla'],
        nivs.map((n) => [n.estacion, n.contaminante, n.promedio, diaTexto(n.fecha_hora), n2(n.valor_ugm3), TEXTO_NIVEL[n.nivel], n.regla_id])), espacio());
    } else {
      hijos.push(parrafo('No se alcanzaron niveles de prevención, alerta ni emergencia en las series evaluables.'));
    }
    hijos.push(parrafo('Nota: en la Tabla 4 de la norma el nivel de prevención del NO2 (190 µg/m³) empieza por debajo de su límite horario (200 µg/m³); así figura en el texto de la resolución.', true));

    // --- 9 impacto en la salud ---
    hijos.push(
      h1('9. Impacto en la salud'),
      parrafo(
        'Este informe no calcula el Índice de Calidad del Aire (ICA): los puntos de corte de la Tabla 6 de la Resolución 2254 de 2017 ' +
        'todavía no están cargados. Por eso no se asigna una categoría a cada estación ni se estiman efectos en la salud. Como ' +
        'referencia se transcribe la Tabla 5 de la norma.',
      ),
      tabla(['ICA', 'Color', 'Estado', 'Efectos (texto de la norma)'],
        base.ica_categorias.map((c) => [`${c.rango[0]}–${c.rango[1]}`, c.color, c.estado, c.efectos.split(/\s+/).filter(Boolean).join(' ')]), [1.8, 2.0, 3.4, 9.0]),
      espacio(),
    );

    // --- 10 conclusiones · 11 limitaciones ---
    hijos.push(h1('10. Conclusiones'), parrafo(textos.conclusiones.texto));
    const limites = [
      'Los datos de la RMCAB son preliminares y no tienen validación final de la Secretaría Distrital de Ambiente.',
      'Los límites anuales no se pueden evaluar con un solo mes.',
      `Las series con menos de ${base.datos_validos.representatividad_temporal_minima_pct} % de horas válidas se presentan como indicativas.`,
      'Este informe lo generó un sistema automático y no reemplaza el informe oficial de la Secretaría Distrital de Ambiente.',
      ...(e.descarga ? [`Fuente de los datos: RMCAB, descargados el ${e.descarga}.`] : []),
      ...hechos.meta.supuestos,
    ];
    if (Object.values(textos).some((t) => t.origen === 'llm')) {
      limites.push('Los párrafos interpretativos fueron redactados por un modelo de lenguaje local y verificados automáticamente: todas sus cifras existen en los hechos calculados.');
    }
    hijos.push(h1('11. Limitaciones y declaraciones'), ...limites.map(viñeta));

    // --- 12 anexos ---
    hijos.push(
      h1('12. Anexos'),
      h2('12.1 Características de las estaciones'),
      tabla(['Estación', 'Latitud', 'Longitud', 'Altitud m', 'Dirección'], conReferencia.map((s) => [s, ref[s].latitud, ref[s].longitud, ref[s].altitud_m, ref[s].direccion])),
      espacio(),
      h2('12.2 Niveles máximos permisibles aplicados'),
      tabla(['Regla', 'Contaminante', 'Promedio', 'Límite µg/m³', 'Fuente'], base.limites.map((x) => [x.id, x.contaminante, x.promedio, x.limite, x.fuente])),
      espacio(),
      h2('12.3 Factores de conversión a µg/m³'),
      tabla(['Gas', 'Unidad de origen', 'Factor'], Object.entries(base.factores_conversion).map(([g, f]) => [g, f.de, f.factor])),
    );

    const doc = new Document({
      creator: 'Agente de reportes ambientales',
      title: `Informe mensual de calidad del aire — ${mesTexto(hechos.meta.periodo)}`,
      styles: { default: { document: { run: { font: 'Calibri', size: 22 } } } },
      numbering: {
        config: [{
          reference: 'vinetas',
          levels: [{ level: 0, format: LevelFormat.BULLET, text: '•', alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 720, hanging: 360 } } } }],
        }],
      },
      sections: [{ children: hijos }],
    });
    return Packer.toBuffer(doc);
  }
}
