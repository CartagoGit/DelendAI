---
id: q00016
title: "Plan cerrar la auditoría externa de 2026-09-03: determinismo de generadores, contención física y la superficie que todavía cuesta tokens"
kind: plan
status: done
type: proposal
track: quality
date: 2026-09-03
shipped-in:
  - "93b532128"
  - "6a38d1790"
  - "8f4a11dd1"
  - "829d7ba35"
  - "9284894b5"
  - "902b56cb3"
  - "a297618fd"
last-transition-id: a27cf75e-2137-4cb2-896d-1e943995e3cb
last-correlation-id: a27cf75e-2137-4cb2-896d-1e943995e3cb
last-transition-from: review
---

# q00016 — Cerrar el delta de la auditoría externa de 2026-09-03

## Goal

Cerrar lo que queda abierto de las dos pasadas de auditoría externa del
2026-09-03, sin volver a levantar lo que ya está cerrado.

De los diecinueve hallazgos de esas dos pasadas, once se arreglaron el
mismo día. Este plan es **sólo el resto**, y existe para que ese resto no
se pierda entre el trabajo nuevo — que es exactamente lo que la segunda
pasada reprochó a la primera.

## why

Tres razones para tratar el resto como un plan y no como propuestas
sueltas.

**Las tres primeras slices son la misma clase de defecto.** Un generador
cuya salida depende de dónde vive un fichero, o de cómo se llama, produce
información falsa sobre el repositorio — y esa información va dirigida a
agentes. `AGENT.md` le dice a `packages/client` que
`@mcp-vertex/core` es agnóstico, que no lea con `node:fs`, y que no tiene
tests. Las tres afirmaciones son falsas para ese paquete. Un agente que
las obedezca escribe tests duplicados o rechaza un `node:fs` legítimo.
Arreglar el orden de `readdir` (hecho) no arregla eso: el generador sigue
adivinando en vez de medir.

**La contención por symlink es la única frontera de seguridad abierta.**
`resolveWorkspaceContained` es léxica y lo documenta honestamente, pero
delegar el resto al sandbox del host significa que un repositorio no
confiable con `foo -> /home/user/.ssh` sale del workspace en cuanto el
host lo permita. `contain-realpath.ts` ya existe y `fs-write` ya lo usa;
lo que falta es aplicarlo en el camino de LECTURA, que es el que un
repositorio hostil puede aprovechar.

**El coste de tokens que queda está concentrado, no repartido.** Las
mediciones propias del repo lo dicen: `proposals` 50,9 KB en 34
herramientas, `project-kpis` 9,9 KB en UNA, de los cuales 8,5 KB son
exclusivamente su `outputSchema`. No hay que optimizar 197 herramientas;
hay que atacar dos superficies. Y la superficie `adaptive` sigue en 4,9 KB,
así que esto no es una emergencia: es la optimización más rentable que
queda.

## why this design

**Medir en vez de adivinar.** El detector de hotspots busca ficheros que
se llamen `*.schema.ts` o `*.tools.ts` en `src/`. El repositorio ya mide
los bytes reales de cada herramienta en `tools/list`. Un generador que
consume la medición real no puede equivocarse sobre cuál es el hotspot
más grande — que es justo lo que le pasa hoy con `project-kpis`.

**Las invariantes vienen del workspace, no de un ternario.** Hoy son
`scope.isPlugin ? PLUGIN_RULES : CORE_RULES`. Deben venir de metadatos
declarados por el paquete, para que añadir un paquete nuevo no herede
reglas escritas para otro.

**Dos primitivas de contención, no una más lista.** Una léxica para rutas
que todavía no existen (escritura), y una física con `realpath` para
rutas que sí existen (lectura). Intentar que una sola función cubra ambos
casos es cómo se acaba llamando a `realpath` sobre un fichero que aún no
se ha creado.

