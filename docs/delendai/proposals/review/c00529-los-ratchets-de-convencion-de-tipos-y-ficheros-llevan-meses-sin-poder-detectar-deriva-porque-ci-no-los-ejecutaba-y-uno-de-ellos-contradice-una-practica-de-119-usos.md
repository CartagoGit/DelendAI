---
id: c00529
title: "Los ratchets de convencion de tipos y ficheros llevan meses sin poder detectar deriva porque CI no los ejecutaba, y uno de ellos contradice una practica de 119 usos"
kind: chore
status: review
type: proposal
track: trust
date: 2026-09-08
last-transition-id: 154c2935-409f-4556-a6e4-ab8d01bab1a6
last-correlation-id: 154c2935-409f-4556-a6e4-ab8d01bab1a6
last-transition-from: in-progress
---

# c00529 — Los ratchets de convencion de tipos y ficheros llevan meses sin poder detectar deriva porque CI no los ejecutaba, y uno de ellos contradice una practica de 119 usos

## Goal

Decidir explicitamente que hacer con tres ratchets que hoy fallan en bloque, en vez de rebaselinarlos en silencio cada vez que alguien los mira.

## why

Al reparar CI el 2026-09-08 (ci.yml llevaba desde el 7-sep a las 23:01 sin ejecutar un solo job) quedaron visibles tres puertas del job lint-architecture que fallan con deuda acumulada, no con problemas puntuales: lint:types-in-contracts reporta 101 ficheros con tipos o constantes exportadas fuera de contracts/; lint:type-naming reporta 40 ficheros con tipos exportados sin prefijo I; lint:file-conventions reporta 12 ficheros sin rol reconocido, ademas de los 424 ya baselinados. Ninguna de las tres se puede saldar con un arreglo mecanico, y rebaselinarlas es aceptar deuda, no resolverla, que es exactamente lo que se hizo con file-conventions al pasar de 349 a 424 y por lo que existe r00052. El caso de lint:type-naming merece decision explicita porque hay una contradiccion real. La cabecera del script dice que las alias de tipo y las uniones de literales NO estan exentas, por decision registrada en c00157, de modo que cuentan como deuda a pagar. Pero el repositorio usa el prefijo T para alias y uniones de forma sistematica: 119 declaraciones export type T<Algo> en packages y plugins, incluidas piezas centrales como TProposalKind, TLifecycleStatus, TReconcileOutput, TCheckResult o TEvidenceBackend. O sea que la practica real del codigo y la regla del lint dicen cosas distintas, y cada trabajo nuevo que sigue la practica del codigo empeora el ratchet. Peor: renombrar TProposalKind a IProposalKind colisiona con el IProposalKind que ya existe en el plugin de proposals, asi que ni siquiera es un renombrado mecanico. Mientras esto no se decida, la puerta no mide calidad: mide cuanto tiempo lleva sin rebaselinarse.

## non-goals

- No rebaselinar las tres puertas para ponerlas en verde: eso es lo que hay que dejar de hacer.
- No renombrar 40 ficheros de tipos por decision de un agente: la ontologia de nombres es una decision de proyecto.

## Slices

- global_gate: lint

### S1 — resolver la contradiccion I contra T en la convencion de nombres
- **Status**: done
- **Files**: `tools/scripts/lint/type-naming.script.ts`, `docs/delendai/FILE-CONVENTIONS.md`
- **Gate**: lint
- acceptance:
  - "Queda escrito cual es la convencion real: o bien T es legitimo para alias y uniones y el lint lo acepta, o bien I es la unica forma y las 119 declaraciones T son deuda con plan de pago."
  - "Si se acepta T, el lint distingue interfaz de alias y aplica el prefijo que corresponda a cada uno; la cabecera del script deja de decir lo contrario y se registra que supersede la decision de c00157."
  - "Si se mantiene solo I, la propuesta enumera el conflicto de nombres conocido (TProposalKind contra el IProposalKind existente en plugins/proposals) y dice como se resuelve."
  - "La regla elegida queda documentada en FILE-CONVENTIONS.md, no solo en el comentario del script."
