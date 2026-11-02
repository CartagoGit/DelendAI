---
id: x00259
title: "AUD-CP-001 — `buildScopedMessage` debe preservar `type`, scope y `!`"
kind: fix
status: done
shipped-in:
    - dcf046ef
type: proposal
track: commit-policy
date: 2026-08-25
priority: P0
classification: CONFIRMADO
parent-plan: q00006
audit-source:
    file: docs/mcp-vertex/audits/legacy/2026-08-25-develop-external-audit-chatgpt-sol-cuarta-pasada.md
    section: "Track B / x00259"
    sha256: 2374da0f620dc2cfab21e0d435e143f10174731864efce9f26f2d3a00104232a
    finding: AUD-CP-001
related:
    - q00006
    - t00017 # tabla + property-based del parser (acepta esta corrección)
    - x00265 # requireConventional depende de un parser correcto
---

# x00259 — AUD-CP-001: `buildScopedMessage` debe preservar `type`, scope y `!`

## Goal

La función que reconstruye headers de Conventional Commits a partir de
un mensaje crudo (`buildScopedMessage`, residencia esperada en
`plugins/commit-policy/src/lib/contracts/i18n-types.ts` o módulo
homólogo de parser de mensajes) **debe preservar de forma íntegra**:

1. `type` (feat, fix, chore, refactor, perf, … y tipos custom).
2. `scope` cuando ya viene en el header (`fix(core): …` no debe
   reescribirse a `fix(f00181): …`).
3. `!` (breaking-change marker) en la posición correcta — entre scope
   y `:` y nunca antes del `:` solo.
4. Body y footers intactos.

El bug actual rompe la "promoción" del header: mensajes simples
(`fix: x`) terminan rotulados con el scope del repo, mientras que
mensajes que ya traen scope terminan doble-scope o mal-construidos.

### Comportamiento actual (BUG)

```
fix: corrige carrera
  → feat(f00181): corrige carrera   # MAL — type y scope inventados
```

### Comportamiento deseado

```
fix: corrige carrera     → fix(f00181): corrige carrera
refactor!: cambia API    → refactor(f00181)!: cambia API
fix(core): x             → fix(core): x             # unchanged
chore: x                 → chore(f00181): x
xyz: x                   → xyz(f00181): x           # custom types preserved
fix(a/b): x              → fix(a/b): x              # scope con '/' respetado
fix!: x                  → fix(f00181)!: x
fix(scope)!: x           → fix(scope)!: x           # unchanged
```

## Why

- `t00017` no puede implementar su property-based hasta que
  `buildScopedMessage` sea invertible.
- `x00265` (`requireConventional=true`) necesita un parser/constructor
  correcto para devolver el refusal tipado correcto sobre el header
  reconstruido.
- Los logs de auditoría y los mensajes automáticos del agente
  (`commit-policy` auto) son leídos por revisores humanos; un header
  mal-formado erosiona confianza y rompe grep sobre Conventional
  Commits.
- El bug es del tipo "predicado ≠ acción": el código anuncia que
  respeta Conventional Commits pero construye mensajes no analizables
  aguas abajo.

## Non-goals

- No introducir tipos nuevos no soportados por Conventional Commits.
- No rehacer el parser de cero; preservar la API y la firma actual.
- No cambiar la regla "scope = plugin-id (`f00181`)"; sí preservar
  correctamente cuando el scope ya viene.
- No tocar el slice list ni el driver git en esta hija.

## Architecture

### 1. Ubicación de la función

- Esperada: `plugins/commit-policy/src/lib/contracts/i18n-types.ts`
  (o nuevo `plugins/commit-policy/src/lib/contracts/scope.ts` si la
  primera está saturada de i18n).
- API objetivo:
  ```ts
  type ParsedHeader = {
    type: string;
    scope?: string;
    breaking: boolean;
    rest: string; // subject + body + footers
  };
  function parseHeader(raw: string): ParsedHeader;
  function buildScopedMessage(
    raw: string,
    opts: { defaultScope: string }
  ): string;
  ```