**Divulgación progresiva, no una mega-herramienta.** La tentación con
`proposals` es fusionar 34 herramientas en una con un
`z.discriminatedUnion` gigante. Eso mueve el peso del nombre y la
descripción al `inputSchema` y no ahorra nada. Lo que ahorra es exponer
ocho herramientas esenciales y descubrir/invocar el resto por el router
estable cuando `auto_work` lo devuelve como siguiente acción. Esto evita
acoplar el runtime genérico al estado interno de una propuesta.

## non-goals

- **NO** protege `develop` con required checks. La auditoría lo confirmó
  como decisión deliberada: `develop` es el diario compartido, `main` es
  la frontera. Lo único obsoleto es el comentario de `drift.yml` que dice
  lo contrario.
- **NO** elimina `outputSchema` para ahorrar bytes. El contrato tipado es
  el activo; lo que se mueve es CUÁNDO se describe el detalle.
- **NO** reduce cada herramienta un 5 %. La concentración demuestra que
  eso es trabajo sin retorno.
- **NO** divide paquetes por estética. La auditoría es explícita en que
  no hace falta inventar `plugin-sdk` todavía.

## Slices

- global_gate: lint, types, test

### S1 — `AGENT.md` deja de inventarse las reglas de cada paquete

- **Status**: done — `93b532128`. `packages/client/AGENT.md` no longer carries `core`'s invariants; the rules come from `agent-md-rules.ts` keyed by workspace class, and an undeclared package receives only the universal repo rules.
- **Files**:
  - `tools/scripts/gen/agent-md.script.ts` — las invariantes salen de metadatos declarados por el workspace, no de `scope.isPlugin ? PLUGIN_RULES : CORE_RULES`. Un paquete que no declara nada recibe sólo las reglas universales del repo, nunca las de `core`.
  - `tools/scripts/gen/agent-md-rules.ts` — registro tipado: qué invariante aplica a qué clase de workspace y por qué. Puro, sin I/O.
  - `tools/scripts/gen/agent-md.script.spec.ts` — un paquete que no es `core` NUNCA recibe la invariante "core es agnóstico" ni la de "no leas con node:fs".
- **Gate**: lint, types, test

### S2 — Los hotspots de tokens salen de la medición real, no del nombre del fichero

- **Status**: done — `93b532128`. `plugins/project-kpis/AGENT.md` now names `project_kpis` at 9,898 B with 8,518 B of `outputSchema`, parsed from the real measurement in `TOKEN-BUDGETS.md` instead of guessed from filenames. (S7 has since cut that to 2,895 B; the generator will follow the measurement down.)
- **Files**:
  - `tools/scripts/gen/agent-md.script.ts` — la sección de hotspots consume los bytes medidos por herramienta que el repo ya calcula, en lugar de buscar ficheros que se llamen `*.schema.ts`.
  - `tools/scripts/gen/agent-md.script.spec.ts` — con una medición que atribuye 8.518 B al `outputSchema` de `project_kpis`, el `AGENT.md` de ese plugin debe nombrarlo. Hoy dice `_(none)_`, que es la respuesta contraria a la correcta.
- **Gate**: lint, types, test

### S3 — Un gate de determinismo para todos los generadores, no sólo para el que ya falló

- **Status**: done — `6a38d1790`, hardened in `8f4a11dd1`. The gate found a real problem on its first run and then found a real problem in itself: it asserted "nothing changed in the repository between those runs" without ever checking, and blamed a generator for a concurrent agent's edit. It now fingerprints the inputs and reports stable / inconclusive / violation as three distinct outcomes.
- **Files**:
  - `tools/scripts/lint/generated-determinism.script.ts` — ejecuta `gen:all` dos veces y compara hashes. Un generador que no coincide consigo mismo no puede pasar su propio drift-check, y esa clase de fallo tumbó CI durante días sin que nada lo dijera.
  - `tools/scripts/lint/generated-determinism.script.spec.ts` — incluye el caso metamórfico: mismo estado semántico con `readdir` en otro orden produce los mismos bytes.
