---
id: x00234
title: "api_call: no devolver headers sensibles (Authorization/Cookie) en el output"
kind: fix
status: done
type: proposal
track: plugins+fix
date: 2026-08-24
related:
  - a00086
---

# x00234 — api_call: no devolver headers sensibles en el output

## Goal

`api_call` devuelve el objeto `request` completo en su output, incluido `request.headers` (`plugins/api/src/lib/tools/api-call.tool.ts#L186-L194`), y `buildHeaders` mete **todos** los header params (`plugins/api/src/lib/spec/build-request.ts#L73-L88`), incluida cualquier `Authorization`, `Cookie` o `X-Api-Key` que el agente pase por `params`. La descripción del tool promete "secrets are never logged", pero el token vuelve en `output.request.headers` y persiste en el transcript/logs.

Redactar los headers sensibles del `request.headers` que se devuelve (sin alterar los headers que se envían de verdad por la red).

## why

Hallazgo a00086 #8 (confirmed · media). Es una fuga de secretos al output que contradice el contrato documentado del tool. El arreglo es quirúrgico: redactar solo la proyección de salida, no el envío.

## non-goals

- No alterar los headers reales enviados a la API (el request en red sigue íntegro).
- No tocar la mitigación SSRF (sigue vía `webFetch` allow-listado).
- No cambiar el shape del `OUTPUT` (se mantiene `request.headers` como record, solo con valores redactados).

## Slices

- global_gate: lint

### S1 — Redactar headers sensibles en el output
- **Status**: done
- **Files**: `plugins/api/src/lib/tools/api-call.tool.ts`, `plugins/api/src/lib/tools/api-call.tool.spec.ts`
- **Gate**: lint
- acceptance:
  - "`output.request.headers.authorization` (y `cookie`/`x-api-key`) se devuelve redactado (p. ej. `***`)."
  - "Los headers no sensibles (`content-type`, `accept`) se devuelven intactos."
  - "El request enviado por la red conserva los headers originales."
  - "Los specs cubren header sensible redactado y header neutro intacto."
- review-state: done
- review-implementer: swarm-implementer
- review-reviewer: orchestrator-fase1-review
- review-log: approved by orchestrator-fase1-review — Redo. validate verde (a nivel de mi lote).
## acceptance

- El output de `api_call` nunca incluye valores literales de `authorization`/`cookie`/`x-api-key`.
- Los headers no sensibles siguen visibles; el envío real no cambia.
- `bun run lint:proposals` exits 0 y los specs de `api-call.tool` pasan.
