---
id: f00506
title: "Validation Coordinator: misma garantía con una sola ejecución — caché por digest y unión de validaciones concurrentes"
kind: feat
status: done
type: proposal
track: validation-efficiency
date: 2026-09-04
shipped-in:
    - 5e57fa6a5 # S1 evidencia de validación indexada por digest
    - bdded19df # S1 (subsanación) persistencia en disco con withFileMutex + writeFileAtomic
    - b91872454 # S3 alcance derivado del grafo de impacto
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
- **Status**: done
- **Files**: `plugins/quality-policy/src/lib/services/validation-evidence.service.ts`, `plugins/quality-policy/tests/src/lib/services/validation-evidence.service.spec.ts`
- **Gate**: type
- **shipped-in**: 5e57fa6a5, bdded19df
- acceptance:
  - "Cada ejecución guarda validador, alcance, digest del árbol relevante, resultado, momento, duración y entradas consideradas."
  - "La clave de caché combina validador, digest de entrada, digest de configuración y digest de dependencias relevantes."
  - "Un cambio en cualquiera de esos digests invalida la entrada; un cambio irrelevante no."
  - "La evidencia se persiste por `withFileMutex` y `writeFileAtomic`, como exige el rail del repo."
- review-state: done
- review-implementer: claude-opus-5
- review-reviewer: reviewer-opus-5-peer
- review-log: approved by reviewer-opus-5-peer — Implementado en `bdded19df`: `IEvidenceStore` añade un implementador de fichero bajo `withFileMutex` + `writeFileAtomic` y el spec cubre dos escrituras concurrentes al mismo path sin pisarse. La inyección se conserva; el cambio cierra exactamente la aceptación que faltaba (persistencia) sin tocar el diseño de la caché.
### S2 — Coordinador: una ejecución, varios consumidores
- **Status**: done
- **DependsOn**: [S1]
- **Files**: `plugins/quality-policy/src/lib/services/validation-coordinator.service.ts`, `plugins/quality-policy/tests/src/lib/services/validation-coordinator.service.spec.ts`
- **Gate**: type
- acceptance:
  - "Tres peticiones concurrentes de la misma validación sobre el mismo digest producen una sola ejecución y tres consumidores del mismo resultado."
  - "Una petición que llega mientras hay una equivalente en vuelo se une a ella en lugar de arrancar otra."
  - "Un resultado cacheado válido se reutiliza sin ejecutar nada."
  - "Un fallo de la ejecución compartida se propaga a todos sus consumidores sin quedar cacheado como éxito."
- review-state: done
- review-implementer: claude-opus-5
- review-reviewer: reviewer-watchdog-validation
- review-log: approved by reviewer-watchdog-validation — Las cuatro aceptaciones se cumplen, y el punto crítico está bien resuelto. El registro en vuelo es SÍNCRONO: entre `const running = inFlight.get(hash)` y `inFlight.set(hash, execution)` no hay ni un `await`; la llamada a `resolve(request)` sólo crea la promesa y el `.finally()` se encadena sobre ella, de modo que tres llamantes en el mismo tick no pueden fallar los tres el lookup. Es importante que la búsqueda de evidencia (`findReusableEvidence`, que es async) esté DENTRO de `resolve` y por tanto dentro de lo compartido: sacarla fuera habría reabierto exactamente la carrera.

El test que lo protege existe y arranca de verdad en paralelo: `Promise.all([coordinator.validate(...), coordinator.validate(...), coordinator.validate(...)])` construye las tres llamadas sin ningún `await` entre ellas, y luego espera. Comprobé su poder discriminante en lugar de suponerlo: reproduje la variante con un `await` insertado entre el miss y el `set` y el contador de ejecuciones sube a 3, así que el test caería por `expect(validator.calls).toBe(1)` (y además colgaría, porque el `controllable` sólo resuelve la última ejecución). Un test secuencial no lo vería.