- **Gate**: lint, types, test

### S4 — Contención física en el camino de lectura

- **Status**: done — con una corrección al diagnóstico. La auditoría dio el escape por symlink como abierto, y yo lo repetí aquí. NO lo estaba: `fs-read.ts` compone la comprobación léxica con `realpathContained` desde el 2026-07-22 (a00068, `17ed8d82a`), y `SafeWorkspaceReader` implementa por su cuenta la misma separación léxico/físico con sus propios tests de symlinks reales. Lo que la auditoría leyó fue el comentario del primitivo léxico — que describe correctamente ESE primitivo — sin mirar a sus llamadores. Lo que faltaba de verdad, y es lo que se entrega: el primitivo físico con nombre y reutilizable que este plan pedía, y un motivo diagnosticable, porque hasta ahora "se escapó por un symlink" y "no existe" devolvían exactamente lo mismo
- **Files**:
  - `packages/core/src/lib/shared/contain-path.ts` — separa `resolveWorkspaceContainedLexical` (rutas que aún no existen) de `resolveExistingWorkspaceContained` (compara `realpath` de raíz y destino).
  - `packages/core/src/lib/shared/fs-read.ts` — el camino de lectura usa la variante física. `fs-write` ya lo hace; leer es el lado que un repositorio hostil puede aprovechar.
  - `packages/core/tests/src/lib/shared/contain-realpath-read.spec.ts` — un symlink dentro del workspace que apunta fuera debe ser rechazado al LEER, con el test creando el symlink de verdad.
- **Gate**: lint, types, test

### S5 — Que un `catch` no se coma más de lo que dice

- **Status**: done — `9284894b5`. The reclaim path's `catch { continue }` re-entered the loop BEFORE the deadline check, so a persistent non-`ENOENT` error did not merely hide its cause — it hung forever. Only `ENOENT` retries now; everything else propagates.
- **Files**:
  - `packages/core/src/lib/shared/with-file-mutex.ts` — el `catch { continue }` del camino de reclamación filtra por `ENOENT` y propaga el resto. Un `EACCES` convertido en reintento se manifiesta como contención y esconde su causa.
  - `packages/core/tests/src/lib/shared/with-file-mutex-errno.spec.ts` — un error que no es `ENOENT` sale del mutex en vez de reintentar.
- **Gate**: lint, types, test

### S6 — `affected` mira el push entero, no su último commit

- **Status**: done — `9284894b5`. `github.event.before` for pushes, `pull_request.base.sha` for PRs, with the all-zeroes sha of a newly created branch falling back to a full run.
- **Files**:
  - `.github/workflows/affected.yml` — `github.event.before` para `push` y `pull_request.base.sha` para PR, en vez de `HEAD~1`. Con commits frecuentes suele coincidir; "suele" no es un contrato.
- **Gate**: lint

### S7 — `project-kpis`: la envolvente compacta primero, el detalle bajo demanda

- **Status**: done — `902b56cb3`, ceiling spec in `8f4a11dd1`. Measured, not estimated: the registered `outputSchema` went from 8,518 B to 2,895 B. `ProjectKpisOutputSchema` is untouched and still the typed contract; the registration now advertises `ProjectKpisEnvelopeSchema`, which describes the invariant frame in full and the voluminous per-view sections cheaply. Round-trip tests prove the envelope accepts every payload the full schema accepts — an envelope that rejected a valid response would be worse than a large one.
- **Files**:
  - `plugins/project-kpis/src/lib/tools/project-kpis-output.schema.ts` — envolvente común (`view`, `status`, `summary`, `metrics[]`, `detailUri?`, `nextCursor?`). Las vistas voluminosas se describen al activarse, no en el descubrimiento inicial.
  - `plugins/project-kpis/tests/src/lib/tools/output-schema-size.spec.ts` — fija un techo de bytes para el `outputSchema`, porque el 86 % del coste de esta herramienta era exclusivamente describir su salida y sin un techo vuelve a crecer.
