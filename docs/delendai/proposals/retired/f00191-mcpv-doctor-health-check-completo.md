---
id: f00191
title: "`delendai doctor`: health check completo"
kind: feat
status: retired
type: proposal
track: cli
date: 2026-08-25
priority: P1
parent-plan: q00006
shipped-in:
  - 7fa42b77
audit-source:
    file: docs/delendai/audits/legacy/2026-08-25-develop-external-audit-chatgpt-sol-cuarta-pasada.md
    section: "Track I / f00191"
    sha256: 2374da0f620dc2cfab21e0d435e143f10174731864efce9f26f2d3a00104232a
related:
    - q00006
    - c00142 # web regenerar docs (sincronización)
    - v00126 # verify CI local repro
---

# f00191 — `delendai doctor`: health check completo

## Goal

Introducir el comando CLI `delendai doctor` que ejecuta un **health
check exhaustivo** del entorno del usuario: configuración,
manifests, plugin graph, dependencias, token budgets, branch
protection, git status, runtime, MCP handshake, schemas, puertos,
permisos y estado de CI.

### Comportamiento actual

- No existe un comando unificado para "qué tal está mi instalación".
- Cuando algo no funciona, el usuario tiene que ejecutar varios
  scripts a mano.
- La auditoría externa (§24) lo señala como gap de DX: el primer
  paso del usuario ante un bug debería ser un doctor.

### Comportamiento deseado

- `bunx delendai doctor` (o `npx @delendai/cli doctor`):
  - Lista de checks:
    - `config`: `delendai.config.json` parseable.
    - `manifests`: todos los manifests de plugins válidos.
    - `plugin-graph`: sin ciclos, sin dangling imports.
    - `deps`: `bun install` consistente con `bun.lock`.
    - `token-budgets`: presets dentro de sus hard budgets.
    - `branch-protection`: `develop` y `main` protegidas (lee GitHub
      API).
    - `git-status`: working tree clean (warn-only).
    - `runtime`: Node/Bun version match.
    - `mcp-handshake`: arranca un host mínimo y verifica
      `initialize`.
    - `stale-docs`: drift check de `c00140`.
    - `schemas`: output schemas válidos (Vitest suite).
    - `ports`: puertos libres para el host.
    - `permissions`: capabilities declaradas consistentes.
    - `ci-status`: última run de GitHub Actions verde.
  - Salida:
    - Score `Health: NN/100`.
    - Tres listas: `P0 (must fix)`, `P1 (should fix)`,
      `P2 (cosmetic)`.
    - Exit code:
      - 0 si P0 vacía.
      - 1 si P0 no vacía.
      - 2 si solo P1.
  - `--json` para integración con scripts.

## why

- Cierra §24 de la auditoría.
- Habilita que el usuario diagnostique sin leer logs.
- Habilita CI / `v00126` para verificar el entorno antes de
  empezar.
- Es el comando natural al que un agente (LLM) puede llamar para
  "qué pasa aquí".

## non-goals

- No reemplaza a `bun run validate`.
- No modifica el entorno; solo reporta.
- No envía telemetría (R1.9): el reporte es local y se imprime en
  consola, no se sube a ningún sink.
- No incluye health de plugins externos (esos son de Track K).

## architecture

### 1. Comando

- `packages/cli/src/commands/doctor.ts`:
  - Implementa `delendai doctor` con la lista de checks.
  - Cada check es una función `(ctx: DoctorContext) => Promise<CheckResult>`.
  - Resultado tipado: `{ id, severity, message, fix? }`.

### 2. Checks como plugins

- `packages/cli/src/commands/doctor-checks/*.ts`:
  - Cada check en su propio archivo.
  - Carga dinámica para que un doctor extendido pueda añadir
    checks.

### 3. Tests

- `packages/cli/src/commands/doctor.spec.ts`:
  - Mock de cada check; verifica score final.
  - Verifica exit codes.
  - Verifica `--json` output.

### 4. Privacidad

- Sin tool names externos.
- Sin paths absolutos del host (usa relativos al workspace root).
- Sin enviar nada a la red (R1.9).

## Slices

### S1 — Comando doctor + checks iniciales + tests

- **Status**: pending
- **Files**: `packages/cli/src/commands/doctor.ts`, `packages/cli/src/commands/doctor-checks/{config,manifests,plugin-graph,deps,token-budgets,branch-protection,git-status,runtime,mcp-handshake,stale-docs,schemas,ports,permissions,ci-status}.ts`, `packages/cli/src/commands/doctor.spec.ts`
- **Gate**: type
- review-state: changes_requested
- review-implementer: implementation_runner
- review-reviewer: delivery_verifier
- review-log: requested_changes by delivery_verifier — Revisión independiente: solicito cambios. Evidencia empírica: 1) Vitest focalizado pasó: `VITE_CONFIG_NATIVE_IGNORE_WARNING=true bunx vitest run packages/cli/src/commands/doctor.spec.ts packages/cli/src/commands/groups/doctor.spec.ts --reporter=dot` => 2 archivos / 55 tests OK. 2) Biome sobre el slice reclamado pasó: `bunx biome check packages/cli/src/commands/doctor.ts packages/cli/src/commands/doctor.spec.ts packages/cli/src/commands/doctor-checks/*.ts` sin hallazgos. 3) Typecheck de CLI pasó: `bun run --cwd packages/cli typecheck`. Pero el CLI registrado no usa la implementación reclamada en la propuesta: `packages/cli/src/commands/registry.ts` importa `./groups/doctor`, mientras la propuesta S1 reclama `packages/cli/src/commands/doctor.ts` y `doctor-checks/*`. El comportamiento observable del comando activo no coincide con el contrato de la propuesta: al ejecutar `bun packages/cli/src/index.ts doctor --json` en un estado solo-warn, el exit code observado fue `EXIT=4`, no `2` como exige f00191 para P1-only; además el comando activo agrega/omite checks de red bajo `network-surfaces` en vez de exponer `mcp-handshake` y `ci-status` con la semántica prometida. En resumen: la superficie reclamada está testeada y tipada, pero no está cableada al comando de producción y el contrato visible del CLI no coincide con f00191.
## acceptance

- `delendai doctor` ejecutable y reporta score.
- Cada check tiene un test.
- Exit codes correctos.
- Sin telemetría.
- `bun run validate` verde.
