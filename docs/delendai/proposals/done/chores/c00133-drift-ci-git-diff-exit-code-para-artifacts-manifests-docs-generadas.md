---
id: c00133
title: "Drift CI: git diff --exit-code para artifacts / manifests / docs generadas"
kind: chore
status: done
type: proposal
track: governance
date: 2026-08-25
priority: P0
parent-plan: q00006
audit-source:
    file: docs/mcp-vertex/audits/legacy/2026-08-25-develop-external-audit-chatgpt-sol-cuarta-pasada.md
    section: "Track A / c00133"
    sha256: 2374da0f620dc2cfab21e0d435e143f10174731864efce9f26f2d3a00104232a
shipped-in:
    - f5836e9 # S1 compositor gen:all + check + workflow drift
related:
    - q00006
    - c00132 # quality gate real (predecesor)
    - f00190 # AGENT.md generado (parte de gen:all)
---

# c00133 — Drift CI: git diff --exit-code para artifacts / manifests / docs generadas

## Goal

Introducir un job CI que ejecute el regenerador completo (`gen:all`)
y falle con `git diff --exit-code` si hay drift entre source y
artifacts. Detectar drift **en el PR**, no post-merge.

### Comportamiento actual

- El dev puede olvidar regenerar artifacts/manifests/docs.
- CI detecta drift tarde (post-merge), cuando ya está en `develop`.
- Cada generador (`gen:capacities`, `gen:agents-md`, etc.) es
  independiente; no existe un punto de entrada único.
- Artefactos como `docs/mcp-vertex/agent-catalog.generated.json`,
  manifests en `plugins/*/manifest.json` (cuando son generados), o
  bloques `<!-- mcp-vertex:begin/end -->` en `AGENTS.md` /
  `AGENT.md` raíz pueden divergir silenciosamente.

### Comportamiento deseado

- Comando único `bun tools/scripts/gen-all.script.ts` que regenera
  en orden:
  1. Catálogo de agentes.
  2. Manifests de plugins.
  3. Capabilities matrix.
  4. `AGENT.md` por package/plugin (`f00190`).
  5. Token budget dashboard (`c00135`, `c00136`).
  6. Bloques auto-generados en `AGENTS.md`, `CLAUDE.md`,
     `.github/copilot-instructions.md`.
- Idempotencia: una segunda ejecución no produce diff.
- CI falla con diff legible y accionable si hay drift en un PR.
- Pre-push hook opcional para reducir fricción local.

## why

- AUD-P0-003: la auditoría detecta drift entre source y
  artifacts en varios puntos del repo.
- Sella el contrato "lo versionado en git es lo que se ve en
  runtime"; sin esto, cualquier `gen:X` puede quedar desfasado.
- Es el último eslabón del Track A: policy declarativa → quality
  gate → drift gate → verificación real.
- Habilita confianza para que `c00005` (token gate CI) y los gates
  de `c00132` operen sobre artifacts vigentes.

## non-goals

- No versiona artifacts innecesarios (e.g. `node_modules/` o
  caches).
- No reescribe generadores existentes uno por uno; solo compone.
- No añade un step de auto-fix en CI (commitea el drift solo si un
  humano lo aprueba localmente).

## architecture

### 1. Compositor

- `tools/scripts/gen-all.script.ts`:
  - Llama en orden a cada generador:
    - `tools/scripts/gen/agent-catalog.script.ts`
    - `tools/scripts/gen/plugin-manifests.script.ts`
    - `tools/scripts/gen/capabilities-matrix.script.ts`
    - `tools/scripts/gen/agent-md.script.ts` (`f00190`)
    - `tools/scripts/report/token-budget-dashboard.script.ts`
    - `tools/scripts/gen/agent-bootstrap-injects.script.ts`
  - Cada generador es responsable de su sub-output; `gen:all` solo
    orquesta.
  - Exit code agregado: `1` si cualquier generador falla o produce
    diff (en `--check`).

### 2. Modo `--check`

- `gen:all --check` ejecuta los generadores en modo dry-run (o
  aplica cambios a un worktree temporal) y compara contra el
  árbol de git con `git diff --exit-code`.
- Salida: diff anotado por archivo.

### 3. Workflow CI

- `.github/workflows/drift.yml`:
  - Trigger: `pull_request` a `develop`/`main`, `push` a `develop`,
    nightly.
  - Steps: checkout → setup Bun → `bun run gen:all --check` → si
    exit != 0, sube el diff como artifact y falla.
  - `concurrency`: cancel-in-progress en PRs viejos.

### 4. Pre-push (opcional)

- `lefthook.yml` agrega:
  ```yaml
  pre-push:
      commands:
          gen:all:check:
              run: bun tools/scripts/gen-all.script.ts --check
  ```

### 5. Tests

- `tools/scripts/gen-all.spec.ts`:
  - Con fixture repo vacío: primera ejecución produce artifacts;
    segunda no produce diff.
  - `--check` exit 0 cuando todo coherente.
  - `--check` exit 1 con diff legible cuando hay drift simulado
    (cambiar manualmente un archivo generado y re-ejecutar).

## Slices

### S1 — Compositor gen:all + check + workflow drift

- **Status**: done
- **Files**: `tools/scripts/gen-all.script.ts`, `tools/scripts/gen-all.spec.ts`, `.github/workflows/drift.yml`, `lefthook.yml`
- **Gate**: type
- review-state: done
- review-implementer: finch
- review-reviewer: delivery_verifier_r2
- review-log: requested_changes by delivery_verifier — Revision independiente: bunx vitest run tools/scripts/gen-all.spec.ts --reporter=dot pasa 7/7 y .github/workflows/drift.yml parsea con la estructura esperada, pero el gate requerido falla en este checkout por un error propio del slice: tools/scripts/gen-all.script.ts(123,2) TS2375 bajo exactOptionalPropertyTypes=true (`only` se devuelve como string | undefined aunque la propiedad opcional no admite undefined explícito). Hay mucho trabajo paralelo en el checkout, pero no fue necesario para rechazar: el bloqueo es in-slice y aparece tambien en bun run validate -> [typecheck:tools].
- review-log: approved by delivery_verifier_r2 — Ronda 2: typecheck de gen-all limpio (spread condicional para exactOptionalPropertyTypes), spec 7/7 verde, workflow drift.yml parsea y lefthook pre-push blocking. El validate global falla solo por blockers externos ajenos (agentes paralelos en tools/). Aprobado con evidencia del slice.
## acceptance

- `bun run gen:all` ejecuta todos los generadores en orden.
- `bun run gen:all --check` exit 0 cuando no hay drift; exit 1 con
  diff cuando lo hay.
- CI falla con PR que introduce drift (demostración).
- `gen:all` es idempotente (segunda ejecución no produce diff).
- `bun run validate` verde.
