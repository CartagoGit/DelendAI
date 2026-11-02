---
id: x00217
title: "loader: aplicar parsed.data de Zod y frontera única de validación de opciones"
kind: fix
status: done
type: proposal
track: lifecycle
date: 2026-08-24
---

# x00217 — loader: aplicar parsed.data de Zod y frontera única de validación de opciones

## Goal

Hacer que el loader sea la **frontera canónica de validación de opciones**: aplicar `parsed.data` de Zod y entregar al plugin las opciones ya normalizadas (coerciones, defaults, trims, transforms), eliminando la doble validación dispersa.

Parte del plan `q00003`. Referencias legadas (`docs/mcp-vertex/audits/legacy/2026-08-24-develop-external-audit.md`):

- §3 PL-001 — aplicar `parsed.data`
- §3 PL-002 — evitar doble validación dispersa

Hoy `loadPlugins` hace `optionsSchema.safeParse(ctx.options)` y, si es válido, conserva el `ctx` original (nunca usa `parsed.data`). Schemas con `.default()`, `.transform()`, `z.coerce`, `.trim()` validan pero no entregan el valor normalizado. Algunos plugins re-parsean dentro de `register()` (doble validación accidental).

Criterio: con schema `z.object({ retries: z.coerce.number().default(3) })` y config `{ retries: "5" }`, dentro de `register` debe observarse `ctx.options.retries === 5` y `typeof ctx.options.retries === 'number'`.

## why

Sin normalizar, los plugins reciben valores que contradicen su propio schema (un '5' string donde el schema promete number). Esto rompe tipos, defaults y la confianza en la configuración, y genera validación duplicada y divergente entre plugins.

## non-goals

- No congelar el objeto de opciones de forma irreversible (se evalúa como mejora posterior).
- No cambiar el contrato público de IPlugin salvo para el flujo de opciones normalizadas.
- No eliminar aún los re-parse defensivos de plugins; se eliminan en la propuesta de lifecycle.

## Slices

- global_gate: type

### S1 — Loader construye el contexto desde parsed.data
- **Status**: done
- **Files**: `packages/core/src/lib/plugins/load-plugins.ts`
- **Gate**: type
- acceptance:
  - "El loader usa parsed.data para construir el contexto final del plugin."
  - "z.coerce/.default/.trim/.transform se aplican antes de register."
- review-state: done
- review-implementer: swarm-implementer
- review-reviewer: orchestrator-fase1-review
- review-log: approved by orchestrator-fase1-review — Fase 1 review 2026-08-25: validate verde.
### S2 — Fixture de plugin con opciones transformadas
- **Status**: done
- **Files**: `packages/core/tests/src/lib/plugins/loader-parsed-options.spec.ts`
- **Gate**: type
- acceptance:
  - "Fixture con z.coerce.number().default(3) y config { retries: '5' } observa ctx.options.retries === 5 (number)."
  - "Un schema inválido produce error de validación coherente en el loader, no en el plugin."

## acceptance

- El loader usa parsed.data para construir el contexto final del plugin.
- z.coerce/.default/.trim/.transform se aplican antes de register.
- Fixture con z.coerce.number().default(3) y config { retries: '5' } observa ctx.options.retries === 5 (number).
- Un schema inválido produce error de validación coherente en el loader, no en el plugin.
