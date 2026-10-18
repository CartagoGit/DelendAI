# Continuación recuperable — auditoría en curso

- SHA auditado: `514758e783620c8953079be4d71fceccacb3de8b`; no auditar automáticamente HEAD futuro como si fuese el mismo árbol.
- Artefacto canónico de esta tanda: `docs/delendai/evidence/a00095/2026-10-19-gpt-6.1-sol/`.
- Unidad documental: a00095/S6, kind review, generation 1, topic auditoria-forense-20261019; ref `delendai/wip/gpt-6.1-sol/review/a00095-S6-g1/auditoria-forense-20261019`; worktree original de esta sesión `/tmp/delendai-audit-unit-gpt61-20261019`. Consultar work status antes de reusar: la publicación puede mantener o retirar la ref según estado real.
- Claim de esta tanda: directorio del artefacto y documento del libro a00095, task a00095-gpt61-audit, actor gpt-6.1-sol. No asumir vigencia al reanudar; pedir claims con identidad propia y flujo actual, sin suplantar otro modelo.
- Fase A guardada antes de leer conclusiones; Fase B parcial en contrast.md y prior-findings.json. Cuatro revisores históricos completos permanecen en el libro; este checkpoint no se suma a completed.
- 22 confirmados; UI-WEB probable y ACK identidad pendiente. Fuente inmutable y evidencias según REPLAY.md.
- 61 plugins: 17 parcialmente inspeccionados, 44 sin ficha técnica; ninguna certificación exhaustiva. El inventario de bytes/hashes está completo. No repetir medición ni suites que ya pasaron sin un motivo nuevo.
- Siguiente lectura exacta: plugins/agent-orchestrator/src/index.ts, después lib/dispatch/port-resolution.helper.ts y contracts del runtime de subagentes. Evaluar manifests/contexto/lease/cancelación con aceptación real; completar ficha con fuentes, positivos y límites. Luego seleccionar el siguiente plugin pendiente de plugins.json.
- Trabajo pendiente adicional: resto core/CLI/SQLite/estado; lifecycle completo VSCode y rutas web; todos los scripts/skills; tests de fallos entre dos escrituras y TTL de cuota durante invocación larga; instalación externa limpia y migraciones multiplataforma; comparación con relist y host real; aceptación de todas las activas y contraste histórico.
- Restricciones: sólo documentación/evidencias; no producto ni estados done, no credenciales/cuotas personales ni consumo de proveedores. No borrar bloques ajenos. No confirmar D1/D2 sin cadena que eluda mutex exterior.
- Publicación de checkpoint: commit/PR propio; no fusionar ni declarar auditoría acabada. Ver publication.md si existe para resultado y URL.
