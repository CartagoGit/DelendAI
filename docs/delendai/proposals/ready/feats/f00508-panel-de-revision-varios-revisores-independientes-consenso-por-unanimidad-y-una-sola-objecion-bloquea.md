---
id: f00508
title: "Panel de revisión: varios revisores independientes, consenso por unanimidad y una sola objeción bloquea"
kind: feat
status: ready
type: proposal
track: workflow
related:
    - f00503 # aporta la señal de riesgo que decide el cuórum
date: 2026-09-04
---

# f00508 — Panel de revisión: varios revisores independientes, consenso por unanimidad y una sola objeción bloquea

## Goal

Que un slice pueda exigir el acuerdo de varios revisores independientes —idealmente de modelos distintos— cuando lo que está en juego lo justifica, y siga costando un solo revisor cuando no. El número de revisores es una decisión de riesgo, no una constante.

## why

Hoy `proposal_review` exige que el revisor no sea el implementador, y eso ya evita el autoengaño más obvio. Pero sigue habiendo un único par de ojos, y si ese revisor comparte el punto ciego del implementador —cosa probable cuando ambos son el mismo modelo— el slice se cierra con el fallo dentro. En esta misma sesión ocurrió el caso concreto: el implementador declaró como no cumplida una aceptación de f00506 S1 (la persistencia en disco) y fue él mismo quien tuvo que señalarlo, porque no había nadie más mirando.

Lo que aporta un panel no es más votos, es más puntos ciegos distintos. De ahí la decisión de diseño que sostiene toda la propuesta: el consenso se alcanza por UNANIMIDAD, no por mayoría. Una sola objeción de cualquier miembro del panel bloquea el cierre. La mayoría sería activamente peor que un revisor solo: con tres revisores y voto por mayoría, dos aprobaciones superficiales entierran al único revisor que encontró el fallo real, y el sistema devolvería más confianza con menos verdad. Un panel que sólo puede aprobar cuando nadie objeta convierte a cada miembro añadido en una oportunidad más de encontrar el fallo, nunca en una oportunidad más de taparlo.

La divergencia entre revisores se registra en el log del slice en vez de resolverse promediando. Que dos revisores discrepen sobre si una aceptación se cumple es información valiosa sobre el contrato del slice —normalmente significa que está mal redactado— y desaparece si se resuelve por conteo.

## non-goals

- Elegir o invocar modelos concretos. Esta propuesta define el contrato de cuórum; qué agente o qué modelo revisa lo decide quien orquesta, y el panel funciona igual con tres subagentes del mismo modelo (peor, pero válido) que con tres modelos distintos.
- Resolver la divergencia automáticamente. Si dos revisores discrepan, el slice queda en changes_requested con ambas posturas registradas; decidir quién tiene razón es trabajo humano o del siguiente round, no de un desempate automático.
- Cambiar la regla de independencia existente (revisor != implementador) ni el encadenamiento de revisores distintos entre rounds. El panel se apoya en ambas, no las sustituye.

## Slices

- global_gate: type

### S1 — Cuórum en la máquina de estados pura: N aprobaciones distintas cierran, una objeción bloquea
- **Status**: pending
- **Files**: `plugins/proposals/src/lib/swarm/proposal-review.ts`, `plugins/proposals/tests/src/lib/swarm/proposal-review-panel.spec.ts`
- **Gate**: type
- acceptance:
  - "Con un cuórum de N, el slice permanece en revisión hasta acumular N aprobaciones de N agentes distintos, y sólo entonces pasa a done."
  - "Un mismo agente no puede aportar dos aprobaciones al mismo cuórum."
  - "Una sola petición de cambios de cualquier miembro deja el slice en changes_requested de inmediato, sin esperar al resto del panel."
  - "Reabrir un round descarta las aprobaciones acumuladas: son prueba sobre un código que ya cambió."
  - "Con cuórum 1 el comportamiento es byte a byte el de hoy, de modo que desactivar el panel no es un camino de código aparte."
- review-state: in_review
- review-implementer: claude-opus-5
### S2 — Persistencia y lectura del cuórum en el documento de la propuesta
- **Status**: pending
- **DependsOn**: [S1]
- **Files**: `plugins/proposals/src/lib/swarm/proposal-review-lines.ts`, `plugins/proposals/tests/src/lib/swarm/proposal-review-lines.spec.ts`
- **Gate**: type
- acceptance:
  - "El estado del panel se serializa en líneas del slice legibles por humanos, sin sidecar, junto a las líneas de review ya existentes."
  - "Un documento escrito antes de esta propuesta se lee sin pérdida y equivale a un cuórum de 1 ya satisfecho o pendiente según su estado actual."
  - "Las líneas del panel sobreviven a un ciclo de escritura y relectura sin alterar el resto del bloque del slice."
