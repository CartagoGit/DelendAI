---
id: p104
status: done
type: proposal
track: agent-contract
date: 2026-06-18
---

# p104 — feat(status-marker): plugin de cierre obligatorio coloreado

## Goal

Crear el plugin `@mcp-vertex/status-marker` siguiendo el patrón del repo (`definePlugin` + knowledge + tools). Fuente única de verdad en `markers.ts` (8 estados: HECHO/CAP/RE-PIVOT/CHECKPOINT-REQUIRED/REPAIR-NEEDED/BLOQUEADO/SIN PROPUESTAS LIBRES/SIN PROPUESTA DE NINGUN TIPO), validador tolerante en `validate.ts` (≤120 chars, razón obligatoria en 5 estados), dos tools MCP (`<prefix>_close` que devuelve la línea exacta, `<prefix>_validate` que audita un bloque). Knowledge entry con la tabla canónica. Tests unitarios cubriendo los 8 estados y los casos de violación. Activación vía `mcp-vertex.config.json`. `bun run validate` verde.

## Slices

- global_gate: lint

### s1-scaffold — Scaffold del plugin (package.json, tsconfig, README)
- files: plugins/status-marker/package.json
- files: plugins/status-marker/tsconfig.json
- files: plugins/status-marker/README.md
- gate: lint
- acceptance:
  - "package.json válido"
  - "tsconfig extends base"
  - "README documenta uso"
- status: done

### s2-markers — markers.ts (tabla canónica) + tests
- files: plugins/status-marker/src/lib/markers.ts
- files: plugins/status-marker/tests/markers.spec.ts
- gate: lint
- acceptance:
  - "8 estados con emoji, requiresReason y maxLineLen=120"
  - "formatLxAppCloseMarker(state, reason?) correcto"
  - "Tests cubren formato, truncado a 120 con …, y <reason-missing>"
- status: done

### s3-validate — validate.ts (parser tolerante) + tests
- files: plugins/status-marker/src/lib/validate.ts
- files: plugins/status-marker/tests/validate.spec.ts
- gate: lint
- acceptance:
  - "Detecta los 8 estados OK"
  - "5 estados fallan sin razón"
  - "Detecta bad-format, missing, too-long"
  - "Tests verdes"
- status: done

### s4-tools — tools/close-tools.ts (close + validate MCP) + tests
- files: plugins/status-marker/src/lib/tools/close-tools.ts
- files: plugins/status-marker/tests/close-tools.spec.ts
- gate: lint
- acceptance:
  - "buildCloseRegistration() con inputSchema zod"
  - "buildValidateRegistration() con inputSchema zod"
  - "Output estructurado JSON"
  - "Tests verdes"
- status: done

### s5-wire — Cableado: src/index.ts y public barrel
- files: plugins/status-marker/src/index.ts
- files: plugins/status-marker/src/public/index.ts
- gate: lint
- acceptance:
  - "index.ts importa y registra tools y knowledge"
  - "public/index.ts expone markers + validate + format helper"
  - "Bun typecheck verde"
- status: done

### s6-config — Config: registrar plugin en mcp-vertex.config.json + vitest.shared.ts
- files: mcp-vertex.config.json
- files: vitest.shared.ts
- gate: lint
- acceptance:
  - "plugins.status-marker añadido a config"
  - "Vitest descubre los tests del nuevo plugin"
- status: done

### s7-validate — bun run validate verde + propuesta cerrada
- files: docs/proposals/p104-feat-status-marker-plugin.md
- gate: lint
- acceptance:
  - "typecheck verde"
  - "lint verde"
  - "tests verdes"
  - "Propuesta p104 marcada como completada"
- status: done
