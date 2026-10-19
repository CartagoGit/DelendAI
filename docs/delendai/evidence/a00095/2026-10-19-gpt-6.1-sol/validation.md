# Validación de la tanda documental

- Integridad: 8866 hashes de archivos del snapshot cotejados sin delta; 61 plugins inventariados y 25 registros con detalle/evidencia.
- Suites focales disjuntas: 201 archivos y 1351 tests aprobados. Logs en evidence y resultados en informes. No equivale al gate global.
- Preflight general: tests limitado a 180 s; build exit2 por tipo better-sqlite3 instalado sólo por workspace, copia inicial incompleta; build focal database pasó al restaurar el enlace instalado. Biome directo exit1, distinto del wrapper baseline.
- Formatter aplicado sólo a JSON del artefacto, sin tocar evidencia original .txt/.log.
- El primer lint de propuestas detectó que docs/delendai/audits es ruta legacy prohibida. El registro principal se conserva en la propuesta audit existente. Los anexos de evidencia se guardan bajo docs/delendai/evidence/a00095, junto al árbol de evidencias del proyecto: no son nuevas propuestas ni un almacén alternativo de propuestas de auditoría. Un segundo intento de poner anexos Markdown en proposals/in-progress/audits fue rechazado por nombres no canónicos; no se modificó ni baselinó ningún guard.
- Resultado del lint y publicación finales se anota en publication.md y en el mensaje de entrega; nunca se infiere que validate pasó.

Resultado de esta continuación: `bun run lint:proposals` exit 0; sin nuevos incumplimientos de filename/scaffold/frontmatter/refs/status/higiene. `git diff --check` exit 0. El índice contiene 25 detalles/evidencias; se conserva el texto previo de otros revisores.
- Continuación agent-orchestrator: reproducción `AUDIT_SOURCE_ROOT=/tmp/delendai-audit-514758e bun .../evidence/agent-orchestrator/timeout-orphan.repro.ts` exit 0; resultado `ok:false`, `activeAtReturn:2`, `peakConcurrent:2`, ambas invocaciones terminan después. Reproducción simulada, no test de host real.
- `bun run lint:proposals`: exit 0, 1244 archivos inspeccionados, 288 legacy omitidos, 0 errores fatales; los lints frontmatter, prefijos, canonical filename, referencias de Files, folder drift, already implemented, ready-to-close e hygiene pasaron.
- `git diff --check`: exit 0 tras preservar el estilo CRLF de `coverage.tsv` para sus líneas existentes.

- Lectura agent-orchestrator ampliada en el snapshot: ORCH-08/09 incorporados como P2 estáticos; sus suites focales no se ejecutaron en esta continuación.
