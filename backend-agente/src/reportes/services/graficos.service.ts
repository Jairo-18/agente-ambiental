import { Injectable } from '@nestjs/common';
import { Resvg } from '@resvg/resvg-js';
import { EstadisticaService } from '../../analisis/services/estadistica.service';
import { Disponible } from '../../analisis/hechos.util';
import { Hechos } from '../../analisis/interfaces/analisis.interface';
import { ConocimientoService } from '../../conocimiento/services/conocimiento.service';
import { FilaLimpia } from '../../datos/interfaces/fila.interface';

export interface Figura {
  png: Buffer;
  ancho: number;
  alto: number;
}

const COLORES = ['#1f77b4', '#d95f02', '#1b9e77', '#7570b3', '#e7298a', '#66a61e']; // distinguibles entre sí
const FUENTE = `'DejaVu Sans', 'Liberation Sans', Arial, Helvetica, sans-serif`;
const color = (i: number) => COLORES[i % COLORES.length];
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const f1 = (x: number) => x.toFixed(1);

/** Marcas "bonitas" del eje (1, 2, 2.5, 5 × 10^k) desde 0 hasta la primera que cubre `max`: el eje nunca queda corto. */
export function marcas(max: number, n = 6): number[] {
  const bruto = max / n;
  const pot = 10 ** Math.floor(Math.log10(bruto));
  const paso = [1, 2, 2.5, 5, 10].map((m) => m * pot).find((p) => p >= bruto)!;
  const out: number[] = [];
  for (let v = 0; ; v += paso) {
    out.push(Number(v.toPrecision(10)));
    if (v >= max - paso * 1e-9) break;
  }
  return out;
}

/**
 * Gráficos del reporte. Se dibujan como SVG a mano y se convierten a PNG con resvg: sin matplotlib, sin navegador, sin
 * pantalla. Todo sale de los datos ya limpios y de los hechos calculados (el gráfico no calcula nada nuevo).
 */
@Injectable()
export class GraficosService {
  constructor(
    private readonly conocimiento: ConocimientoService,
    private readonly estadistica: EstadisticaService,
  ) {}

  private aPng(svg: string, ancho: number, alto: number): Figura {
    const png = new Resvg(svg, {
      background: '#ffffff', fitTo: { mode: 'width', value: ancho },
      font: { loadSystemFonts: true, defaultFontFamily: 'DejaVu Sans' },
    }).render().asPng();
    return { png: Buffer.from(png), ancho, alto };
  }

