# Validación de la tanda documental

- Integridad: 8866 hashes de archivos del snapshot cotejados sin delta; 61 plugins inventariados y 22 registros con detalle/evidencia.
- Suites focales disjuntas: 201 archivos y 1351 tests aprobados. Logs en evidence y resultados en informes. No equivale al gate global.
- Preflight general: tests limitado a 180 s; build exit2 por tipo better-sqlite3 instalado sólo por workspace, copia inicial incompleta; build focal database pasó al restaurar el enlace instalado. Biome directo exit1, distinto del wrapper baseline.
- Formatter aplicado sólo a JSON del artefacto, sin tocar evidencia original .txt/.log.
- El primer lint de propuestas detectó que docs/delendai/audits es ruta legacy prohibida. El registro principal se conserva en la propuesta audit existente. Los anexos de evidencia se guardan bajo docs/delendai/evidence/a00095, junto al árbol de evidencias del proyecto: no son nuevas propuestas ni un almacén alternativo de propuestas de auditoría. Un segundo intento de poner anexos Markdown en proposals/in-progress/audits fue rechazado por nombres no canónicos; no se modificó ni baselinó ningún guard.
- Resultado del lint y publicación finales se anota en publication.md y en el mensaje de entrega; nunca se infiere que validate pasó.

Resultado final: `bun run lint:proposals` exit 0; sin nuevos incumplimientos de filename/scaffold/frontmatter/refs/status/higiene. `git diff --check` exit 0. Chequeo de 22 detalles/evidencias y enlaces propios sin errores, texto anterior de a00095 conservado byte por byte tras retirar únicamente las dos adiciones de esta tanda.