- review-state: in_review
- review-implementer: claude-opus-5
### S3 — Cuórum adaptativo: el riesgo de la slice decide cuántos revisores, y el usuario manda sobre el riesgo
- **Status**: pending
- **DependsOn**: [S1]
- **Files**: `plugins/proposals/src/lib/swarm/review-panel-policy.ts`, `plugins/proposals/tests/src/lib/swarm/review-panel-policy.spec.ts`
- **Gate**: type
- acceptance:
  - "El cuórum lo decide el riesgo de la slice, no una tasa fija: la política acepta una señal de riesgo y devuelve cuántos revisores hacen falta."
  - "Sin señal de riesgo, y por defecto, el cuórum es 1 — exactamente el contrato de hoy. El panel encarece una slice sólo cuando algo dice que vale la pena."
  - "Un dominio de alto riesgo (concurrencia y locking, seguridad, migraciones, contratos públicos) resuelve un cuórum mayor que uno de bajo riesgo."
  - "La configuración del usuario manda sobre el riesgo calculado, en ambos sentidos: puede forzar un cuórum concreto y puede desactivar el panel del todo."
  - "Un cuórum resultante por debajo de 1 o por encima de 4 se rechaza con un mensaje que dice qué valor se aceptaría, en vez de recortarse en silencio."
  - "La política es una función pura sobre la señal de riesgo y las opciones; no lee configuración ni clasifica riesgo por su cuenta."

> **Enmienda tras la revisión del usuario (2026-09-05): el cuórum es
> adaptativo, no una tasa fija.** La redacción original ponía el panel
> activo por defecto con cuórum 2 para toda slice. Eso está mal, y el
> motivo es el mismo que sostiene el resto del proyecto: cada revisor
> extra es otro agente, otro contexto, otros tokens y otra oportunidad
> de que la ronda se atasque. Un typo no merece implementador más dos
> revisores; un cambio en el protocolo de locks o en una superficie
> pública sí.
>
> Un cuórum fijo de 2 habría metido coste constante justo en el sistema
> cuya tesis es gastar en proporción a lo que hay en juego — habríamos
> comprado fiabilidad nominal pagándola con la eficiencia adaptativa que
> es el objetivo. Así que el número deja de ser una constante y pasa a
> ser una salida de la Adaptive Execution Policy (`f00503`): esta slice
> aporta la función que traduce riesgo en cuórum, y `f00503` aporta la
> señal de riesgo. Mientras esa señal no exista, el defecto es 1, que es
> el comportamiento actual — el panel no encarece nada hasta que hay un
> motivo medible para hacerlo.
- review-state: in_review
- review-implementer: claude-opus-5
### S4 — La herramienta de review aplica el cuórum y dice a quién le toca
- **Status**: pending
- **DependsOn**: [S2, S3]
- **Files**: `plugins/proposals/src/lib/swarm/proposal-review-tool-quorum.ts`, `plugins/proposals/tests/src/lib/swarm/proposal-review-tool-quorum.spec.ts`
- **Gate**: type
- acceptance:
  - "Una aprobación que no completa el cuórum devuelve cuántas faltan y que el siguiente revisor debe ser un agente distinto, en vez de parecer un cierre."
  - "Una aprobación que completa el cuórum cierra el slice y libera el lock igual que hoy."
  - "Un agente que ya aprobó y vuelve a aprobar recibe la razón exacta del rechazo, no un error genérico."
  - "close_slice sigue exigiendo revisión aprobada y ahora entiende un cuórum incompleto como revisión no terminada."

## acceptance

- Con un cuórum de N, el slice permanece en revisión hasta acumular N aprobaciones de N agentes distintos, y sólo entonces pasa a done.
- Un mismo agente no puede aportar dos aprobaciones al mismo cuórum.
- Una sola petición de cambios de cualquier miembro deja el slice en changes_requested de inmediato, sin esperar al resto del panel.
- Reabrir un round descarta las aprobaciones acumuladas: son prueba sobre un código que ya cambió.
- Con cuórum 1 el comportamiento es byte a byte el de hoy, de modo que desactivar el panel no es un camino de código aparte.
- El estado del panel se serializa en líneas del slice legibles por humanos, sin sidecar, junto a las líneas de review ya existentes.
- Un documento escrito antes de esta propuesta se lee sin pérdida y equivale a un cuórum de 1 ya satisfecho o pendiente según su estado actual.
- Las líneas del panel sobreviven a un ciclo de escritura y relectura sin alterar el resto del bloque del slice.
- Sin configuración alguna el panel está activo con un cuórum por defecto de 2, que es el mínimo que aporta un punto ciego distinto.
- Poner el panel a desactivado resuelve un cuórum de 1 y restaura el contrato de un solo revisor.
- Un cuórum configurado por debajo de 1 o por encima de 4 se rechaza con un mensaje que dice qué valor se aceptaría, en vez de recortarse en silencio.
- La política se resuelve en una función pura a partir de las opciones del plugin, sin leer configuración por su cuenta.
- Una aprobación que no completa el cuórum devuelve cuántas faltan y que el siguiente revisor debe ser un agente distinto, en vez de parecer un cierre.
- Una aprobación que completa el cuórum cierra el slice y libera el lock igual que hoy.
- Un agente que ya aprobó y vuelve a aprobar recibe la razón exacta del rechazo, no un error genérico.
- close_slice sigue exigiendo revisión aprobada y ahora entiende un cuórum incompleto como revisión no terminada.