- **Gate**: lint, types, test

### S8 — `proposals`: divulgación progresiva de 34 herramientas

- **Status**: done
- **Evidence**: ocho herramientas esenciales permanecen en `tools/list`; las veintiséis contextuales/administrativas se descubren e invocan por el router. La medición real bajó de 50.896 B a 13.752 B. El catálogo lazy conserva la política, reactivar el plugin no vuelve a revelar herramientas ocultas y el router conserva `structuredContent`, errores y `logHint`. Verificado con typecheck, 18 pruebas de superficie, las 45 pruebas E2E afectadas y la suite completa de `proposals` (1.400 casos; el único fallo inicial reveló y corrigió el contrato estricto de `agent_lock`).
- **Files**:
  - `plugins/proposals/src/lib/surface/disclosure.ts` — tres niveles: flujo esencial (`auto_work`, status/continue, claim/close), acciones contextuales que `auto_work` puede recomendar exactamente, y administración descubrible. La política wire es pura y estable; el estado de propuesta no se filtra al runtime genérico.
  - `plugins/proposals/tests/src/lib/surface/disclosure.spec.ts` — el flujo esencial y nada más queda estático; el techo baja de 50,9 KB a un máximo de 20 KB y el catálogo real impide herramientas sin clasificar.
  - `plugins/proposals/src/index.ts` — aplica la clasificación a todos los registros desde un único punto y falla ante ids sin política.
  - `packages/core/src/lib/contracts/interfaces/tool-registration.interface.ts` — hint opt-in de divulgación en el contrato de registro.
  - `packages/core/src/lib/contracts/interfaces/tool-surface.interface.ts` — propaga el nivel a los descriptores de superficie.
  - `packages/core/src/lib/cli/assemble-plugins.ts` — conserva el nivel tanto en ensamblado eager como lazy.
  - `tools/scripts/generate/managed-lazy-catalog.script.ts` — deriva la política lazy del ensamblado eager real.
  - `packages/core/src/lib/plugins/managed-lazy-catalog.generated.ts` — catálogo regenerado con la política de `proposals`.
  - `packages/core/src/lib/project/tool-surface-runtime.service.ts` — mantiene ocultas las herramientas opt-in sin desautorizarlas y conserva visible el router.
  - `packages/core/src/lib/tools/vertex-router.tool.ts` — conserva metadatos operativos como `logHint` al enrutar una herramienta oculta.
  - `packages/core/tests/src/lib/project/tool-surface-runtime.exposure.spec.ts` — fija visibilidad, autorización, reactivación, routing y metadatos lazy.
  - `plugins/proposals/tests/src/lib/e2e/assembled-proposals-server.ts` — los E2E ejercitan el camino público del router y desenvuelven el contrato de la herramienta destino.
  - `plugins/proposals/tests/src/lib/e2e/auto-work.e2e.spec.ts` — persistencia administrada usa el router para las acciones progresivas.
  - `plugins/proposals/tests/src/lib/e2e/quality-close-slice.e2e.spec.ts` — sincronización contextual usa el router en el E2E de calidad.
  - `plugins/proposals/tests/src/lib/e2e/log-hint.e2e.spec.ts` — un error de herramienta oculta conserva `isError` de protocolo y `logHint` al cruzar el router.
  - `plugins/proposals/src/lib/tools/agent-lock.tool.ts` — el esquema estricto cubre todos los campos que ya emitía el motor.
  - `plugins/proposals/src/generated/tool-outputs.ts` — tipos regenerados para el contrato completo de `agent_lock`.
  - `docs/mcp-vertex/AGENT-BOOTSTRAP.md` — recuento cuantitativo regenerado al añadir la nueva spec.
- **Gate**: lint, types, test

### S9 — Drift documental: que la documentación deje de afirmar cosas falsas

