---
id: v00125
title: "Verificar estado real de `develop` (verde + protegida) antes de cerrar este track"
kind: perf
status: done
type: proposal
track: governance
date: 2026-08-25
shipped-in: [305515338]
priority: P0
parent-plan: q00006
audit-source:
    file: docs/mcp-vertex/audits/legacy/2026-08-25-develop-external-audit-chatgpt-sol-cuarta-pasada.md
    section: "Track A / v00125"
    sha256: 2374da0f620dc2cfab21e0d435e143f10174731864efce9f26f2d3a00104232a
related:
    - q00006
    - c00130 # branch protection (predecesor)
    - c00132 # quality gate real (predecesor)
    - v00126 # verify CI local (sinergia, ambos usan GitHub API)
last-transition-id: 76ae9cea-a16f-47ac-a7ab-5f0d9579b1f3
last-correlation-id: 76ae9cea-a16f-47ac-a7ab-5f0d9579b1f3
last-transition-from: review
---

# v00125 — Verificar estado real de `develop` (verde + protegida) antes de cerrar este track

## Goal

Producir **evidencia medible** (no afirmación) de que `develop` está
**realmente** verde en CI y **realmente** protegida en GitHub antes
de cerrar el Track A. El verificador debe consumir la API de GitHub,
no inferir el estado desde configs declarativas.

### Comportamiento actual

- La auditoría externa no puede confirmar el estado real de
  `develop` porque no hay un script que lo lea de GitHub.
- Una PR puede mergearse con quality gate rojo; nadie lo detecta
  sistémicamente.
- El plugin `commit-policy` puede estar mal configurado localmente
  sin que CI lo note.

### Comportamiento deseado

- Script `tools/scripts/ci/verify-develop-health.script.ts` que
  devuelve:
  - Estado del último commit en `develop` (CI run + conclusion).
  - JSON de la policy de protection real (de GitHub API).
  - Lista de required status checks.
  - Diff entre la policy real y la declarativa
    (`.github/branch-protection.yml`).
  - Exit code 0 si todo cumple; 1 con detalle si no.
- Entry en el dashboard (`apps/web/src/data/...`) que muestre el
  último estado verificado.
- CI nightly invoca el script; failure → issue automático.

## why

- AUD-P0-001, AUD-P0-002: el audit no puede confirmar el estado
  real; sin evidencia no hay cierre honesto del Track A.
- Es el "último gate" del track: sin él, las hijas P0 del Track A
  son declaraciones, no enforcement.
- Da una fuente única de verdad sobre el estado de `develop`
  consumible por humanos y por agentes.
- Habilita que otros tracks (B, C, …) asuman como precondición
  "`develop` está verde y protegida".

## non-goals

- No almacena credenciales de GitHub en el repo.
- No replica toda la matriz de CI; solo verifica el último run de
  `develop`.
- No aplica la policy; solo la lee.
- No envía telemetría (R1.9).

## architecture

### 1. Verificador

- `tools/scripts/ci/verify-develop-health.script.ts`:
  - Recibe `--owner`, `--repo` (default del repo actual).
  - Llama a:
    - `GET /repos/:owner/:repo/commits/develop/ref/.../check-runs`
      para el último commit.
    - `GET /repos/:owner/:repo/branches/develop/protection`.
    - `GET /repos/:owner/:repo/branches/main/protection`.
  - Compara la protection real contra
    `.github/branch-protection.yml`.
  - Emite reporte JSON + exit code.
  - Cachea respuestas para evitar rate limit (TTL configurable).

### 2. Dashboard entry

- `apps/web/src/data/develop-health.json` (generado o manual):
  - `lastVerifiedAt`
  - `ciStatus`: `green | red | unknown`
  - `protectedBranches`: `{ main: bool, develop: bool }`
  - `requiredChecks`: `string[]`
  - `discrepancies`: `string[]`

### 3. Tests

- `tools/tests/ci/verify-develop-health.spec.ts`:
  - Fixtures de respuestas de GitHub API (CI green, CI red,
    protection presente, protection ausente).
  - Exit 0 con todo verde + protected.
  - Exit 1 con CI rojo + diff.
  - Exit 1 con protection ausente.
  - Manejo de rate limit (caché y mensaje claro).

### 4. CI nightly

- Job `verify-develop-health` en `.github/workflows/drift.yml` o
  uno separado, programado nightly.
- Si exit != 0 → crear issue vía `gh issue create --label
  ci-health`.

## Slices

### S1 — Script + dashboard entry + CI nightly + tests

- **Status**: done
- **Files**: `tools/scripts/ci/verify-develop-health.script.ts`, `tools/tests/ci/verify-develop-health.spec.ts`, `apps/web/src/data/develop-health.json`, `.github/workflows/verify-develop-health.yml`
- **Gate**: type
- review-state: submitted
- review-implementer: mcp-vertex-orchestrator
- review-reviewer: delivery_verifier
- review-log: Implementación existente verificada; typecheck de tools verde y `bun vitest run tools/tests/ci/verify-develop-health.spec.ts` verde (1 archivo, 23 tests).

## acceptance

- Script ejecutable; devuelve JSON estructurado.
- Exit 0 con `develop` verde y protegida; exit 1 con detalle si no.
- Dashboard entry generada/actualizada automáticamente.
- CI nightly ejecuta y crea issue ante fallo.
- Tests cubren los 4 escenarios del plan.
- `bun run validate` verde.
- `resolution.evidence` de la propuesta cita el output real del
  script (JSON) cuando se cierra.

---

resolution:
  status: implemented
  shipped-in: ["30551533", "051b12d5", "e94d5639", "bd0df7b0"]
  evidence:
    - tests: "1 archivo, 23 tests"
    - typecheck: "bun tools/scripts/typecheck.script.ts exit 0"
    - workflow: "script, dashboard entry y CI nightly presentes y rastreados"
