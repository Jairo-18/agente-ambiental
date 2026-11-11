import { Injectable } from '@nestjs/common';
import { Workbook } from 'exceljs';
import { fmtFechaHora } from '../../shared/utils/fechas.util';
import { FilaLarga } from '../interfaces/fila.interface';

// Filas (base 0) del Excel de "Reporte de estaciones" de la RMCAB
const FILA_ESTACIONES = 2;
const FILA_VARIABLES = 3;
const FILA_UNIDADES = 4;
const FILA_INICIO_DATOS = 5;
const PATRON_FECHA = /^\d{2}-\d{2}-\d{4} \d{2}:\d{2}$/;
const FALTANTE = '----';

/** Una celda de exceljs a un valor simple (fórmulas, texto enriquecido y fechas incluidos). */
function simple(celda: unknown): unknown {
  if (celda && typeof celda === 'object') {
    const c = celda as { result?: unknown; richText?: { text: string }[]; text?: string };
    if ('result' in c) return c.result;
    if (c.richText) return c.richText.map((r) => r.text).join('');
    if (typeof c.text === 'string') return c.text;
  }
  return celda;
}

/**
 * Adaptador: Excel de la RMCAB -> formato estándar largo. `fecha_hora` es el INSTANTE FINAL del periodo horario
 * (así lo publica la RMCAB: '01-10-2026 01:00' es el promedio de 00:01 a 01:00; '24:00' pasa a 00:00 del día
 * siguiente). Los faltantes ('----') quedan vacíos: no se descartan, la validación los cuenta.
 */
@Injectable()
export class RmcabXlsxService {
  async leer(ruta: string): Promise<FilaLarga[]> {
    const libro = new Workbook();
    await libro.xlsx.readFile(ruta);
    const hoja = libro.worksheets[0];
    const filas: unknown[][] = [];
    hoja.eachRow({ includeEmpty: true }, (fila, n) => {
      filas[n - 1] = (fila.values as unknown[]).slice(1).map(simple); // exceljs cuenta desde 1
    });

    // las celdas combinadas traen la estación solo en la primera columna: se arrastra hacia la derecha
    const columnas: { c: number; estacion: string; variable: string; unidad: string | null }[] = [];
    let estacion = '';
    const nCols = Math.max(...[FILA_ESTACIONES, FILA_VARIABLES, FILA_UNIDADES].map((i) => (filas[i] ?? []).length));
    for (let c = 1; c < nCols; c++) {
      estacion = String(filas[FILA_ESTACIONES]?.[c] || estacion);
      const variable = filas[FILA_VARIABLES]?.[c];
      if (variable === undefined || variable === null || variable === '') continue; // columna sin cabecera
      const unidad = filas[FILA_UNIDADES]?.[c];
      columnas.push({ c, estacion, variable: String(variable), unidad: unidad ? String(unidad) : null });
    }

    const registros: FilaLarga[] = [];
    for (const fila of filas.slice(FILA_INICIO_DATOS)) {
      const crudo = fila?.[0];
      if (!crudo || !PATRON_FECHA.test(String(crudo))) continue; // las filas de resumen (Num, Avg, STD...) no son datos
      const [dia, hora] = String(crudo).split(' ');
      const [d, m, a] = dia.split('-').map(Number);
      const [h, mi] = hora.split(':').map(Number);
      const fecha_hora = fmtFechaHora(Date.UTC(a, m - 1, d) + h * 3_600_000 + mi * 60_000);
      for (const col of columnas) {
        const v = fila[col.c];
        registros.push({
          estacion: col.estacion, fecha_hora, variable: col.variable, unidad: col.unidad,
          valor: v === undefined || v === null || v === FALTANTE ? null : (v as string | number),
        });
      }
    }
    return registros;
  }
}
