---
id: v00128
title: "Reducir los dos outputSchema más caros del repo (advise_routing, invoke)"
kind: perf
status: review
type: proposal
track: tokens
date: 2026-08-27
priority: P1
related:
    - r00034 # capa de capabilities — trabajo hermano de la misma sesión
last-transition-id: 1fd3147b-5cbb-4609-b7cb-2f184888bdde
last-correlation-id: 1fd3147b-5cbb-4609-b7cb-2f184888bdde
last-transition-from: in-progress
---

# v00128 — Reducir los dos `outputSchema` más caros del repo

## Goal

Bajar el coste de los dos esquemas de salida más caros de la superficie
`vertex`, que hoy dominan el presupuesto de tokens de todo el servidor.

### Comportamiento actual

Medido con el desglose por componente (`tools/scripts/report/`):

| Tool | Total | `outputSchema` | `description` |
|---|---|---|---|
| `orchestrator-runner_advise_routing` | 12.992 B | **12.157 B (93,6 %)** | 88 B |
| `orchestrator-runner_invoke` | ~9.100 B | 9.127 B de salida | — |

`orchestrator-runner` completo son 40.599 B en 11 tools (~3.700 B/tool)
frente a los ~1.330 B/tool de `proposals`. La razón es que ambos
esquemas incrustan el `RoutingDecisionSchema` completo, incluido el
roster recursivo `alternates` con su `ProviderSchema`/`InvokeSchema`
anidados otra vez.

## why

El dato que cambia la estrategia: **el coste no está en las
descripciones, está en lo que las tools declaran que van a devolver**.
La recomendación estándar —"acorta las descriptions"— es inerte aquí:
la descripción de `advise_routing` son 88 bytes contra 12.157 de su
esquema de salida. Cualquier esfuerzo puesto en textos es ruido frente
a esto.

Y se paga en cada petición, con cada modelo, se use la herramienta o no.

## why this design

Se verificó empíricamente que **zod v4 + el SDK de MCP no deduplican
esquemas repetidos en `$defs`/`$ref`**: reutilizar el mismo objeto JS en
dos sitios lo serializa entero dos veces. Zod v4 soporta `reused: 'ref'`,
pero el SDK nunca pasa esa opción. Por tanto la técnica habitual de
"envelopes compartidos" **no ahorra nada en este stack**, y el ahorro
real solo llega reduciendo campos de verdad o cambiando la forma de la
respuesta.

Eso deja tres vías legítimas, en orden de preferencia: quitar
duplicación real, degradar detalle por defecto, y mover payload grande
detrás de un handle.

## non-goals

- No consolidar tools. No hay verbos duplicados en este plugin, y
  fusionar tools distintas tras un parámetro de modo empeora la
  selección del modelo, que cuesta más de lo que ahorra.
- No recortar `invoke` en lo que sea su valor de retorno genuino. Ahí
  el esquema **es** el resultado de la herramienta, no una redundancia.
- No tocar `description` como línea de trabajo: ya están en 73–140 B.

## architecture

1. **Adelgazar `alternates`.** Cada alternativa arrastra hoy la forma
   completa de una decisión, incluidos `strengths`, `weaknesses`,
   `scoringTrace` y `rationale`. Son candidatos descartados: el modelo
   necesita saber cuáles eran y por qué perdieron, no la traza completa
   de scoring de cada uno. Definir un `IAlternateSummary` estrecho.
   **Precondición**: no hay hoy cobertura que demuestre qué campos
   consume realmente el llamante, así que el primer paso es añadirla, no
   adivinar.

2. **`detail: compact | normal | full`.** `advise_routing` ya tiene el
   precedente en el mismo plugin: `advise_spend` usa `projectDetail` +
   `SPEND_DETAIL_PROJECTIONS` con `normal` por defecto. Replicar ese
   patrón, con `compact` por defecto para la decisión de enrutado.

3. **`scoringTrace` detrás de un resource handle.** Es el campo más
   grande y el que menos veces se lee: sirve para explicar una decisión
   *a posteriori*, no para tomarla. Devolver un identificador y exponer
   la traza como recurso.

4. **Corregir la medición de core.** `measureSchemaBytes()` reconstruye
   `{name, description, inputSchema, outputSchema}` en vez de medir el
   objeto que va por el cable, así que **omite el campo `execution` que
   el SDK adjunta** y subestima el tamaño real. Mientras las dos rutas
   de medición diverjan, cualquier presupuesto basado en la de core está
   sesgado.

