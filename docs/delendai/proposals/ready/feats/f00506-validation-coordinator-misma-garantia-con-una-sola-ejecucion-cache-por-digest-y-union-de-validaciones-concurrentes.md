---
id: f00506
title: "Validation Coordinator: misma garantía con una sola ejecución — caché por digest y unión de validaciones concurrentes"
kind: feat
status: ready
type: proposal
track: validation-efficiency
date: 2026-09-04
---

# f00506 — Validation Coordinator: misma garantía con una sola ejecución — caché por digest y unión de validaciones concurrentes

## Goal

Validar lo mínimo necesario para obtener la misma seguridad, no validar menos. Tres piezas: una caché de evidencia de validación indexada por digest, la unión de validaciones equivalentes que ya están en vuelo, y niveles de alcance (`targeted` / `affected` / `full`) derivados del grafo de impacto en lugar de "algo cambió, valídalo todo".

Cuando tres agentes piden la misma validación sobre el mismo digest, se ejecuta una vez y la consumen los tres.

## why

El objetivo no es relajar la validación: es dejar de repetirla. Hoy no hay forma de saber que una validación ya se ejecutó sobre exactamente el mismo estado, así que se relanza. En un árbol compartido con varios agentes eso es especialmente caro, porque `bun run test` toma el lock de cómputo y una suite completa se mide en minutos: mientras uno revalida lo ya validado, los demás esperan.

`quality-policy` ya aporta el `settlement-runner` y el modelo de asentamiento que `q00015` formaliza, e `impact-analysis` ya construye el grafo que permite acotar el alcance. Lo que falta entre ambos es la evidencia reutilizable —qué validador, sobre qué digest, con qué resultado y cuándo— y el coordinador que impide arrancar una segunda ejecución idéntica.

## non-goals

- No reducir la garantía en las fronteras: release, `main`, contratos públicos y seguridad conservan sus reglas duras y su validación completa.
- No sustituir `quality-policy` ni su `settlement-runner`: esta propuesta le añade evidencia y coordinación.
- No reimplementar el grafo de impacto — se consume el de `impact-analysis`.
- No cachear a través de cambios de configuración o de dependencias: eso invalida la entrada.

## Slices

- global_gate: type

### S1 — Evidencia de validación indexada por digest
- **Status**: pending
- **Files**: `plugins/quality-policy/src/lib/services/validation-evidence.service.ts`, `plugins/quality-policy/tests/src/lib/services/validation-evidence.service.spec.ts`
- **Gate**: type
- acceptance:
  - "Cada ejecución guarda validador, alcance, digest del árbol relevante, resultado, momento, duración y entradas consideradas."
  - "La clave de caché combina validador, digest de entrada, digest de configuración y digest de dependencias relevantes."
  - "Un cambio en cualquiera de esos digests invalida la entrada; un cambio irrelevante no."
  - "La evidencia se persiste por `withFileMutex` y `writeFileAtomic`, como exige el rail del repo."
- review-state: changes_requested
- review-implementer: claude-opus-5-f00506
- review-reviewer: reviewer-opus-5-peer
- review-log: requested_changes by reviewer-opus-5-peer — Tres de las cuatro aceptaciones se cumplen y están bien resueltas: `IValidationEvidence` guarda validador, alcance, digests, resultado, momento, duración y `relevantInputs`; `deriveEvidenceKey` combina validador + scope + inputDigest + configDigest + dependencyDigest con longitud prefijada (buena defensa contra colisiones por delimitador); y cambiar cualquier digest cambia la clave, así que la invalidación es estructural en lugar de una decisión en tiempo de lectura. Falla la cuarta: "La evidencia se persiste por `withFileMutex` y `writeFileAtomic`, como exige el rail del repo". No hay persistencia: `IEvidenceStore` es una interfaz inyectada y el único implementador en el árbol es un doble en memoria dentro del propio spec. Ni `withFileMutex` ni `writeFileAtomic` se importan en validation-evidence.service.ts. Con eso la evidencia no sobrevive al proceso, que es exactamente el caso de uso de la propuesta (tres agentes concurrentes en un checkout compartido reutilizando la misma prueba); un store en memoria no comparte nada entre procesos. Para cerrar: añadir el store de fichero real —lectura y escritura del índice bajo `withFileMutex` y con `writeFileAtomic`— y un test que demuestre que dos escrituras concurrentes no se pisan. La inyección puede quedarse: lo que falta es el implementador canónico, no cambiar el diseño.
### S2 — Coordinador: una ejecución, varios consumidores
- **Status**: pending
- **DependsOn**: [S1]
- **Files**: `plugins/quality-policy/src/lib/services/validation-coordinator.service.ts`, `plugins/quality-policy/tests/src/lib/services/validation-coordinator.service.spec.ts`
- **Gate**: type
- acceptance:
  - "Tres peticiones concurrentes de la misma validación sobre el mismo digest producen una sola ejecución y tres consumidores del mismo resultado."
  - "Una petición que llega mientras hay una equivalente en vuelo se une a ella en lugar de arrancar otra."
  - "Un resultado cacheado válido se reutiliza sin ejecutar nada."
  - "Un fallo de la ejecución compartida se propaga a todos sus consumidores sin quedar cacheado como éxito."

### S3 — Alcance derivado del grafo de impacto
- **Status**: pending
- **DependsOn**: [S2]
- **Files**: `plugins/quality-policy/src/lib/services/validation-scope.service.ts`, `plugins/quality-policy/tests/src/lib/services/validation-scope.service.spec.ts`
- **Gate**: type
- acceptance:
  - "El alcance `targeted` / `affected` / `full` se deriva de ficheros cambiados, imports, grafo de paquetes, contratos, salidas generadas y tests, consumiendo `impact-analysis`."
  - "Las fronteras duras — release, `main`, contratos públicos, seguridad — fuerzan `full` con independencia del grafo."
  - "Cuando el grafo demuestra que ampliar el alcance no añade cobertura significativa, no se amplía."
  - "El nivel elegido y su motivo quedan registrados para poder auditarlo."

## acceptance

- Cada ejecución guarda validador, alcance, digest del árbol relevante, resultado, momento, duración y entradas consideradas.
- La clave de caché combina validador, digest de entrada, digest de configuración y digest de dependencias relevantes.
- Un cambio en cualquiera de esos digests invalida la entrada; un cambio irrelevante no.
- La evidencia se persiste por `withFileMutex` y `writeFileAtomic`, como exige el rail del repo.
- Tres peticiones concurrentes de la misma validación sobre el mismo digest producen una sola ejecución y tres consumidores del mismo resultado.
- Una petición que llega mientras hay una equivalente en vuelo se une a ella en lugar de arrancar otra.
- Un resultado cacheado válido se reutiliza sin ejecutar nada.
- Un fallo de la ejecución compartida se propaga a todos sus consumidores sin quedar cacheado como éxito.
- El alcance `targeted` / `affected` / `full` se deriva de ficheros cambiados, imports, grafo de paquetes, contratos, salidas generadas y tests, consumiendo `impact-analysis`.
- Las fronteras duras — release, `main`, contratos públicos, seguridad — fuerzan `full` con independencia del grafo.
- Cuando el grafo demuestra que ampliar el alcance no añade cobertura significativa, no se amplía.
- El nivel elegido y su motivo quedan registrados para poder auditarlo.