El resto: `inFlightCount()` prueba que un llamante tardío se une en vez de arrancar otra ejecución; una evidencia `pass` válida se reutiliza sin llamar al validador (`called === false`); un fallo llega a los tres consumidores y no queda cacheado como éxito — S1 se niega a reutilizar un `fail`, con test de que la siguiente petición vuelve a ejecutar; y un `throw` se propaga a todos y limpia el mapa en el `finally`, con test de que `inFlightCount()` vuelve a 0 tras el error (una entrada filtrada habría entregado una promesa muerta al siguiente).

Defectos anotados, no bloqueantes: (1) un llamante que se une a una ejecución que acabó reutilizando evidencia recibe `source: 'joined-in-flight'` aunque no se ejecutase nada — la métrica de "ejecuciones ahorradas" queda ligeramente sesgada; (2) la unión sólo cubre el mismo proceso, así que el caso de tres agentes en procesos distintos sobre el mismo checkout sigue dependiendo del store persistente que a S1 le falta (ya está en su `request_changes`). Cerrar S1 es lo que hace que S2 valga fuera de un único proceso.

Verificado en d1feb0a3a: typecheck exit 0, `bunx vitest run --root plugins/quality-policy` 5 ficheros / 50 tests, todos verdes.
### S3 — Alcance derivado del grafo de impacto
- **Status**: done
- **DependsOn**: [S2]
- **Files**: `plugins/quality-policy/src/lib/services/validation-scope.service.ts`, `plugins/quality-policy/tests/src/lib/services/validation-scope.service.spec.ts`
- **Gate**: type
- **shipped-in**: b91872454
- acceptance:
  - "El alcance `targeted` / `affected` / `full` se deriva de ficheros cambiados, imports, grafo de paquetes, contratos, salidas generadas y tests, consumiendo `impact-analysis`."
  - "Las fronteras duras — release, `main`, contratos públicos, seguridad — fuerzan `full` con independencia del grafo."
  - "Cuando el grafo demuestra que ampliar el alcance no añade cobertura significativa, no se amplía."
  - "El nivel elegido y su motivo quedan registrados para poder auditarlo."
- review-state: done
- review-implementer: claude-opus-5
- review-reviewer: reviewer-routing-panel
- review-log: approved by reviewer-routing-panel — El adaptador `fromImpactAnalysis` se tipifica estructuralmente sobre `IImpactAnalyzeOutput`, mapea `dependents → dependentFiles` y `recommendedTests → coveringTests`, marca `incomplete` cuando `truncated: true` (corrigiendo el “truncado baja el alcance”), y queda probado por un spec que parte de una salida con esa forma y llega a una decisión. La nota menor sobre persistencia de la decisión se delega al store de S1, ya implementada.

Estado verificado en d1feb0a3a: typecheck exit 0, `bunx vitest run --root plugins/quality-policy` 50/50 verdes. Lo que falta es alcance, no corrección.
- review-state: in_review
- review-implementer: claude-opus-5
- review-log: requested_changes by reviewer-watchdog-validation — Tres de las cuatro aceptaciones se cumplen y la lógica está bien pensada. Las fronteras duras fuerzan `full` con `forcedBy` y sin consultar el grafo (public-contract, security, release, main-branch), con test parametrizado sobre las cuatro y con el caso extra que importa: una frontera dura gana también sobre un grafo `incomplete`. El no-ampliar está resuelto de forma comprobable en lugar de por criterio: `wideningAddsCoverage` compara `coveringTests.length` con `totalTests`, así que "ampliar no añade cobertura" es una comparación auditable y no una opinión. Y `IScopeDecision` lleva `scope`, `reason` y un bloque `evidence` con los conteos sobre los que se decidió, en todas las ramas (hay test de que ninguna rama se queda sin razón). Buen detalle además el tratamiento de `incomplete`: la ausencia de evidencia se lee como `full` y no como "el cambio es pequeño".
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