- `parseHeader` y `buildScopedMessage` deben ser inversos para
  mensajes válidos:
  ```ts
  buildScopedMessage(parseHeader(x).rest, …) === x
  // sobre el subconjunto válido del parser
  ```

### 2. Reglas de promoción

| Entrada | Salida | Razón |
| --- | --- | --- |
| `fix: x` | `fix(f00181): x` | sin scope → añadir default |
| `fix(core): x` | `fix(core): x` | scope presente → unchanged |
| `fix!: x` | `fix(f00181)!: x` | `!` preservado y promovido |
| `fix(scope)!: x` | `fix(scope)!: x` | unchanged |
| `chore: x` | `chore(f00181): x` | tipo soportado |
| `xyz: x` | `xyz(f00181): x` | tipo custom preservado |
| `feat(deps): bump x` | `feat(deps): bump x` | unchanged |
| `` ` `` : `` ` `` (vacío) | refusal tipado | parseo falla antes de build |

### 3. Manejo del `!`

`!` siempre va **entre el scope y los dos puntos**:

- `feat!:` → `feat(f00181)!:`
- `feat(a)!:` → `feat(a)!:`
- `feat!: x` → `feat(f00181)!: x`
- `feat!!: x` → refusal (`!` doble no forma parte del spec).

### 4. Errores tipados (fail-closed)

| Caso | Salida |
| --- | --- |
| Header vacío | refusal `EMPTY_HEADER` |
| Header sin `:` después del type | refusal `MALFORMED_HEADER` |
| Caracteres de control | refusal `MALFORMED_HEADER` |
| Length > 100 chars sin override | refusal `HEADER_TOO_LONG` (si policy lo activa) |

## Slices

- global_gate: lint

### S1 — `parseHeader` + `buildScopedMessage` invertible con tabla de casos

- **Status**: done
- **Files**: `plugins/commit-policy/src/lib/contracts/i18n-types.ts` (o nuevo `scope.ts`), `plugins/commit-policy/tests/src/lib/contracts/i18n-types.spec.ts` (o `scope.spec.ts`)
- **Gate**: type
- **Dependency**: —
- acceptance:
  - "10 casos de la tabla pasan (incluido `fix(core): x` unchanged y `xyz: x` custom)"
  - "`fix!: x` reconstruye con `!` en la posición correcta"
  - "headers inválidos devuelven refusal tipado, no excepción"
- review-state: done
- review-implementer: crow
- review-reviewer: delivery_verifier
- review-log: requested_changes by copilot-reviewer — La implementacion y la validacion estrecha estan bien: 12/12 tests pasaron en plugins/commit-policy/tests/src/lib/contracts/i18n-types.spec.ts y scope.spec.ts, y bun x tsc -p plugins/commit-policy/tsconfig.json --noEmit devolvio exit 0. Pero esta copia del workspace no contiene .git en /home/cartago/_projects/mcp-vertex, asi que no pude inspeccionar el diff real ni verificar de forma independiente que solo hayan cambiado los archivos reclamados por el slice. Hasta que exista trazabilidad VCS en este workspace o se aporte el diff exacto, la aceptacion de revision independiente queda bloqueada.
- review-log: approved by delivery_verifier — Revisión técnica independiente conforme; la evidencia de ownership se valida contra el diff real del checkout principal, que queda limitado a los cuatro archivos declarados.
## acceptance

- Tabla de 10+ casos pasa, incluido property-based de 1000 mensajes
  (`parse(rebuild(x)) === x`) cuando se ejecute la tabla de `t00017`.
- `fix(core): x` queda **unchanged** (no se sobreescribe el scope).
- Tipos custom (`xyz`, …) preservan su `type`.
- `!` queda entre scope y `:`.
- Refusals tipados en entradas inválidas (sin lanzar excepción).
- `bun run lint` verde; `tsc --noEmit` verde.
- No introduce cambios en `slice-listener`, `commit-driver` ni
  driver git.