  /** Promedio de 24 h por estación con la línea del límite y las excedencias marcadas. Solo estaciones evaluables. */
  graficoDiario(datos: FilaLimpia[], hechos: Hechos, contaminante: string, periodo: string): Figura | null {
    const lim = this.conocimiento.base.limites.find((x) => x.contaminante === contaminante && x.promedio === '24h')!;
    const series: { est: string; i: number; puntos: { dia: number; v: number }[] }[] = [];
    Object.entries(hechos.estaciones).forEach(([est, e], i) => {
      const c = e.contaminantes[contaminante];
      if (!c?.disponible || !c.evaluable) return;
      const serie = this.estadistica.serieHorariaUgm3(datos, est, contaminante, periodo)!;
      series.push({ est, i, puntos: this.estadistica.promedio(serie, '24h', periodo).map((p) => ({ dia: new Date(p.t).getUTCDate(), v: p.valor })) });
    });
    if (!series.length) return null;

    const [W, H, mi, md, ms, mb] = [1200, 600, 90, 30, 56, 130];
    const ymax = Math.max(lim.limite, ...series.flatMap((s) => s.puntos.map((p) => p.v).filter((v) => !Number.isNaN(v)))) * 1.1;
    const ejeY = marcas(ymax);
    const tope = ejeY[ejeY.length - 1];
    const x = (dia: number) => mi + ((dia - 1) / 30) * (W - mi - md);
    const y = (v: number) => ms + (1 - v / tope) * (H - ms - mb);

    const o: string[] = [];
    for (const v of ejeY) o.push(`<line x1="${mi}" x2="${W - md}" y1="${f1(y(v))}" y2="${f1(y(v))}" stroke="#000" stroke-opacity="0.12"/><text x="${mi - 10}" y="${f1(y(v) + 5)}" text-anchor="end" font-size="15">${v}</text>`);
    for (const d of [5, 10, 15, 20, 25, 30]) o.push(`<line x1="${f1(x(d))}" x2="${f1(x(d))}" y1="${ms}" y2="${H - mb}" stroke="#000" stroke-opacity="0.08"/><text x="${f1(x(d))}" y="${H - mb + 24}" text-anchor="middle" font-size="15">${d}</text>`);
    o.push(`<rect x="${mi}" y="${ms}" width="${W - mi - md}" height="${H - ms - mb}" fill="none" stroke="#333"/>`);
    o.push(`<line x1="${mi}" x2="${W - md}" y1="${f1(y(lim.limite))}" y2="${f1(y(lim.limite))}" stroke="red" stroke-width="2" stroke-dasharray="9 6"/>`);
    for (const s of series) {
      let tramo: string[] = [];
      const cerrar = () => {
        if (tramo.length > 1) o.push(`<polyline points="${tramo.join(' ')}" fill="none" stroke="${color(s.i)}" stroke-width="2.2"/>`);
        tramo = [];
      };
      for (const p of s.puntos) {
        if (Number.isNaN(p.v)) cerrar();
        else tramo.push(`${f1(x(p.dia))},${f1(y(p.v))}`);
      }
      cerrar();
      for (const p of s.puntos) {
        if (Number.isNaN(p.v)) continue;
        o.push(`<circle cx="${f1(x(p.dia))}" cy="${f1(y(p.v))}" r="4" fill="${color(s.i)}"/>`);
        if (p.v > lim.limite) o.push(`<circle cx="${f1(x(p.dia))}" cy="${f1(y(p.v))}" r="11" fill="none" stroke="red" stroke-width="2.5"/>`);
      }
    }
    o.push(`<text x="${W / 2}" y="30" text-anchor="middle" font-size="19">${esc(`${contaminante}: promedio de 24 h por estación (círculo rojo = excedencia)`)}</text>`);
    o.push(`<text x="${W / 2}" y="${H - mb + 56}" text-anchor="middle" font-size="16">${esc(`Día de ${periodo}`)}</text>`);
    o.push(`<text transform="translate(26 ${(ms + H - mb) / 2}) rotate(-90)" text-anchor="middle" font-size="16">${esc(`${contaminante} (µg/m³)`)}</text>`);

    // leyenda debajo del eje, centrada: así no tapa la línea del límite ni los datos
    const entradas = [...series.map((s) => ({ texto: s.est, color: color(s.i), discontinua: false })), { texto: `Límite 24 h (${lim.limite} µg/m³)`, color: 'red', discontinua: true }];
    const ancho = (t: string) => 44 + t.length * 9 + 30;
    let cx = (W - entradas.reduce((a, e) => a + ancho(e.texto), 0)) / 2;
    const cy = H - 28;
    for (const e of entradas) {
      o.push(`<line x1="${f1(cx)}" x2="${f1(cx + 32)}" y1="${cy}" y2="${cy}" stroke="${e.color}" stroke-width="2.5"${e.discontinua ? ' stroke-dasharray="8 5"' : ''}/><text x="${f1(cx + 40)}" y="${cy + 5}" font-size="15">${esc(e.texto)}</text>`);
      cx += ancho(e.texto);
    }
    return this.aPng(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" font-family="${FUENTE}" fill="#222">${o.join('')}</svg>`, W, H);
  }

  /** Media mensual de O3, SO2, NO2 y CO por estación. Solo las series evaluables tienen barra. */
  graficoGases(hechos: Hechos): Figura | null {
    const gases = ['O3', 'SO2', 'NO2', 'CO'];
    const estaciones = Object.keys(hechos.estaciones);
    const valores = gases.map((g) =>
      estaciones.map((est) => {
        const x = hechos.estaciones[est].contaminantes[g];
        return x.disponible ? (x as Disponible).media_mensual_ugm3 : null;
      }),
    );
    if (!valores.flat().some((v) => v !== null)) return null;

    const [W, H, ml, mr, ms, mb, hueco] = [1350, 480, 80, 24, 84, 70, 52];
    const ancho = (W - ml - mr - hueco * 3) / 4;
    const alto = H - ms - mb;
    const o: string[] = [];
    gases.forEach((g, k) => {
      const x0 = ml + k * (ancho + hueco);
      const max = Math.max(1, ...valores[k].filter((v): v is number => v !== null)) * 1.1;
      const eje = marcas(max, 5);
      const tope = eje[eje.length - 1];
      const y = (v: number) => ms + (1 - v / tope) * alto;
      for (const v of eje) o.push(`<line x1="${f1(x0)}" x2="${f1(x0 + ancho)}" y1="${f1(y(v))}" y2="${f1(y(v))}" stroke="#000" stroke-opacity="0.12"/><text x="${f1(x0 - 8)}" y="${f1(y(v) + 5)}" text-anchor="end" font-size="13">${v}</text>`);
      o.push(`<rect x="${f1(x0)}" y="${ms}" width="${f1(ancho)}" height="${alto}" fill="none" stroke="#333"/>`);
      const paso = ancho / estaciones.length;
      estaciones.forEach((est, i) => {
        const cx = x0 + paso * (i + 0.5);
        const v = valores[k][i];
        if (v === null) {
          o.push(`<text x="${f1(cx)}" y="${f1(y(0) - 24)}" text-anchor="middle" font-size="12" fill="#888">sin</text><text x="${f1(cx)}" y="${f1(y(0) - 8)}" text-anchor="middle" font-size="12" fill="#888">evaluar</text>`);
        } else {
          o.push(`<rect x="${f1(cx - paso * 0.36)}" y="${f1(y(v))}" width="${f1(paso * 0.72)}" height="${f1(y(0) - y(v))}" fill="${color(i)}"/>`);
        }
        o.push(`<text x="${f1(cx)}" y="${H - mb + 22}" text-anchor="middle" font-size="13">${esc(est.slice(0, 4))}</text>`);
      });
      o.push(`<text x="${f1(x0 + ancho / 2)}" y="${ms - 14}" text-anchor="middle" font-size="17">${g}</text>`);
      if (k === 0) o.push(`<text transform="translate(22 ${ms + alto / 2}) rotate(-90)" text-anchor="middle" font-size="14">µg/m³</text>`);
    });
    o.push(`<text x="${W / 2}" y="30" text-anchor="middle" font-size="18">Media mensual de gases por estación (solo series evaluables)</text>`);
    return this.aPng(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" font-family="${FUENTE}" fill="#222">${o.join('')}</svg>`, W, H);
  }
}
