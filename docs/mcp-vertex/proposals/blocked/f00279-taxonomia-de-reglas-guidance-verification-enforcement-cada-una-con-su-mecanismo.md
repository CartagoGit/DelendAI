---
id: f00279
title: "Taxonomía de reglas guidance/verification/enforcement, cada una con su mecanismo"
kind: feat
status: blocked
type: proposal
track: trust
date: 2026-08-29
parent-plan: q00011
audit-source:
    file: docs/mcp-vertex/audits/2026-08-27-develop-independent-audit-claude-opus5.md
    finding: AUD-G03
    snapshot: 2cf17373f32b536e0c5154892ceddbb5d490ab37
priority: P1
related: [q00011, f00278]
---

# f00279 — Taxonomía de reglas guidance/verification/enforcement, cada una con su mecanismo

## Goal

Etiquetar cada regla del catálogo del plugin `rules` con una de tres
categorías —`guidance` (prompt al LLM), `verification` (completion
gate, permitido mientras trabaja, prohibido al declarar hecho) o
`enforcement` (runtime, imposible)— y que ninguna regla de
`enforcement` se implemente hoy como texto en un prompt.

## why

**El dolor.** *"Muchas reglas no las cumplen del todo bien."*

**Verificación de la premisa.** Confirmado en `plugins/rules/src/lib/`:
la salida de `command-resolver.ts`, `dogma-policy.provider.ts` y
`policy-resolver.ts` es texto para el modelo — no hay ningún mecanismo
que impida a un agente ignorar la salida. `rules-tools.ts` expone las
tools MCP del plugin (185 ficheros en total), y ninguna clasifica sus
reglas por categoría de mecanismo hoy: todas viven en la misma
categoría implícita ("mostrada al agente"), incluidas las que, por su
naturaleza, deberían ser imposibles de violar (p. ej. "no toques
`main`") en vez de simplemente desaconsejadas.

**Lo que ya existe para la tercera categoría.** La auditoría describe
`EffectBroker` como el mecanismo de `enforcement`; confirmado que hoy
**no existe** ese nombre en el código (`grep -rln "EffectBroker"` sin
resultados), pero sí existen sus primitivas de más bajo nivel
(`guardEffectCapability`/`runWithDryRunGate` en
`packages/core/src/lib/dry-run/effect-guard.helper.ts`, documentadas
como sin consumidor en `r00037`, propuesta ya escrita para `AUD-D02`).
Es decir: el mecanismo de `enforcement` para reglas de efectos no
existe todavía como capa compuesta — es una dependencia real de esta
propuesta, no un detalle de implementación menor.

**Por qué es un problema.** Hay una confusión de categoría: *regla
mostrada al agente* ≠ *regla aplicada*. Una regla de enforcement
implementada sólo como prompt (p. ej. "nunca hagas push a `main`") es,
en la práctica, una regla de guidance con más palabras — el modelo
puede ignorarla igual que cualquier otra.

## why this design

Se descarta reclasificar y re-implementar las 185 reglas del plugin en
esta propuesta: es un catálogo grande y las reglas de `verification`
dependen de un mecanismo (completion gates) que `f00278` construye en
paralelo, mientras que las de `enforcement` dependen de `EffectBroker`
(`r00037`, fuera de este territorio). Esta propuesta entrega el
**esquema de clasificación** y lo aplica a un subconjunto piloto —las
reglas que hoy son enforcement-en-prompt más peligrosas (rutas
protegidas, push a ramas protegidas)— en vez de fantasear un roadmap
que reclasifique las 185 de una vez.

Se elige extender el esquema existente del plugin `rules`
(`policy-resolution.contract.ts`) con un campo `mechanism` en vez de
crear un registro paralelo, porque el catálogo de reglas ya tiene una
representación estructurada — añadir un campo es más barato y más
difícil de dejar desincronizado que mantener dos fuentes.

## non-goals

- Construir `EffectBroker` — es `r00037` (dependencia declarada, no
  incluida aquí).
- Construir el mecanismo de completion gate genérico — es `f00278`
  (dependencia declarada para la categoría `verification`).
- Reclasificar las 185 reglas del catálogo — S1 clasifica todas
  (esfuerzo de etiquetado, barato); S2/S3 sólo migran el mecanismo del
  subconjunto piloto de reglas de `enforcement` más críticas. El resto
  queda etiquetado como `guidance`/`verification` pendiente de
  mecanismo, explícitamente marcado como tal — no oculto.

## architecture

```
plugins/rules/src/lib/contracts/policy-resolution.contract.ts
      IRuleDefinition {
          id, description, ...(ya existe)
          mechanism: 'guidance' | 'verification' | 'enforcement'   (nuevo)
          enforcedBy?: string   (referencia al mecanismo real: nombre
                                 de completion gate o de capability de
                                 EffectBroker — sólo si mechanism !== 'guidance')
      }

Reglas 'guidance'      → salida de prompt sin cambios (mayoría hoy)
Reglas 'verification'  → enforcedBy referencia un check de f00278
                          (requiredChecks[] del WorkIntent)
Reglas 'enforcement'   → enforcedBy referencia una capability de
                          r00037 (EffectBroker) — mientras esa capa
                          no exista, el catálogo declara
                          mechanism: 'enforcement', enforcedBy: null
                          y un lint falla explícitamente en vez de
                          fingir que ya está aplicada
```

## slices

### S1 — Campo `mechanism` en el contrato de reglas + clasificación completa del catálogo

- **Status**: pending
- **Files**:
    - `plugins/rules/src/lib/contracts/policy-resolution.contract.ts`
    - `plugins/rules/src/lib/registry/` (el fichero donde vive el
      catálogo de reglas concreto — localizar con
      `grep -rln "IRuleDefinition\|rule-catalog" plugins/rules/src/lib/registry`
      y anotar `mechanism` en cada entrada)
    - `plugins/rules/tests/src/lib/registry/rule-mechanism-classification.spec.ts` (nuevo:
      falla si alguna regla del catálogo no declara `mechanism`)
- **Gate**: `bunx vitest run plugins/rules/tests/src/lib/registry/rule-mechanism-classification.spec.ts`

### S2 — Lint: ninguna regla `enforcement` sin `enforcedBy` real

- **Status**: pending
- **Files**:
    - `tools/scripts/lint/rules-enforcement-mechanism.script.ts` (nuevo)
    - `tools/scripts/lint/rules-enforcement-mechanism.script.spec.ts` (nuevo)
- **Gate**: `bunx vitest run tools/scripts/lint/rules-enforcement-mechanism.script.spec.ts`

### S3 — Migrar el piloto: reglas de rutas/ramas protegidas a `enforcement` real

- **Status**: pending
- **Files**:
    - la(s) regla(s) concretas de "no tocar rutas protegidas"/"no
      push a `main`" en el catálogo de `plugins/rules`
    - `packages/core/src/lib/shared/git-write.ts` (el guard de
      `protectedBranches` ya existente — `AUD-D06` señala que hoy no
      tiene default en core; confirmar su estado real antes de
      declarar esta regla "enforced" y no sólo "declarada enforcement")
    - `plugins/rules/tests/src/lib/registry/protected-paths-enforcement.spec.ts` (nuevo)
- **Gate**: `bunx vitest run plugins/rules/tests/src/lib/registry/protected-paths-enforcement.spec.ts`

## dependency graph

Depende de `r00037` (EffectBroker) para que las reglas de
`enforcement` del piloto (S3) tengan un mecanismo real que enlazar más
allá de `protectedBranches` en `git-write.ts` (que ya existe de forma
puntual, sin componer con el resto de efectos). Depende de `f00278`
para el mecanismo de `verification` (completion gates) si el catálogo
clasifica alguna regla de esa categoría con `enforcedBy` apuntando a
un `requiredCheck` concreto. Dentro de esta propuesta: S1 no depende
de nada; S2 depende de S1 (necesita el campo `mechanism` para poder
lintar); S3 depende de S1 y S2.

## acceptance

- Toda regla del catálogo de `plugins/rules` declara `mechanism`.
- El lint de S2 falla si una regla declara `mechanism: 'enforcement'`
  sin `enforcedBy` apuntando a un mecanismo real verificable (no un
  string libre).
- Las reglas del piloto (rutas/ramas protegidas) tienen su
  `enforcedBy` verificado contra el guard real de
  `packages/core/src/lib/shared/git-write.ts`, no sólo declarado en el
  catálogo.

## risks and mitigations

- **Riesgo: clasificar una regla como `enforcement` sin que el
  mecanismo subyacente exista todavía da una falsa sensación de
  seguridad (la etiqueta dice "imposible" pero sigue siendo sólo
  texto).** Mitigación: el lint de S2 es explícitamente el guardián de
  esto — una regla `enforcement` sin `enforcedBy` verificable falla en
  CI, no se permite declarar la categoría como aspiración.
- **Riesgo: el catálogo de 185 ficheros hace que S1 sea más grande de
  lo estimado si la estructura no es tan uniforme como se asume.**
  Mitigación: S1 empieza con un `grep` de conteo real de
  `IRuleDefinition` antes de comprometerse a clasificar "todas" — si
  el catálogo resulta ser mucho más disperso, S1 se re-alcanza a un
  subconjunto representativo y el resto queda como slice de
  seguimiento explícito, no oculto.

## notes

El nombre `EffectBroker` no existe en el código hoy — es el nombre que
usa la auditoría (y `r00037`) para la capa de composición todavía no
construida sobre `guardEffectCapability`/`runWithDryRunGate`. Esta
propuesta depende de que `r00037` la construya para que el piloto de
S3 tenga un mecanismo real de `enforcement` que enlazar más allá del
guard puntual de `protectedBranches`.
