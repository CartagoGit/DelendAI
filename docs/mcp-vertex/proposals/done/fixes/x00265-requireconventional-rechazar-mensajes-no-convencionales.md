---
id: x00265
title: "AUD-CP-007 — `requireConventional=true` debe rechazar mensajes no convencionales"
kind: fix
status: done
shipped-in:
    - 6b11ca54
type: proposal
track: commit-policy
date: 2026-08-25
priority: P1
classification: PROBABLE (BUG)
parent-plan: q00006
audit-source:
    file: docs/mcp-vertex/audits/legacy/2026-08-25-develop-external-audit-chatgpt-sol-cuarta-pasada.md
    section: "Track B / x00265"
    sha256: 2374da0f620dc2cfab21e0d435e143f10174731864efce9f26f2d3a00104232a
    finding: AUD-CP-007 (BUG PROBABLE)
related:
    - q00006
    - x00259 # parser invertible (cabecera correcta)
    - t00017 # tabla + property-based
    - f00182 # engine que aplica la policy
---

# x00265 — AUD-CP-007: cuando `requireConventional=true` se rechazan mensajes no convencionales

## Goal

El driver (`commit-driver.ts`) pasa el mensaje directamente al
`git commit -m` sin validar la cabecera cuando
`requireConventional=true` está activo. El flag existe en la
configuración pero su enforcement está desconectado del flujo.
Resultado: agentes commitean con `"hola"`, `"updated stuff"`,
`"WIP"` y el repo pierde la trazabilidad de Conventional Commits.

Tras la corrección, el engine (vía `f00182`):

1. Si `requireConventional=true` y `parseHeader(raw)` falla →
   refusal tipado `NON_CONVENTIONAL_MESSAGE` con la razón
   específica del fallo (`MALFORMED_HEADER`, `EMPTY_HEADER`,
   `UNKNOWN_TYPE` si el policy lo exige, etc.).
2. Si `requireConventional=false` → warning estructurado en log;
   el commit procede.

### Comportamiento actual (BUG PROBABLE)

```
requireConventional=true
  → driver llama git commit -m "hola"  → commit con header "hola"
```

### Comportamiento deseado

```
requireConventional=true, "hola"        → refusal NON_CONVENTIONAL_MESSAGE
requireConventional=true, "feat: x"      → commit OK
requireConventional=false, "hola"       → warning, commit OK
requireConventional=true, ""             → refusal EMPTY_HEADER
requireConventional=true, ":"            → refusal MALFORMED_HEADER
```

## Why

- Conventional Commits es la base del versionado semántico
  automático (`x00260`/Track commits) y de la auditoría.
- Sin enforcement, agentes crean commits silenciosamente no
  trazables.
- Pieza de la propiedad "one source of truth": la policy declarada
  tiene que ser la policy ejecutada.
- Pieza de `t00017`: la property-based necesita poder sembrar
  fallos y verificar el refusal.

## Non-goals

- No validar el body (solo header).
- No imponer tipos custom desconocidos (solo los standard de CC
  1.0 + la lista del repo, ya mantenida).
- No añadir auto-fixes al mensaje: el refusal debe ser claro y
  dejar al emisor arreglar.

## Architecture

### 1. Punto de inserción

En `plugins/commit-policy/src/lib/engine.ts` (entregado por
`f00182`), antes de invocar `commit-driver.commit()`:

```ts
if (this.options.requireConventional) {
  const parsed = parseHeader(message);
  if (!parsed) {
    return {
      ack: 'ERR',
      code: 'NON_CONVENTIONAL_MESSAGE',
      reason: parseHeader.lastError ?? 'malformed',
      raw: message,
    };
  }
  // (opcional) re-build con scope default para homogeneizar logs
  message = buildScopedMessage(message, { defaultScope: pluginId });
}
```

### 2. Códigos de refusal específicos

| Caso | Código |
| --- | --- |
| Header vacío | `EMPTY_HEADER` (también `NON_CONVENTIONAL_MESSAGE` umbrella) |
| Sin `:` | `MALFORMED_HEADER` |
| Type desconocido (si policy lo activa) | `UNKNOWN_TYPE` |
| Longitud excedida | `HEADER_TOO_LONG` |

El refusal envelope mantiene el código específico para que el
agente pueda corregir.

### 3. Logging cuando `requireConventional=false`

```ts
this.logger.warn({
  event: 'commit.non_conventional',
  raw: message,
  hook: 'engine',
});
```

Sin refusal, commit procede.

## Slices

- global_gate: lint

### S1 — Engine valida cabecera y rechaza con `NON_CONVENTIONAL_MESSAGE` cuando aplica

- **Status**: done
- **Files**: `plugins/commit-policy/src/lib/engine.ts`, `plugins/commit-policy/src/lib/contracts/i18n-types.ts` (o nuevo `conventional.ts`), `plugins/commit-policy/tests/src/lib/engine.spec.ts`
- **Gate**: type
- **Dependency**: `x00259`, `f00182`
- acceptance:
  - "requireConventional=true + 'hola' → refusal"
  - "requireConventional=true + 'feat: x' → ok"
  - "requireConventional=false + 'hola' → warning, commit procede"
  - "refusal lleva código específico (EMPTY_HEADER / MALFORMED_HEADER / UNKNOWN_TYPE)"
- review-state: done
- review-implementer: implementation_runner
- review-reviewer: copilot_delivery_verifier
- review-log: requested_changes by delivery_verifier — Los tests de engine pasan (15/15) y la lógica requireConventional está implementada, pero Biome falla por formato en i18n-types.ts (clave UNKNOWN_TYPE con indentación incorrecta en ambos locales). Corregir el formato para que bun run lint quede verde.
- review-log: approved by copilot_delivery_verifier — Verificacion independiente: tests engine 15/15 verdes, Biome limpio sobre los archivos del slice y typecheck de plugins/commit-policy verde tras la correccion de formato en i18n-types.ts.
## acceptance

- Cero commits con header no convencional cuando
  `requireConventional=true`.
- Logs estructurados diferencian "warning" vs "refusal".
- Tests cubren la tabla de la sección Goal.
- `bun run lint` verde; `tsc --noEmit` verde.
- Pieza de `t00017`: el rechazo alimentado a la property-based no
  retorna excepción sin tipar.
