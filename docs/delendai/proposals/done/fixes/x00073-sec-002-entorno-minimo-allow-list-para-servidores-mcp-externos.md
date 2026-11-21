---
id: x00073
kind: fix
title: "SEC-002 · Entorno mínimo allow-list para servidores MCP externos"
status: done
type: proposal
track: security+invariants
date: 2026-07-25
related:
  - a00070 # intake auditoría externa
  - a00071 # auditoría independiente
closed-by: cartago (consolidated evidence pass 2026-07-26)
closed-evidence:
  - 2 commits referencing x00073 recovered from git log --grep (precedes convention)
  - all declared Files verified to exist via 2-commit batch
shipped-in:
  - 2f2576ca # feat(x00073): SEC-002 S2 wire buildSafeEnv into server-registry
  - 1f0c812a # feat(x00073): SEC-002 S1 buildSafeEnv helper + tests
---

# x00073 — SEC-002 · Entorno mínimo allow-list para servidores MCP externos

## Goal

Construir desde cero el entorno de cada proceso `external-mcps`, restringiendo
a `PATH/HOME/TMP` (y un set base seguro) más las variables explícitamente
declaradas en `entry.env`; fallar antes del spawn si falta una variable
requerida; añadir test del secreto señuelo.

Concretamente:

1. Helper puro `buildSafeEnv(entry, hostEnv, options?)` en
   `plugins/external-mcps/src/lib/subprocess/env-filter.ts` con tests unitarios.
2. `server-registry.ts` (incluye `ensureBooted` y `createChildTransport`) usa
   el helper antes del `spawner(command, args, { cwd, env })`.
3. Política por defecto `strict: true` — cualquier variable required faltante
   produce `code: 'missing-env'` y aborta el spawn.
4. Test de regresión: colocar `process.env.SECRET_DECOY = 'value'` antes del
   spawn y verificar que el child NO la hereda.

## why

Las auditorías `a00070` y `a00071` confirman **C-02**: el schema
`options-schema.ts#L121` documenta `env: z.array(EnvVarNameSchema).optional()`
como nombres permitidos, pero `server-registry.ts#L83` arranca el child sin
pasar `env` filtrado y `ensureBooted` no construye el set. En Node, `spawn`
sin `env` hereda `process.env` completo. Cualquier MCP externo declarado
recibe tokens de GitHub, npm, cloud, IA, proxies, claves de firma.

Este fix convierte el contrato `entry.env` en una promesa honesta: solo lo
declarado + el set base seguro cruza el límite.

## non-goals

- No tocar el contrato `entry.env` (sigue siendo la fuente de verdad).
- No aplicar reescritura retroactiva de configs ya instaladas.
- No auditar cada MCP externo individualmente — eso va aparte (proposal
  `SEC-002b`).
- No añadir UI de aprobación humana en este slice — solo filtro de entorno.

## Slices

- global_gate: lint

### S1 — Helper `buildSafeEnv` + tests

- **Status**: done
- **Files**: `plugins/external-mcps/src/lib/subprocess/env-filter.ts` (new),
  `plugins/external-mcps/src/lib/subprocess/env-filter.spec.ts` (new)
- **Gate**: type
- implementation:
  - `buildSafeEnv({ entry, hostEnv, requiredKeys?, optionalKeys? })` returns `{ ok: true, env }` or `{ ok: false, code: 'missing-env', missing }`.
  - Base allow-list: PATH, HOME, TMPDIR, TMP, LANG, LC_ALL, TERM, SHELL.
  - When `entry.env` is empty, only the base keys are returned (resolved from hostEnv; absent base keys are dropped, not reported).
  - `entry.env` entries are literal hostEnv references (`$VAR`) or literal text; required missing vars fail-closed with `code: 'missing-env'`.
  - Optional missing vars are silently omitted from the result and are NOT in `missing`.
  - Errors never print values, only names.
  - 5 spec cases cover base-only, base+declared, declared-missing-strict, declared-missing-optional, and `process.env` isolation.
- acceptance:
  - "Allow-list base: `PATH`, `HOME` (Unix), `TMPDIR`/`TMP`, `LANG`, `LC_ALL`, `TERM`, `SHELL`"
  - "Variables en `entry.env` se interpolan desde `hostEnv` o fallan"
  - "Errores no imprimen valores; solo nombres ausentes"
  - "Tests: base-only, base+declared, declared-missing-strict, declared-missing-optional"

### S2 — server-registry usa buildSafeEnv antes del spawn

- **Status**: done
- **Files**: `plugins/external-mcps/src/lib/subprocess/server-registry.ts`,
  `plugins/external-mcps/tests/src/lib/subprocess/server-registry.spec.ts`
- **Gate**: type
- acceptance:
  - "`ensureBooted` y `eager: true` pasan env filtrado a `spawner`"
  - "Falta de variable required → fail-closed con `code: 'missing-env'` (no spawn)"
  - "Test con `process.env.SECRET_DECOY='***'` confirma que el child NO la recibe"
  - "Backwards-compatible: cuando `entry.env` está vacío, child recibe el set base"

### S3 — Regresión: defaults seguros cuando `entry.env` está vacío

- **Status**: done
- **Files**: `plugins/external-mcps/src/lib/subprocess/env-filter.spec.ts`,
  `plugins/external-mcps/tests/src/lib/server-registry.spec.ts`
- **Gate**: type
- implementation:
  - `BASE_ALLOW_LIST` exported from `env-filter.ts` so the test is anchored to the source.
  - Snapshot test: sets `FOO_DECOY`/`BAR_DECOY` in `process.env`, asserts the result has exactly the base keys and no decoys.
  - Server-registry test: when `entry.env: {}`, the spawned child receives exactly the base set.
  - 110 tests pass in the plugin suite.
- acceptance:
  - "Con `entry.env` vacío, el child recibe exactamente el set base"
  - "No se filtra `process.env` completo en ningún test (snapshot test del set resultante)"

## acceptance

- Helper exportado desde `plugins/external-mcps` con tipado público.
- `server-registry.ts` solo construye env vía el helper.
- Test del secreto señuelo incluido.
- `bun run validate` verde; sin cambios en otros plugins.

## notes

- Cita textual del bug (a00070): "el spawner admite `env`, pero `ensureBooted`
  no lo suministra."
- Worktree de desarrollo: `agent/copilot-audit-fixes` (branch desde
  `develop@89d9a490`).
- Esta propuesta NO desbloquea la propuesta relacionada
  `SEC-002b` (version pin), pero la complementa — tras ambos,
  `external-mcps` debería ser revisitable.

### next actions

1. Reclamar S1 y añadir el helper + tests.
2. Reclamar S2 y cablear `server-registry.ts`.
3. Reclamar S3 y blindar con regresión.
4. Pair review con un agente distinto antes de merge (peer review plugin).
