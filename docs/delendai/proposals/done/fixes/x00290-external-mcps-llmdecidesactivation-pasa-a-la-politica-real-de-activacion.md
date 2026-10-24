---
id: x00290
title: "external-mcps: llmDecidesActivation pasa a la política real de activación"
kind: fix
status: done
type: fix
track: security
date: 2026-08-27
parent-plan: q00011
audit-source:
    file: docs/mcp-vertex/audits/2026-08-27-develop-independent-audit-claude-opus5.md
    finding: AUD-D04
    snapshot: 2cf17373f32b536e0c5154892ceddbb5d490ab37
priority: P0
related: [q00011, x00291]
---

# x00290 — `external-mcps`: `llmDecidesActivation` pasa a la política real de activación

## Goal

Hacer que `llmDecidesActivation` gobierne de verdad la activación de un
servidor externo declarado: cuando es `false`, el proxy `call` rechaza
la activación de un servidor FRÍO iniciada por el modelo, sin tocar el
comportamiento de un servidor ya activo.

## Why

`options-schema.ts:155` declara `llmDecidesActivation: z.boolean().default(true)`
con semántica explícita en el comentario ("cuando es `true` (por defecto)
el LLM puede activar servidores dentro del conjunto declarado; cuando es
`false` sólo puede sugerir y un humano activa"), y `index.ts:57` la fija en
el `configExample`. Pero `grep -rn "llmDecidesActivation" plugins/external-mcps/src --include='*.ts' | grep -v spec`
sólo encuentra la declaración y dos comentarios — cero consumidores. El
único "consumidor" real era un test (`validate-config.spec.ts:204`) que
comprueba que el valor por defecto se parsea, lo cual explica por qué
nadie notó que el knob es inerte.

`invoke-proxy.ts` (`buildCallToolRegistration`) sí recibe
`requireHumanAckWhenLlmDecides` y `hasRecordedAck`, pero nunca
`llmDecidesActivation`: con el knob en `false`, registrar un ack y llamar
`call` activa el servidor exactamente igual que con el knob en `true`. Es
una opción de SEGURIDAD que el usuario pone a `false` esperando que el
modelo no pueda arrancar subprocesos de terceros por su cuenta, y no hace
nada.

## Why this design

La alternativa obvia — un `if (!llmDecidesActivation) return denied` en
línea dentro del handler del tool, junto al `if` existente de
`requireHumanAckWhenLlmDecides` — funciona pero deja la política de
autorización repartida entre condicionales de I/O, difícil de probar
exhaustivamente (el informe pide una matriz 2×2×2 y un caso adicional de
"servidor ya activo").

En su lugar, `activation-policy.ts` extrae la decisión a una función pura
`decideActivation(input): IActivationDecision` sin registry, sin reloj,
sin process — sólo booleanos de entrada y una salida `{allowed, code?,
hint?}`. `invoke-proxy.ts` se limita a reunir los cuatro insumos
(`llmDecidesActivation`, `requireHumanAckWhenLlmDecides`,
`alreadyActive` vía `registry.status()` — de sólo lectura, nunca arranca
nada — y `hasRecordedAck`) y a traducir el veredicto a `toolJson`. Esto
deja la matriz completa probada en un spec sin mocks
(`activation-policy.spec.ts`) y el wiring de I/O probado por separado
contra el registry real inyectado (`server-registry.spec.ts`).

Se distingue explícitamente "servidor ya activo" de "activación": un
servidor que ya tiene un child cacheado no está siendo ACTIVADO por esta
llamada, así que ninguno de los dos knobs le aplica — de lo contrario
`llmDecidesActivation: false` rompería servidores `eager: true` o
activados por un humano, que es el caso que el propio comentario del
schema describe como el camino humano válido.

## Non-goals

- No se implementa la "solución arquitectónica ideal" completa del
  informe (una matriz `(actor) × (requiere ack)` con un concepto
  explícito de actor `'llm' | 'human'`): no existe hoy ningún tool que
  distinga quién invoca — todo tool MCP lo invoca el modelo. El diseño
  aquí modela en su lugar la distinción que SÍ es observable:
  "activación de un servidor frío" vs. "llamada a un servidor ya activo",
  que es exactamente lo que el comentario original del schema describe.
- No se añade un tool `activate` dedicado para que un humano arranque un
  servidor sin pasar por `call` — el camino humano ya existente (declarar
  `eager: true` en config + reinicio del host) queda documentado en el
  hint de denegación, no se construye uno nuevo. Ampliarlo es trabajo de
  otra propuesta si se decide que hace falta.
- El guard genérico "toda clave de `OptionsSchema` tiene un consumidor"
  que el informe sugiere para CI no se construye aquí — se cubre por el
  matiz de esta propuesta el knob concreto que estaba muerto; el guard
  repo-wide es una herramienta de higiene separada, no específica de
  `external-mcps`.

## Architecture

Dos archivos nuevos, pequeños y puros, más el wiring:

- `src/lib/activation/activation-policy.interface.ts` — `IActivationPolicyInput`,
  `IActivationDecision`, `ActivationDenialCode`.
- `src/lib/activation/activation-policy.ts` — `decideActivation(input)`,
  pura, sin imports de I/O.
- `src/lib/tools/invoke-proxy.ts` — `IInvokeProxyOptions` gana
  `llmDecidesActivation: boolean` (requerido, no opcional: silenciar el
  knob por omisión es exactamente el bug que se está corrigiendo). El
  handler calcula `alreadyActive` con `registry.status()` (de sólo
  lectura) y delega en `decideActivation`; un veredicto `allowed: false`
  se traduce a `{ok:false, code, hint}` con el nuevo código
  `'llm-activation-disabled'` añadido a `CallOutputSchema`.
- `src/index.ts` — pasa `llmDecidesActivation: options.llmDecidesActivation`
  al construir el tool `call` (ya se leía `options.llmDecidesActivation`
  del schema parseado; sólo faltaba reenviarlo).

```ts
// invoke-proxy.ts (extracto)
const alreadyActive = options.registry
	.status()
	.find((row) => row.id === serverId)?.running ?? false;
const decision = decideActivation({
	llmDecidesActivation: options.llmDecidesActivation,
	requireHumanAckWhenLlmDecides: options.requireHumanAckWhenLlmDecides,
	alreadyActive,
	hasRecordedAck: acked,
});
if (!decision.allowed) {
	return toolJson({ ok: false, code: decision.code, hint: decision.hint });
}
```

## Slices

### S1 — módulo puro `activation-policy`

- **Status**: done
- **Files**: [`plugins/external-mcps/src/lib/activation/activation-policy.interface.ts`, `plugins/external-mcps/src/lib/activation/activation-policy.helper.ts`, `plugins/external-mcps/tests/src/lib/activation-policy.spec.ts`]
- **Gate**: `bunx vitest run --project external-mcps -- tests/src/lib/activation-policy.spec.ts`

### S2 — wiring en el proxy `call` + `index.ts`

- **Status**: done
- **Files**: [`plugins/external-mcps/src/lib/tools/invoke-proxy.ts`, `plugins/external-mcps/src/index.ts`, `plugins/external-mcps/tests/src/lib/server-registry.spec.ts`]
- **Gate**: `bunx vitest run --project external-mcps`

## Dependency graph

Ninguna. No depende de `x00291` (dispose) ni comparte archivos con ella
más allá de `src/index.ts`, donde ambos cambios son aditivos y no se
solapan en líneas.

## Acceptance

1. `grep -rn "llmDecidesActivation" plugins/external-mcps/src --include='*.ts' | grep -v spec`
   muestra el knob leído en `invoke-proxy.ts` y reenviado en `index.ts`,
   no sólo declarado.
2. `llmDecidesActivation: false` + servidor FRÍO + `call` del modelo ⇒
   `{ok:false, code:'llm-activation-disabled'}`, y `registry`/`spawner`
   registran CERO intentos de arranque (`h.spawnCalls` vacío en el spec).
3. `llmDecidesActivation: false` + servidor YA ACTIVO ⇒ la llamada
   procede con normalidad (no es una activación).
4. `llmDecidesActivation: true` (default) ⇒ comportamiento idéntico al
   anterior a esta propuesta — cae en la puerta de `requireHumanAckWhenLlmDecides`
   exactamente como antes.
5. Matriz 2×2×2 completa (`llmDecidesActivation` ×
   `requireHumanAckWhenLlmDecides` × `hasRecordedAck`) más el caso
   `alreadyActive` probada en `activation-policy.spec.ts` sin mocks.
6. `bunx vitest run --project external-mcps` en verde.
7. `bun tools/scripts/typecheck.script.ts` limpio.
8. `bun tools/scripts/lint/types-in-contracts.script.ts` no incrementa el
   baseline (los dos archivos nuevos son `*.interface.ts`/módulo puro sin
   tipos exportados fuera de ese archivo, exentos por convención).

## Risks and mitigations

| Riesgo | Mitigación |
| --- | --- |
| `llmDecidesActivation` pasa de opcional-ignorado a campo requerido en `IInvokeProxyOptions`, rompiendo cualquier caller que no lo pasara | Único caller productivo es `index.ts` (actualizado en S2); los cinco call-sites de test en `server-registry.spec.ts` se actualizaron en la misma propuesta. |
| Que `alreadyActive` se calcule mal y bloquee servidores `eager: true` que ya deberían estar sirviendo | `registry.status()` es de sólo lectura (no arranca nada) y ya tenía cobertura en `server-registry.spec.ts`'s `status` tests; se añadió un spec dedicado que primero arranca el child fuera del proxy y luego confirma que una segunda llamada con el knob en `false` sí se sirve. |
| Endurecer el default efectivo de un knob que antes no hacía nada podría sorprender a un usuario que ya tenía `llmDecidesActivation: false` en su config confiando (erróneamente) en que ya era efectivo | Es el comportamiento que el propio comentario del schema siempre prometió; el cambio es una corrección de bug de seguridad, no una nueva restricción — se documenta en el changelog del fix. |

## Notes

Si en el futuro se necesita un tool `activate` explícito para que un
humano arranque un servidor sin editar config + reiniciar, o el guard
genérico repo-wide de "toda opción del schema tiene un consumidor", son
propuestas separadas — ver Non-goals.
