---
id: f00507
title: "Economía de rutas: el coste pertenece a la ruta de acceso, no al modelo, y primero se gasta lo ya pagado"
kind: feat
status: ready
type: proposal
track: routing-policy
date: 2026-09-04
---

# f00507 — Economía de rutas: el coste pertenece a la ruta de acceso, no al modelo, y primero se gasta lo ya pagado

## Goal

Separar en el routing dos cosas que hoy están confundidas: la capacidad del modelo y la economía de la ruta por la que se accede a él. Un mismo modelo alcanzado por un plan de OpenCode, por una suscripción directa o por una API de crédito tiene la misma capacidad base y tres economías distintas.

Se introduce una identidad estable de ruta (`proveedor:cuenta:modo-de-acceso:runtime:modelo`), su estado económico (modo de facturación, coste marginal, cuota restante y su escasez, saldo disponible) y un orden de preferencia por defecto: primero lo local y gratuito, después los planes ya pagados según cuota disponible, y sólo con autorización expresa el prepago o el gasto por consumo.

## why

`auto-agent-selector` v0.1.1 ya descubre proveedores, los rankea y construye escaleras de escalado, y `usage-tracking` ya mide actividad local. Lo que no existe —cero ocurrencias de «entitlement» en las propuestas abiertas— es el modelo económico que distingue un plan ya pagado de un saldo prepago o de una API por consumo, ni la escasez de cuota como dimensión separada del dinero.

La consecuencia es que hoy no se puede expresar la decisión correcta más obvia: entre dos rutas al mismo modelo, una con el 80 % del plan disponible y otra con el 10 %, preferir la primera; y entre una incluida en un plan ya pagado y una que empieza a gastar dinero, preferir la incluida. Un plan con coste marginal cero no tiene cuota infinita, así que dinero y escasez deben modelarse por separado o el router acabará quemando la reserva escasa en tareas triviales.

Hay además una restricción de seguridad que el diseño debe garantizar por construcción: el aprendizaje puede aprender qué ruta funciona mejor entre las autorizadas, y no puede jamás ampliar la autorización.

## non-goals

- No crear un router nuevo: se amplía `auto-agent-selector` y su ranking existente.
- No asociar coste al modelo ni al proveedor: el coste vive en la ruta y su entitlement.
- No activar gasto monetario por defecto bajo ninguna circunstancia.
- No implementar el aprendizaje de rutas — esta propuesta le deja el terreno preparado con las puertas duras ya cerradas.
- No tratar un presupuesto autorizado como un objetivo de gasto.

## Slices

- global_gate: type

### S1 — Identidad de ruta y estado económico
- **Status**: done
- **Files**: `plugins/auto-agent-selector/src/lib/routing/route-identity.ts`, `plugins/auto-agent-selector/tests/src/lib/routing/route-identity.spec.ts`
- **Gate**: type
- acceptance:
  - "La identidad de ruta combina proveedor, cuenta o perfil, modo de acceso, runtime y modelo, y es estable entre sesiones."
  - "Tres rutas al mismo modelo son tres identidades distintas con una sola capacidad base compartida."
  - "El estado económico declara modo de facturación — local, gratuito, incluido en plan, prepago, por consumo o desconocido — junto a coste marginal, cuota restante y saldo."
  - "La escasez de cuota se deriva de la cuota restante y su momento de reinicio, y es independiente del coste monetario."
- review-state: done
- review-implementer: claude-opus-5
- review-reviewer: reviewer-routing-panel
- review-log: approved by reviewer-routing-panel — Identidad de 5 segmentos con escapado de ':' y parseo inverso verificado; escasez derivada de quotaRemaining/quotaTotal/quotaResetsAt e independiente del dinero; 'unknown' modelado como modo propio y tratado como gasto. Defecto menor: no existe una representación explícita de la capacidad base compartida — sólo está implícita en el segmento `model`.
### S2 — Puertas duras antes de cualquier puntuación
- **Status**: done
- **DependsOn**: [S1]
- **Files**: `plugins/auto-agent-selector/src/lib/routing/eligibility-gates.ts`, `plugins/auto-agent-selector/tests/src/lib/routing/eligibility-gates.spec.ts`
- **Gate**: type
- acceptance:
  - "El pipeline aplica en orden autorización, entitlement, presupuesto, capacidades, salud y cuota, y sólo después puntúa."
  - "Una ruta no autorizada no llega a puntuarse: es imposible que gane por puntuación."
  - "Por defecto lo local y gratuito y los planes confirmados están activos, y el prepago, el consumo y la facturación desconocida están desactivados."
  - "Un presupuesto autorizado es un límite, no un objetivo: una llamada que lo excede se rechaza aunque quede saldo del periodo."