## Slices

### S1 — Cobertura de consumo

- **Status**: done
- **Gate**: `bunx vitest run --root plugins/orchestrator-runner`
- **Files**:
    - `plugins/orchestrator-runner/tests/`

Tests que fijen qué campos de `alternates` y de la decisión consume
realmente cada llamante, para que S2 no sea adivinanza.
- review-state: done
- review-implementer: sonnet-worker-tokens
- review-reviewer: sonnet-verifier-tokens
- review-log: approved by sonnet-verifier-tokens — Ran tokens:gate (orchestrator-runner 14,395B/11 tools, was 40,599B before v00128/v00130 work), tokens:dashboard:check (in sync), and npx vitest run advise-routing.tool.spec.ts + invoke.tool.spec.ts (9/9 passed). Detail levels, narrowed alternates, execution-aware measurement confirmed in source.
### S2 — `IAlternateSummary`

- **Status**: pending
- **Gate**: `bun run tokens:gate`
- **Files**:
    - `plugins/orchestrator-runner/src/lib/schemas.ts`
    - `plugins/orchestrator-runner/src/lib/contracts/interfaces/`

Sustituir la forma completa por el resumen estrecho en `alternates`.
Medir el delta.
- review-state: in_review
- review-implementer: sonnet-worker-tokens
### S3 — Niveles de detalle

- **Status**: pending
- **Gate**: `bun run tokens:gate`
- **Files**:
    - `plugins/orchestrator-runner/src/lib/tools/advise-routing.tool.ts`

`detail: compact | normal | full` en `advise_routing`, siguiendo el
patrón ya existente de `advise_spend`.
- review-state: in_review
- review-implementer: sonnet-worker-tokens
### S4 — `scoringTrace` como recurso

- **Status**: pending
- **Gate**: `bun run tokens:gate`
- **Files**:
    - `plugins/orchestrator-runner/src/lib/tools/advise-routing.tool.ts`

Devolver un identificador y exponer la traza detrás de un handle en vez
de inline.

### S5 — Alinear `measureSchemaBytes()`

- **Status**: pending
- **Gate**: `bun run tokens:dashboard:check`
- **Files**:
    - `packages/core/src/lib/project/tool-surface-runtime.service.ts`
    - `tools/scripts/report/tool-component-breakdown.helper.ts`

Medir el objeto real del cable en vez de reconstruirlo, para que deje de
omitir `execution`.
- review-state: in_review
- review-implementer: sonnet-worker-tokens
## dependency graph

S1 → S2. S3 y S4 son independientes de S2 y entre sí. S5 es
independiente de todo lo demás y puede ir primero si se quiere medir
con precisión desde el principio.

## acceptance

- `orchestrator-runner` baja de 40.599 B de forma medible, con las 11
  tools presentes y sus suites verdes.
- Ninguna capacidad se pierde: lo que hoy se puede saber se sigue
  pudiendo saber, aunque haya que pedir `detail: full` o leer un
  recurso.
- `measureSchemaBytes()` y el desglose del dashboard coinciden para una
  tool que lleve `execution`.
- `bun run tokens:gate`, `bun run tokens:dashboard:check` y
  `bun run validate` verdes.

## risks and mitigations

- **Riesgo: romper llamantes.** Cambiar la forma de una respuesta es
  breaking. Mitigación: S1 fija el consumo real antes de tocar nada, y
  los niveles de detalle permiten recuperar la forma completa.
- **Riesgo: empeorar la calidad de decisión del modelo** al ocultarle
  información de las alternativas. Mitigación: medir precisión de
  selección antes y después; si empeora, `compact` no es el default
  correcto.
- **Riesgo: el ahorro no compense la complejidad** de los resource
  handles. Mitigación: S4 va al final, y solo si S2+S3 no bastaron.

## notes

El desglose por componente y los tokenizadores reales se añadieron en la
sesión del 2026-08-27. La duplicación de campos de nivel superior en
`advise_routing` (`alternates`/`scoringTrace`/`sessionId` repetidos
fuera y dentro de `decision`) se resolvió por separado en esa misma
sesión; esta propuesta ataca lo que quedó después.

Ficheros de referencia:

- `plugins/orchestrator-runner/src/lib/schemas.ts`
- `tools/scripts/report/tool-component-breakdown.helper.ts`