- **Status**: done — `902b56cb3`. `drift.yml`'s comment was already corrected; `ARCHITECTURE.md` stopped enumerating plugins (it named sixteen while the tree held fifty-six) and now points at the generated catalog, and the `scripts/*` build and release paths were three directories out of date.
- **Files**:
  - `.github/workflows/drift.yml` — quitar el comentario que dice que `drift` es un required check en `develop`. La fuente de verdad (`.github/branch-protection.ts`) dice lo contrario a propósito.
  - `docs/mcp-vertex/ARCHITECTURE.md` — "16 shipped plugins" y las rutas `scripts/*` son de otra época; el inventario debe venir del registro generado y no de una lista escrita a mano.
- **Gate**: lint

## dependency graph

- S1 y S2 tocan el mismo fichero: S1 primero, S2 después.
- S3 depende de S1 y S2 (comprueba el generador ya arreglado).
- S4 y S5 son independientes de todo lo demás.
- S6 y S9 son independientes.
- S7 y S8 son independientes entre sí; S8 es la de mayor retorno en tokens.

## acceptance

- `AGENT.md` de `packages/client` no menciona reglas de `core` ni afirma
  que no tiene tests.
- `AGENT.md` de `plugins/project-kpis` nombra su `outputSchema` como
  hotspot.
- `bun run lint:generated-determinism` pasa, y falla si se le quita el
  `sort` a un generador.
- Un symlink que apunta fuera del workspace es rechazado al leer, con un
  test que crea el symlink de verdad.
- El mutex propaga un error que no es `ENOENT`.
- `outputSchema` de `project_kpis` por debajo de su techo.
- La superficie estática de `proposals` no supera 20 KB con el flujo
  esencial expuesto; la medición entregada es 13.752 B.

## risks and mitigations

- **S8 puede romper agentes que llaman herramientas hoy visibles.** Se
  mitiga con descubrimiento explícito y el router estable: la herramienta
  sigue existiendo, conserva autorización, contenido estructurado y
  metadatos de error; sólo deja de pagar bytes hasta que se pide.
- **S4 puede rechazar symlinks legítimos** en repositorios que los usan
  para vendorizar. La variante física se aplica al camino de lectura, y
  el rechazo nombra la ruta y el motivo para que sea diagnosticable.
- **S7 cambia un contrato público.** El tipo completo sigue en el SDK de
  TypeScript; sólo cambia lo que se describe en el descubrimiento.
- **S1 y S2 tocan un fichero que otro agente puede estar editando.** El
  grafo de dependencias las ordena para que no colisionen.

## notes

Contexto de las dos pasadas de auditoría: `.cache/chat-with-llms/`,
ficheros del 2026-09-03. Lo ya cerrado ese mismo día y que este plan NO
vuelve a abrir:

- La acción compuesta de CI usada antes de cualquier checkout — 29 jobs
  que fallaban desde el 2026-08-31 con todos sus pasos posteriores
  marcados como `skipped`, más el gate `lint:workflow-bootstrap`.
- `AGENT.md` no determinista: `readdir` sin ordenar y corte a los cuatro.
- `AGENT.md` sin descubrir tests co-localizados en `src/**`.
- `readAll()` de `error-reporting` tratando un fichero ilegible como
  vacío y persistiendo ese vacío encima del real.
- La cola del baseline del slice-listener descartando el resto tras el
  cap.
- El diario de tests escribiendo sin lock tras el timeout, y sin redactar
  secretos.
- `error_reporting_diagnose_log`, que existía entero y no estaba
  registrado.
- El `commit-tree` que acuñaba commits vacíos, incluidos cuatro que
  anunciaban slices sin llevar un byte.
- Rutas ignoradas por `.gitignore` clasificadas como refusal no terminal.
- El índice de propuestas ausente tumbando `gen:all` en checkout limpio.
- Los `Status` de `q00014`, que decían `pending` sobre trabajo hecho.