- review-state: done
- review-implementer: claude-opus-5
- review-reviewer: reviewer-routing-panel
- review-log: approved by reviewer-routing-panel — GATE_ORDER es el contrato y se testea; checkEligibility devuelve en la primera puerta que falla. La garantía estructural es real: eligibleRoutes filtra antes de cualquier puntuación, así que una ruta no autorizada no entra al conjunto candidato. Defecto por defecto correcto (local/free/plan-included on; prepaid/metered/unknown off). El presupuesto rechaza por techo por llamada aunque quede saldo del periodo.
### S3 — Preferencia por lo ya pagado y protección de la cuota escasa
- **Status**: done
- **DependsOn**: [S2]
- **Files**: `plugins/auto-agent-selector/src/lib/routing/economic-preference.ts`, `plugins/auto-agent-selector/tests/src/lib/routing/economic-preference.spec.ts`
- **Gate**: type
- acceptance:
  - "Entre dos rutas al mismo modelo con resultado equivalente, gana la incluida en un plan ya pagado frente a la que genera gasto."
  - "Entre dos planes al mismo modelo, gana el de mayor cuota disponible salvo señal de calidad o fiabilidad que lo desaconseje."
  - "Una tarea trivial no consume automáticamente la reserva escasa por una ventaja de calidad pequeña: el coste de oportunidad cuenta."
  - "Los seis casos económicos del handoff — cuota alta frente a baja, incluido frente a de pago, pago desactivado, límite mensual casi agotado, mejora sustancial autorizada y preferencia aprendida sin autorización — están cubiertos por tests."
- review-state: done
- review-implementer: claude-opus-5
- review-reviewer: reviewer-routing-panel
- review-log: approved by reviewer-routing-panel — Los seis casos del handoff están cubiertos uno a uno y numerados en el spec. La preferencia por lo ya pagado es un bono estructural y, sin allowPaidUpgrade, la ruta gratuita gana sin importar la puntuación (caso 6 verificado con calidad 1.0 vs 0.1). Defecto real: la preferencia por mayor cuota se apoya en quotaScarcity, que sólo tiene cuatro cubos — entre dos planes al 80 % y al 50 % ambos son 'ample', empatan y el ganador lo decide el orden de entrada, no la cuota. La acceptance «gana el de mayor cuota disponible» sólo se cumple cuando las dos rutas caen en cubos distintos.
### S4 — Selección explicable
- **Status**: pending
- **DependsOn**: [S3]
- **Files**: `plugins/auto-agent-selector/src/lib/routing/selection-explain.ts`, `plugins/auto-agent-selector/tests/src/lib/routing/selection-explain.spec.ts`
- **Gate**: type
- acceptance:
  - "Toda selección responde por qué se eligió esa ruta, qué alternativas se descartaron y por qué motivo cada una."
  - "Los componentes de la puntuación se conservan por separado; no se colapsan en una suma opaca."
  - "La explicación contiene datos, reglas y métricas — nunca razonamiento interno del modelo."
  - "El fallback declara su orden y su motivo en lugar de estar cableado de barato a caro."

## acceptance

- La identidad de ruta combina proveedor, cuenta o perfil, modo de acceso, runtime y modelo, y es estable entre sesiones.
- Tres rutas al mismo modelo son tres identidades distintas con una sola capacidad base compartida.
- El estado económico declara modo de facturación — local, gratuito, incluido en plan, prepago, por consumo o desconocido — junto a coste marginal, cuota restante y saldo.
- La escasez de cuota se deriva de la cuota restante y su momento de reinicio, y es independiente del coste monetario.
- El pipeline aplica en orden autorización, entitlement, presupuesto, capacidades, salud y cuota, y sólo después puntúa.
- Una ruta no autorizada no llega a puntuarse: es imposible que gane por puntuación.
- Por defecto lo local y gratuito y los planes confirmados están activos, y el prepago, el consumo y la facturación desconocida están desactivados.
- Un presupuesto autorizado es un límite, no un objetivo: una llamada que lo excede se rechaza aunque quede saldo del periodo.
- Entre dos rutas al mismo modelo con resultado equivalente, gana la incluida en un plan ya pagado frente a la que genera gasto.
- Entre dos planes al mismo modelo, gana el de mayor cuota disponible salvo señal de calidad o fiabilidad que lo desaconseje.
- Una tarea trivial no consume automáticamente la reserva escasa por una ventaja de calidad pequeña: el coste de oportunidad cuenta.
- Los seis casos económicos del handoff — cuota alta frente a baja, incluido frente a de pago, pago desactivado, límite mensual casi agotado, mejora sustancial autorizada y preferencia aprendida sin autorización — están cubiertos por tests.
- Toda selección responde por qué se eligió esa ruta, qué alternativas se descartaron y por qué motivo cada una.
- Los componentes de la puntuación se conservan por separado; no se colapsan en una suma opaca.
- La explicación contiene datos, reglas y métricas — nunca razonamiento interno del modelo.
- El fallback declara su orden y su motivo en lugar de estar cableado de barato a caro.
