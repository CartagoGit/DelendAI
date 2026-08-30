---
id: c00137
title: "Lint de capabilities no declaradas"
kind: chore
status: done
type: proposal
track: security
date: 2026-08-25
priority: P1
parent-plan: q00006
audit-source:
    file: docs/mcp-vertex/audits/legacy/2026-08-25-develop-external-audit-chatgpt-sol-cuarta-pasada.md
shipped-in:
    - f5836e9 # S1 lint + whitelist + tests
    section: "Track F / c00137"
    sha256: 2374da0f620dc2cfab21e0d435e143f10174731864efce9f26f2d3a00104232a
related:
    - q00006
    - f00188 # capability schema (define qué se declara)
    - d00009 # capability matrix (referencia humana)
---

# c00137 — Lint de capabilities no declaradas

## Goal

Introducir un **lint arquitectónico** que detecte cuando un plugin
accede a una capability sin haberla declarado en su manifest. El
lint corre en `bun run validate` y falla en CI si encuentra
violaciones.

### Comportamiento actual

- Plugins acceden a `ctx.fs.read(...)`, `ctx.git.write(...)`, etc.
  sin declarar nada en su manifest.
- No hay forma automática de saber qué capability usa cada plugin.
- Cuando `f00188` endurezca el enforcement, este lint detectará los
  plugins que aún no se han migrado.

### Comportamiento deseado

- `tools/scripts/lint/capabilities-declared.script.ts`:
  - Recorre todos los plugins bajo `plugins/**/src/**`.
  - Para cada plugin, identifica las capabilities que **usa** (por
    llamadas a métodos del `ctx.capabilities.*` o por imports a
    helpers que requieren capability).
  - Compara con las capabilities declaradas en el manifest del
    plugin (`plugin.json`, `index.ts#capabilities`, o equivalente).
  - Falla si hay capabilities usadas pero no declaradas.
- Exit code 1 si hay violaciones; imprime tabla con plugin,
  capability usada, línea.
- Whitelist explícita para plugins legacy en proceso de migración
  (`# capabilities-pending: fs.read, git.write` con fecha objetivo).

## why

- Cierra el ciclo de `f00188` (capability schema): una vez que el
  schema existe, el lint detecta plugins que faltan por migrarse.
- Habilita que un humano (o un agente) pueda auditar el progreso
  de la migración a capabilities declaradas.
- Cumple R5.2: invariantes como lints arquitectónicos que bloquean
  regresiones en CI.

## non-goals

- No reemplaza el enforcement runtime de `f00188` (esto es un lint
  estático, no un sandbox).
- No genera automáticamente la lista de capabilities de un plugin
  (eso requiere análisis semántico profundo); solo detecta usos
  obvios por regex/AST ligero.
- No aplica a plugins fuera de `plugins/**`.

## architecture

### 1. Detección de uso

- Algoritmo:
  1. Parsear cada archivo `.ts` del plugin con TypeScript Compiler
     API.
  2. Buscar property-access expressions sobre `ctx.capabilities.*`
     o alias `c.capabilities.*`.
  3. Mapear cada `c.<group>.<action>` a un
     `<group>:<action>` token (p. ej. `c.fs.read` →
     `'fs:read'`).
- Edge cases:
  - `const caps = ctx.capabilities; caps.git.write(...)` →
     detectado.
  - `const { fs } = ctx.capabilities; fs.read(...)` → detectado.
  - Llamada a helper interno que termina usando capability → no
    detectado en esta iteración (fuera de scope).

### 2. Fuente de verdad de capabilities declaradas

- Manifest JSON: leer `plugins/<name>/plugin.json` y la clave
  `capabilities`.
- Manifiesto TS: leer `plugins/<name>/src/index.ts` y la key
  `capabilities` del `definePlugin(...)`.
- Merge de ambas fuentes.

### 3. Salida del lint

```text
[LINT] capabilities-declared: 3 violations
  plugins/proposals/src/lib/router.ts:42 — used fs:write, declared: []
  plugins/git/src/index.ts:18 — used network:fetch, declared: [fs:read, git:read]
  plugins/cache/src/lib/writer.ts:9 — used fs:write, declared: [fs:read]
```

- Exit 1 si hay violaciones; 0 si no.

### 4. Whitelist

- Cada plugin en proceso de migración puede declarar:
  ```ts
  // capabilities-pending: fs:write, network:fetch
  // capabilities-migration-due: 2026-09-15
  ```
- El lint respeta la whitelist si la fecha objetivo no ha pasado.
- Si la fecha objetivo pasó, el lint falla aunque esté en
  whitelist.

### 5. Tests

- `tools/scripts/lint/capabilities-declared.spec.ts`:
  - Plugin que declara todas las capabilities → exit 0.
  - Plugin con capability usada no declarada → exit 1.
  - Plugin con `capabilities-pending` y fecha futura → exit 0.
  - Plugin con `capabilities-pending` y fecha pasada → exit 1.

## Slices

### S1 — Lint + whitelist + tests

- **Status**: done
- **Files**: `tools/scripts/lint/capabilities-declared.script.ts`, `tools/scripts/lint/capabilities-declared.spec.ts`
- **Gate**: type
- review-state: done
- review-implementer: implementation_runner
- review-reviewer: delivery_verifier
- review-log: approved by delivery_verifier — Verificado: capabilities-declared.spec 20/20 verde y el lint corre OK (53 plugins, 1213 files, 0 capabilities sin declarar). Contrato del slice cumplido.
## acceptance

- Lint ejecutable: `bun tools/scripts/lint/capabilities-declared.script.ts`.
- Detecta al menos las violaciones más comunes (regex sobre
  `ctx.capabilities.*`).
- Whitelist funciona con fechas.
- Tests verdes.
- Lint integrado en `bun run validate`.
