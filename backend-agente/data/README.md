# Datos de ejemplo (RMCAB, Bogotá)

| Archivo | Qué es |
|---|---|
| `rmcab_2026-10_horario_guaymaral-kennedy-puentearanda.xlsx` | Descarga original, sin modificar |
| `rmcab_2026-10_largo.csv` | Mismo contenido en el formato estándar del agente (generado por `src/adaptador_rmcab.py`; se puede regenerar) |

## Procedencia

- **Fuente:** Red de Monitoreo de Calidad del Aire de Bogotá (RMCAB), Secretaría Distrital de Ambiente — `rmcab.ambientebogota.gov.co`, *Reportes → Reporte de estaciones*.
- **Fecha de descarga:** 2026-11-03.
- **Parámetros:** vista Excel, periodo personalizado 01-10-2026 01:00 a 01-11-2026 00:00, tipo *Promedio*, base de tiempo *1 hora*, estaciones **Guaymaral, Kennedy y Puente Aranda**, todas sus variables.
- Los datos publicados son **preliminares**: la propia RMCAB avisa que pueden variar cuando se realiza la validación final. Un reporte oficial debe usar datos validados.

## Formato original (Excel)

- Fila 3: estación (celda combinada); fila 4: variable; fila 5: unidad; luego una fila por hora.
- La hora es de **fin de periodo** (`01:00` = promedio de 00:01 a 01:00; la última fila es `24:00`).
- `----` = dato faltante.
- Al final hay filas de resumen (`MinTime`, `Maximum`, `Avg`, `Num`, `DataPrecent`, `STD`…) que **no son datos**.
- Gases en **ppb/ppm** (la norma colombiana usa µg/m³ → hace falta conversión), viento en grados.

## Formato estándar (CSV largo)

`estacion, fecha_hora, variable, valor, unidad` — `fecha_hora` es el instante final del periodo; los faltantes quedan vacíos.

## Qué se observó (para diseñar el QA/QC)

- 744 horas por columna (31 días × 24 h), 52 columnas.
- Faltantes muy desiguales: PM10 en Guaymaral ≈ 1 %, PM2.5 en Guaymaral ≈ 12 %, **ozono en Kennedy ≈ 44 %**. Hay columnas completamente vacías (por ejemplo CO₂ en Guaymaral).