- review-state: done
- review-implementer: delendai-impl-20260908
- review-reviewer: delivery_verifier
- review-log: approved by delivery_verifier — Revisión independiente completada sobre ae8fa6df5. La documentación y el script declaran la misma convención: interfaces y aliases type exportados propios usan prefijo I; la deuda existente se mantiene como baseline y los nuevos incumplimientos se bloquean. El ratchet y diff --check pasan.
### S2 — los ratchets solo pueden bajar, nunca subir
- **Status**: done
- **Files**: `tools/scripts/lint/types-in-contracts.script.ts`, `tools/scripts/lint/biome-baseline.script.ts`
- **Gate**: lint
- acceptance:
  - "Cada script de ratchet falla si el baseline versionado CRECE, no solo si aparecen ficheros nuevos por encima de el."
  - "--update rechaza escribir un baseline mayor que el actual salvo con una bandera explicita que exige un motivo, para que aceptar deuda sea un acto deliberado y trazable."
  - "Existe un test por cada ratchet que cubre el caso de crecimiento."
- review-state: done
- review-implementer: delendai-impl-20260908
- review-reviewer: delivery_verifier
- review-log: approved by delivery_verifier — Revisión independiente completada sobre d86385883. Ambos ratchets comparan el estado actual con el baseline antes de escribir; --update rechaza el crecimiento salvo autorización explícita con bandera y motivo. Typecheck oficial de tools, bloqueo negativo de ambos scripts, get_errors y diff --check verificados.
### S3 — empezar a pagar types-in-contracts por el extremo que mas duele
- **Status**: done
- **DependsOn**: [S1]
- **Files**: `docs/delendai/TYPES-IN-CONTRACTS-DEBT.md`
- **Gate**: none
- acceptance:
  - "Los 101 ficheros quedan clasificados por paquete y por tipo de infraccion, con una estimacion de esfuerzo por grupo."
  - "Se identifica el subconjunto que es puramente mecanico (mover un tipo ya aislado a contracts/) frente al que requiere decision de diseno."
  - "Se fija un objetivo numerico de bajada para el siguiente ciclo; sin cifra no hay ratchet, solo una lista."
- review-state: done
- review-implementer: delendai-impl-20260908
- review-reviewer: delivery_verifier
- review-log: approved by delivery_verifier — Revisión independiente completada sobre 5263fe49c. El documento de deuda contiene inventario medido, clasificación por raíz y tipo, separación entre migración mecánica y decisiones de diseño, y un objetivo numérico verificable para el próximo ciclo.
## acceptance

- Queda escrito cual es la convencion real: o bien T es legitimo para alias y uniones y el lint lo acepta, o bien I es la unica forma y las 119 declaraciones T son deuda con plan de pago.
- Si se acepta T, el lint distingue interfaz de alias y aplica el prefijo que corresponda a cada uno; la cabecera del script deja de decir lo contrario y se registra que supersede la decision de c00157.
- Si se mantiene solo I, la propuesta enumera el conflicto de nombres conocido (TProposalKind contra el IProposalKind existente en plugins/proposals) y dice como se resuelve.
- La regla elegida queda documentada en FILE-CONVENTIONS.md, no solo en el comentario del script.
- Cada script de ratchet falla si el baseline versionado CRECE, no solo si aparecen ficheros nuevos por encima de el.
- --update rechaza escribir un baseline mayor que el actual salvo con una bandera explicita que exige un motivo, para que aceptar deuda sea un acto deliberado y trazable.
- Existe un test por cada ratchet que cubre el caso de crecimiento.
- Los 101 ficheros quedan clasificados por paquete y por tipo de infraccion, con una estimacion de esfuerzo por grupo.
- Se identifica el subconjunto que es puramente mecanico (mover un tipo ya aislado a contracts/) frente al que requiere decision de diseno.
- Se fija un objetivo numerico de bajada para el siguiente ciclo; sin cifra no hay ratchet, solo una lista.
