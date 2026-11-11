import { Injectable } from '@nestjs/common';
import { excedencias, niveles, noEvaluables } from '../../analisis/hechos.util';
import { Hechos } from '../../analisis/interfaces/analisis.interface';
import { ConocimientoService } from '../../conocimiento/services/conocimiento.service';
import { Redaccion } from '../../redaccion/services/redaccion.service';
import { mesTexto } from '../../shared/utils/fechas.util';
import { n2 } from '../../shared/utils/numeros.util';

/** `trazabilidad.md`: la regla y la fuente de cada conclusión, quién escribió cada texto y los supuestos. */
@Injectable()
export class TrazabilidadService {
  constructor(private readonly conocimiento: ConocimientoService) {}

  generar(hechos: Hechos, textos: Record<string, Redaccion>): string {
    const base = this.conocimiento.base;
    const L: string[] = [
      `# Trazabilidad — ${mesTexto(hechos.meta.periodo)}`, '',
      `Norma: ${hechos.meta.norma} (vigencia confirmada: ${base.norma.estado_verificado.fecha}).`, '',
      '## Conclusiones del motor de reglas', '',
    ];
    const exc = excedencias(hechos);
    if (!exc.length) L.push('Ninguna excedencia en las series evaluables.');
    for (const e of exc) {
      const regla = base.limites.find((x) => x.id === e.regla_id)!;
      L.push(`- **${e.estacion} · ${e.contaminante} (${e.promedio})** el ${e.fecha_hora}: ${n2(e.valor_ugm3)} µg/m³ > ${n2(e.limite_ugm3)} µg/m³ → regla \`${e.regla_id}\` (${regla.fuente}).`);
    }
    for (const n of niveles(hechos)) {
      L.push(`- **${n.estacion} · ${n.contaminante} (${n.promedio})** el ${n.fecha_hora}: ${n2(n.valor_ugm3)} µg/m³ → nivel de ${n.nivel} → regla \`${n.regla_id}\` (${base.niveles_excepcionales_fuente}).`);
    }
    L.push('', '## Series no evaluables', '');
    const noe = noEvaluables(hechos);
    for (const e of noe) L.push(`- ${e.estacion} · ${e.contaminante}: ${n2(e.representatividad_pct)} % de horas válidas (< ${hechos.meta.representatividad_minima_pct} %).`);
    if (!noe.length) L.push('Ninguna.');
    L.push('', '## Origen de cada texto interpretativo', '');
    for (const [s, r] of Object.entries(textos)) {
      const cifras = (r.verificacion as { n_cifras?: number }).n_cifras;
      L.push(`- \`${s}\`: ${r.origen}${r.intentos ? `, ${r.intentos} intento(s)` : ''}${cifras ? `, ${cifras} cifras verificadas` : ''}`);
      for (const p of r.problemas) L.push(`  - rechazado: ${p}`);
    }
    L.push('', '## Supuestos', '', ...hechos.meta.supuestos.map((s) => `- ${s}`));
    L.push('', '## Advertencias del control de calidad', '');
    for (const a of hechos.advertencias) L.push(`- [${a.severidad}] ${a.codigo}: ${a.mensaje}`);
    return L.join('\n') + '\n';
  }
}
