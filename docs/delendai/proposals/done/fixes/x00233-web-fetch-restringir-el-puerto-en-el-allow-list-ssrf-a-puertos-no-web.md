---
id: x00233
title: "web-fetch: restringir el puerto en el allow-list (SSRF a puertos no-web)"
kind: fix
status: done
type: proposal
track: plugins+fix
date: 2026-08-24
related:
  - a00086
---

# x00233 — web-fetch: restringir el puerto en el allow-list

## Goal

El allow-list de `web_fetch` compara solo el **hostname** (`plugins/web-fetch/src/lib/services/engine.ts#L204` → `isHostAllowed` en `#L103-L113`), nunca el puerto. Si `example.com` está allow-listado, `web_fetch { url: "http://example.com:6379" }` (o cualquier puerto) también pasa, dejando alcanzable por SSRF cualquier servicio no-HTTP de un host de confianza (Redis, Elasticsearch, Docker daemon…).

Endurecer el allow-list para que la frontera cubra también el puerto: por defecto solo `80`/`443`, y soportar entradas `host:port` para permitir puertos concretos de forma explícita.

## why

Hallazgo a00086 #1 (confirmed · media). La mitigación SSRF del plugin está bien pensada (fail-closed, redirects re-validados, cap en streaming), pero la granularidad del allow-list es host, no servicio. Cerrar esa rendija hace que el allow-list signifique lo que el operador cree que significa.

## non-goals

- No reintroducir fetch automático de redirects (sigue manual y re-validado).
- No cambiar el modelo fail-closed (allow-list vacío = rechaza todo).
- No tocar la resolución DNS (rebinding queda como riesgo de host, documentado).

## Slices

- global_gate: lint

### S1 — Restringir puerto en el allow-list
- **Status**: done
- **Files**: `plugins/web-fetch/src/lib/services/engine.ts`, `plugins/web-fetch/tests/src/lib/services/engine.spec.ts`
- **Gate**: lint
- acceptance:
  - "`http://allowed.example.com:6379` se rechaza cuando el allow-list solo tiene `example.com`."
  - "Los puertos por defecto (80/443) se aceptan; una entrada `host:port` permite explícitamente ese puerto."
  - "`*.suffix` sigue funcionando junto con la restricción de puerto."
  - "Los specs de engine cubren puerto bloqueado, puerto explícito y puerto por defecto."
- review-state: done
- review-implementer: swarm-implementer
- review-reviewer: orchestrator-fase1-review
- review-log: approved by orchestrator-fase1-review — Redo. validate verde (a nivel de mi lote).
## acceptance

- El allow-list valida hostname + puerto (default 80/443; `host:port` para puertos explícitos).
- Sin regresión en fail-closed, redirects manuales y cap de streaming.
- `bun run lint:proposals` exits 0 y los specs de engine pasan.
