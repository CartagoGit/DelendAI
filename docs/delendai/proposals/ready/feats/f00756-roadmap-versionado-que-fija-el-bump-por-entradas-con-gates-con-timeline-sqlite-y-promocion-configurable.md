---
id: f00756
title: "Roadmap versionado que fija el bump por entradas con gates, con timeline SQLite y promocion configurable"
kind: feat
status: ready
type: proposal
track: architecture
date: 2026-10-06
---

# f00756 — Roadmap versionado que fija el bump por entradas con gates, con timeline SQLite y promocion configurable

## goal

Una capacidad `roadmap` que convierte la intención de release en estado verificable y agnóstico:

- Un fichero de roadmap **trackeado en git** es la autoridad. Es revisable en el PR, gateable, y por eso puede definir qué se promete para una versión concreta.
- Cada entrada declara `kind` (`breaking | feature | fix | chore`), que se traduce al bump mediante `inferBump` de `@delendai/changelog` — importado, nunca reimplementado — y `gates[]`, un conjunto cerrado de condiciones verificables que decide si la entrada está entregada.
- Un timeline durable responde "cuándo se añadió esto, quién, por qué y en qué punto está". El `.md` no puede dar eso: el diff sólo muestra el cambio neto.
- El resultado es una pregunta que hoy nadie puede responder de forma barata: "dije que la 0.5.0 traía A, B y C; ya cerré A y B; ¿qué bump corresponde y qué falta?".

Consecuencia buscada: que un minor o un major puedan definirse por ideas concretas que deben estar cerradas antes de promover a la rama de release, y que esa promoción sea **informativa y configurable por proyecto** — nunca hardcodeada a `develop`/`main` de este repo.

**Esta propuesta es un punto de partida, no un contrato de ejecución.** Quien la implemente tiene autoridad explícita para reescribir el reparto en slices: fusionarlas, dividirlas, renombrarlas, cambiar los `Files`, reordenar dependencias y ajustar los gates a la arquitectura que considere correcta. Sólo se preservan tres cosas:

1. Las invariantes del apartado `## non-goals` (en particular: **no decide la versión**, y `derive-version.script.ts` sigue siendo la autoridad única del semver).
2. El criterio de agnóstico del apartado `## architecture` (ningún nombre de rama, ningún nombre de fichero del roadmap, ni ninguna asunción sobre `develop`/`main` hardcodeada).
3. La separación **autoridad (git) vs. proyección (SQLite / JSON / web)** — todo lo derivado es regenerable; la fuente se edita a mano y en revisión.

Si al leer el código real una solución más simple o más correcta resulta evidente que la aquí esbozada, lo correcto es reescribir la propuesta y dejar constancia del cambio y del porqué, no encajar el diseño previsto. Del mismo modo, la decisión de **cuándo** se cumple cada slice, en qué orden y con qué ritmo es de quien la implementa: la propuesta entra en `ready` y la planificación no está comprometida aquí.

## why

El repo ya sabe qué ha enviado y ya sabe cuánto costó, pero no sabe qué había prometido. Ese hueco tiene tres manifestaciones concretas:

1. **La versión es correcta y la promesa es invisible.** `derive-version.script.ts` calcula el bump desde los commits, y `release_plan` lo previsualiza — pero nada responde "¿esto era lo que se dijo que haría la 0.5.0?". Un minor se infiere del mensaje del commit; no de si las ideas que lo justifican se cumplen.

2. **La promoción a `main` no tiene evidencia de completitud.** `main` exige `release-pr-gate` + `delendai-validate` ([`branch-protection.ts`](../../../.github/branch-protection.ts), proyección generada de `delendai.config.json`). Esa gate comprueba que el código está sano, no que las condiciones de la versión se hayan entregado. La política de ramas ya es declarativa y configurable (`development.branches`); lo que falta es poder **exigir** que un conjunto de condiciones esté en verde antes de promover.

3. **La reconciliación de release ya existe y se reutiliza.** [`reconcileRelease`](../../../plugins/git/src/lib/release-finalize/index.ts) resuelve hotfix en release → forward-sync a integration, parametrizado por `integrationBranch`. "Consolidar antes de producción" está resuelto; no hay que reimplementarlo, hay que darle evidencia.

Piezas que existen y que esta propuesta **conecta** en lugar de reescribir:

| Pieza | Dónde | Papel |
|---|---|---|
| `inferBump` | [`plugins/changelog`](../../../plugins/changelog/src/lib/bump/infer-bump.ts) | importa, no reimplementa |
| `derive-version.script.ts` | [`tools/scripts/release/`](../../../tools/scripts/release/) | autoridad única del semver — intocable |
| `IStateRegistry` + driver SQLite | [`packages/state-sqlite`](../../../packages/state-sqlite/) | el roadmap puede ser un `IStateProducer` más |
| Patrón SQLite operativo | [`packages/proposals-sqlite`](../../../packages/proposals-sqlite/src/lib/reconciler.ts) | precedent: "SQLite operational truth" + markdown durable |
| Página de proposals | [`apps/web/src/pages/proposals.astro`](../../../apps/web/src/pages/proposals.astro) | el patrón exacto de proyección estática a replicar |
| Política de ramas declarativa | [`delendai.config.json`](../../../delendai.config.json) | se extiende, no se hardcodea |

Por qué **markdown como autoridad y SQLite como timeline**: un `.db` no se puede revisar en un PR. Si la definición de la 0.6.0 no está en el árbol, la gate de promoción no tiene nada que verificar y "consolidar antes de producción" es una intención, no un mecanismo. Y el `.md` tiene una limitación estructural: el diff muestra el cambio neto, no cuándo se añadió una entrada ni por qué. Eso es exactamente lo que SQLite sí sabe guardar. El reparto replica el precedente ya establecido en `proposals-sqlite`.

Por qué **la estimación de fecha es informativa y nunca bloqueante**: una fecha escrita a mano y no verificable no es una estimación, es una promesa que nadie audita, y en un roadmap produce el peor fallo posible — la gente planifica contra ella y el roadmap se desacredita solo. El campo `estimate` lleva siempre su `basis` (de dónde sale) y su `confidence`, y jamás aparece en el cálculo de readiness.

## why this design

Tres decisiones que no son obvias y que conviene tener justificadas antes de escribir una línea:

**1. El `.md` es la autoridad, SQLite es el timeline.** Podría haber sido al revés — SQLite como fuente y el `.md` como informe. Se elige así por una razón concreta: la definición de la versión tiene que ser **revisable en el pull request**. Si el "qué prometemos para la 0.6.0" vive en un binario, nadie lo lee antes de aprobar el código que lo cumple, y la gate de promoción no tiene nada contra qué comprobar. El `.md` tiene una limitación estructural e irreparable (el diff muestra el cambio neto, no la historia), y esa limitación es precisamente la que SQLite resuelve. Cada capa hace lo único que sabe hacer bien.

**2. El roadmap es un `IStateProducer`, no un almacén bespoke.** El State Engine ya da lo que un roadmap necesita y que es caro conseguir de otra forma: pureza (el estado derivado no puede corromper la fuente), `ProjectFingerprint` para saber si está obsoleto, `canonicalStateHash` para detectar deriva, y el acceptance `incremental ≡ cleanRebuild` que obliga a que la vista cacheada y la reconstruida coincidan. Montar eso a mano sería reimplementar el motor.

**3. La promoción informa; no ejecuta.** Es tentador que el plugin haga el merge cuando los gates están verdes. No debe, por dos razones concretas: la CI ya tiene el punto de bloqueo correcto (`release-pr-gate` en la rama de release), y un plugin con `git-write` convierte un fallo de configuración en un push a una rama protegida. La información que el plugin produce es exactamente la que la gate necesita.

## non-goals

- **No decide la versión.** `derive-version.script.ts` sigue siendo la autoridad única del semver. Si el roadmap sugiere `minor` y los commits dicen `patch`, gana `derive-version` y el roadmap registra la discrepancia como dato, no como error.
- **No bumpea, no publica, no taguea, no mergea.** Cero `git-write` en el manifest. Esas acciones son `release.script.ts --write/--publish`, `forge_release { confirm: true }` y la CI. El plugin aporta evidencia; la CI sigue decidiendo.
- **No es un planificador.** Sin sprints, sin dependencias entre entradas, sin calendário de equipo. Es un registro de intención y su delta contra lo entregado.
- **No reimplementa** `inferBump`, `parseConventionalCommit`, `reconcileRelease`, `PUBLISH_ORDER` ni el contrato `IStateRegistry`. Los importa de sus paquetes.
- **No reescribe la historia.** Un cambio de alcance es un evento `superseded`, no un `sed` sobre el fichero. Los finales `deferred`, `dropped` y `superseded` son válidos y obligatorios de registrar — un roadmap que sólo avanza hacia delante es un roadmap de fantasía.
- **No fuerza la verificación.** La primera versión declara las condiciones en el roadmap pero no las ejecuta. El conector de verificación es trabajo futuro, no parte de este alcance.
- **No toca el cálculo de la versión ni el flujo de release existente.** Cualquier cambio en `derive-version.script.ts` o `release-plan.ts` que no sea estrictamente de lectura queda fuera.
- **No es dogfooding de sí mismo.** Usar el roadmap de delendai en delendai es una slice opcional posterior, no un requisito de esta.

## architecture

Tres capas con una regla cada una, y una regla global que las atraviesa:

```
   ROADMAP.md / .yaml  (git, trackeado, revisable)   ← AUTORIDAD
          │
          ├─► timeline SQLite / markdown             ← historial, "cuándo y por qué"
          ├─► IStateProducer → canonicalStateHash    ← caché derivada, en .cache
          └─► roadmaps.json (generado)               ← proyección para la web
                    │
                    ├─► apps/web  (estático, patrón proposals.astro)
                    └─► extensions/vscode webview (estado vivo, misma proyección)
```

- **Autoridad**: se edita a mano, entra por PR, se revisa, se gatea. Es el único sitio donde se decide la intención.
- **Timeline**: append-only. Responde cuándo se añadió, quién y por qué. Derivado, regenerable.
- **Proyección**: todo lo que se muestra (web, extensión, JSON) se deriva del fichero de autoridad y se regenera. Un guard falla si divergen; el remedio siempre es regenerar, nunca editar el artefacto.

El estado por defecto de una entrada es `unknown`, no `fail`. La ausencia de datos no es un incumplimiento, y confundirlo con uno es como un roadmap se vuelve inútil: la primera vez que falta evidencia, alguien mete una excepción, y a partir de ahí la excepción es lo normal.

### El criterio de agnóstico

Éste es el requisito que más fácilmente se rompe sin querer, así que se hace explícito y se testea:

| No se hardcodea | De dónde sale |
|---|---|
| Nombres de rama (`develop`, `main`, `trunk`, `release/2.x`) | `development.branches` en `delendai.config.json` |
| Ruta del fichero de roadmap | `development.roadmap.file` |
| Qué condiciones bloquean la promoción | `development.roadmap.promotion.blockingGates` |
| Qué hacer con lo que no se cumplió | `development.roadmap.promotion.deferralPolicy` |

Regla operativa: **un proyecto que no declare la sección de roadmap no obtiene ninguna herramienta de este plugin y no recibe ningún diagnóstico.** Dogfooding significa que delendai declara su propia configuración y se la come; no significa que los valores por defecto sean los de delendai.

## slices

- global_gate: type

### S1 — Contratos, esquema y máquina de estados del roadmap
- **Status**: review
- **Files**: `packages/roadmap/package.json`, `packages/roadmap/tsconfig.json`, `packages/roadmap/vitest.config.ts`, `tsconfig.base.json`, `packages/roadmap/src/index.ts`, `packages/roadmap/src/public/index.ts`, `packages/roadmap/src/lib/contracts/interfaces/roadmap.interface.ts`, `packages/roadmap/src/lib/contracts/schemas/roadmap.schema.ts`, `packages/roadmap/src/lib/contracts/constants/roadmap.constant.ts`, `packages/roadmap/src/lib/state-machine/roadmap-state-machine.service.ts`, `packages/roadmap/src/lib/validation/roadmap-reader.service.ts`, `packages/roadmap/src/lib/validation/bump-hint-validator.service.ts`, `packages/roadmap/tests/src/lib/state-machine/roadmap-state-machine.service.spec.ts`, `packages/roadmap/tests/src/lib/contracts/roadmap.schema.spec.ts`, `packages/roadmap/tests/src/lib/validation/bump-hint-validator.spec.ts`, `packages/roadmap/AGENT.md`
- **Gate**: `bun x vitest run --root packages/roadmap`
- acceptance:
  - "El esquema Zod es `.strict()` y rechaza claves desconocidas en entrada, en gates y en la estimación."
  - "La máquina de estados declara explícitamente qué transiciones son legales y devuelve un motivo de rechazo cuando no lo son; no lanza excepciones para una transición inválida."
  - "Existe un validador que rechaza un `bumpHint` incoherente con el conjunto de `kind` presentes en el horizonte."
  - "El esquema declara `schemaVersion` y la lectura rechaza una versión mayor con un motivo accionable, en vez de adivinar."
- shipped: the `@delendai/roadmap` package with a strict Zod schema, a closed set of entry kinds, states and gate kinds, the state machine (`checkTransition` returns a reason, never throws), `readRoadmap` (refuses a newer `schemaVersion` with the way out) and `validateBumpHints`.
- re-cut: `validateBumpHints` takes the bump deriver as a parameter instead of computing a bump itself. The code showed that any kind-to-bump mapping inside S1 would be a second copy of the changelog plugin's rule, which the non-goals forbid; S2 supplies the real deriver on top of `inferBump`. Specs live under `tests/src/lib/**` mirroring `src/lib`, because the file conventions give the state machine spec a `.service.spec.ts` name.
- review-state: in_review
- review-implementer: claude-sonnet-5-5

### S2 — Álgebra de gates y derivación de la intención de bump
- **Status**: review
- **DependsOn**: [S1]
- note: this slice also owns the `IRoadmapBumpDeriver` the S1 validator receives: kinds become synthetic conventional commits and `inferBump` decides.
- **Files**: `packages/roadmap/package.json`, `bun.lock`, `packages/roadmap/AGENT.md`, `packages/roadmap/src/public/index.ts`, `packages/roadmap/src/lib/contracts/constants/gate.constant.ts`, `packages/roadmap/src/lib/contracts/constants/bump-intent.constant.ts`, `packages/roadmap/src/lib/contracts/interfaces/gate.interface.ts`, `packages/roadmap/src/lib/contracts/interfaces/bump-intent.interface.ts`, `packages/roadmap/src/lib/gates/gate-evaluator.service.ts`, `packages/roadmap/src/lib/bump/roadmap-bump-intent.service.ts`, `packages/roadmap/tests/src/lib/gates/gate-evaluator.service.spec.ts`, `packages/roadmap/tests/src/lib/bump/roadmap-bump-intent.service.spec.ts`
- **Gate**: `bun x vitest run --root packages/roadmap`
- acceptance:
  - "Cada gate devuelve un estado ternario (`pass` | `fail` | `unknown`) con un motivo; nunca un booleano desnudo."
  - "Un gate sin evidencia devuelve `unknown`, no `fail` — la ausencia de datos no es un incumplimiento."
  - "La intención de bump se deriva calling `inferBump` de `@delendai/changelog/public`; un test falla si el paquete se reimplementa localmente en lugar de importarse."
  - "El payload de bump nombra siempre su `authority` (`@delendai/changelog::inferBump`) para que ningún consumidor pueda leerlo como permiso para escribir una versión."
- shipped: gate evaluator (ternary verdicts, unknown without evidence) and the bump intent built on the changelog plugin's inferBump, carrying its authority. The spec mocks the plugin to prove the bump is delegated, not recomputed.
- review-state: in_review
- review-implementer: claude-sonnet-5-5

### S3 — Store de la autoridad: lectura y escritura durable del fichero de roadmap
- **Status**: pending
- **DependsOn**: [S1]
- **Files**: `packages/roadmap/src/lib/store/roadmap-store.interface.ts`, `packages/roadmap/src/lib/store/markdown-roadmap.store.ts`, `packages/roadmap/tests/src/lib/store/markdown-roadmap.store.spec.ts`
- **Gate**: type
- acceptance:
  - "La escritura usa `withFileMutex` + `writeFileAtomic`; el ciclo read-mutate-write completo está bajo el mutex."
  - "Un fichero corrupto se pone en cuarentena con `quarantineCorruptFile` en vez de tratarse como vacío, y hay un test que lo demuestra."
  - "El motor es puro sobre un reader inyectado: los tests no tocan el sistema de ficheros real."
  - "Todo texto persistido pasa por `redactSecrets` antes de escribirse."
  - "La ruta del fichero es inyectada, nunca derivada de `process.cwd()`."

### S4 — Timeline append-only sin binario (variante CI-safe)
- **Status**: pending
- **DependsOn**: [S1]
- **Files**: `packages/roadmap/src/lib/store/timeline-store.interface.ts`, `packages/roadmap/src/lib/store/markdown-timeline.store.ts`, `packages/roadmap/src/lib/store/in-memory-timeline.store.ts`, `packages/roadmap/tests/src/lib/store/markdown-timeline.store.spec.ts`, `packages/roadmap/tests/src/lib/store/in-memory-timeline.store.spec.ts`
- **Gate**: type
- acceptance:
  - "`IRoadmapStore` es la abstracción y existen al menos dos implementaciones intercambiables (markdown + in-memory), lo que demuestra que la agnostismo no depende del backend."
  - "El timeline es append-only: no existe ninguna operación que borre o reescriba un evento pasado."
  - "La variante markdown permite responder "cuándo se añadió esta entrada" sin ningún binario, para que CI pueda auditar sin SQLite."
  - "Reconstruir el estado actual desde el timeline produce el mismo resultado que leer el fichero de autoridad directamente."

### S5 — Driver SQLite del timeline
- **Status**: pending
- **DependsOn**: [S4]
- **Files**: `packages/roadmap-sqlite/package.json`, `packages/roadmap-sqlite/tsconfig.json`, `packages/roadmap-sqlite/vitest.config.ts`, `packages/roadmap-sqlite/src/lib/schema.ts`, `packages/roadmap-sqlite/src/lib/migrations.service.ts`, `packages/roadmap-sqlite/src/lib/sqlite-timeline.store.ts`, `packages/roadmap-sqlite/tests/src/lib/sqlite-timeline.store.spec.ts`
- **Gate**: type
- acceptance:
  - "El driver implementa la MISMA interfaz del timeline en S4, intercambiable con la variante markdown sin que ningún consumidor cambie."
  - "Las migraciones son versionadas e idempotentes, siguiendo el patrón de `packages/proposals-sqlite/src/lib/migrations.ts`."
  - "La base vive bajo `ctx.pluginCacheDir`; nunca en la raíz del workspace ni en un dot-folder propio."
  - "Hay un test de upgrade que demuestra que una base de una versión anterior migra correctamente."

### S6 — El roadmap como IStateProducer del State Engine
- **Status**: pending
- **DependsOn**: [S3, S4]
- **Files**: `packages/roadmap/src/lib/state/roadmap.producer.service.ts`, `packages/roadmap/src/lib/state/roadmap.projection.service.ts`, `packages/roadmap/tests/src/lib/state/roadmap.producer.spec.ts`, `packages/roadmap/tests/property/roadmap-incremental-equals-rebuild.spec.ts`
- **Gate**: type
- acceptance:
  - "El producer declara sus `inputs` explícitamente (fichero de roadmap + índice de proposals) y `rebuild` no muta markdown, git ni código."
  - "El test de propiedad demuestra `incremental ≡ cleanRebuild`: la misma secuencia de operaciones produce el mismo `canonicalStateHash`."
  - "El lint de pureza del State Engine (`tools/scripts/lint/state-engine-purity.script.ts`) pasa sin excepciones."
  - "El estado derivado se cachea bajo `.cache/delendai/state/**` y nunca dentro del árbol de fuentes."

### S7 — Herramientas de lectura: show, sync, readiness y delta
- **Status**: pending
- **DependsOn**: [S2, S6]
- **Files**: `plugins/roadmap/package.json`, `plugins/roadmap/tsconfig.json`, `plugins/roadmap/vitest.config.ts`, `plugins/roadmap/src/lib/tools/shared/envelope.ts`, `plugins/roadmap/src/lib/tools/show.tool.ts`, `plugins/roadmap/src/lib/tools/sync.tool.ts`, `plugins/roadmap/src/lib/tools/readiness.tool.ts`, `plugins/roadmap/src/lib/tools/delta.tool.ts`, `plugins/roadmap/tests/src/lib/tools/delta.tool.spec.ts`, `plugins/roadmap/tests/src/lib/tools/readiness.tool.spec.ts`
- **Gate**: type
- acceptance:
  - "Las cuatro herramientas declaran `outputSchema` y devuelven `toolJson`/`toolOk`/`toolError`; ninguna lanza excepciones hacia el host."
  - "Todas son read-only: no aceptan ninguna entrada que cause escritura y el manifest no les asigna `filesystem-write`."
  - "`roadmap_delta` devuelve las tres columnas — declarado, entregado, publicado — más el bump inferido, su `authority` y un `nextAction`."
  - "`roadmap_show` devuelve un resumen compacto, no el fichero completo; el detalle va bajo demanda."
  - "Hay tests de contrato del payload de `delta` que fijan la forma del envelope, porque es lo que consumirán la web y la extensión."

### S8 — Herramientas de escritura: init, close y promoción
- **Status**: pending
- **DependsOn**: [S3, S6]
- **Files**: `plugins/roadmap/src/lib/tools/plan-init.tool.ts`, `plugins/roadmap/src/lib/tools/plan-close.tool.ts`, `plugins/roadmap/src/lib/tools/promotion.tool.ts`, `plugins/roadmap/tests/src/lib/tools/plan-init.tool.spec.ts`, `plugins/roadmap/tests/src/lib/tools/plan-close.tool.spec.ts`, `plugins/roadmap/tests/src/lib/tools/promotion.tool.spec.ts`
- **Gate**: type
- acceptance:
  - "Toda entrada de path pasa por `resolveWorkspaceContained`; hay un test que prueba que `../` se rechaza."
  - "La promoción es **informativa**: devuelve si las condiciones exigidas se cumplen y NO ejecuta merge, push ni tag bajo ninguna circunstancia."
  - "Los nombres de rama de origen y destino se leen de la configuración; ningún literal de rama aparece en el código del plugin."
  - "Cerrar una entrada exige los gates en verde o una razón explícita; el silencio no es una opción."

### S9 — Manifest, barrels, configuración declarativa y presupuesto de tokens
- **Status**: pending
- **DependsOn**: [S7, S8]
- **Files**: `packages/core/src/lib/plugins/config-file-schema.ts`, `packages/core/schema/delendai.config.schema.json`, `plugins/roadmap/plugin.manifest.ts`, `plugins/roadmap/src/index.ts`, `plugins/roadmap/src/public/index.ts`, `plugins/roadmap/README.md`, `packages/roadmap/src/index.ts`, `packages/roadmap/src/public/index.ts`, `packages/roadmap-sqlite/src/index.ts`, `packages/roadmap-sqlite/src/public/index.ts`
- **Gate**: type
- acceptance:
  - "La sección de roadmap en `delendai.config.json` es opcional: un proyecto que no la declare sigue arrancando igual, sin diagnóstico."
  - "El manifiesto no declara `git-write` en ninguna herramienta y `filesystem-write` sólo en las que de verdad escriben."
  - "El presupuesto de tokens del manifiesto está medido, no heredado de golpe; y `bun run types:generate` deja el drift-guard en verde."
  - "El README documenta el reparto autoridad/proyección y deja escrito, para un adoptante, que ninguna rama está hardcodeada."

### S10 — Proyección a JSON y guard de deriva
- **Status**: pending
- **DependsOn**: [S3, S9]
- **Files**: `tools/scripts/gen/roadmap-projection.script.ts`, `tools/scripts/lint/roadmap-drift.script.ts`, `tools/scripts/lint/roadmap-drift.script.spec.ts`, `apps/web/src/data/roadmaps.json`
- **Gate**: type
- acceptance:
  - "El guard falla si la proyección commiteada no coincide con la derivada del fichero de autoridad; el remedio es regenerar, nunca editar el JSON."
  - "La deriva entre SQLite y markdown también se detecta: markdown manda, SQLite es proyección."
  - "El generador no escribe fuera de `apps/web/src/data/` y es determinista: dos ejecuciones dan el mismo byte."

### S11 — Superficies de lectura: web y extensión
- **Status**: pending
- **DependsOn**: [S10]
- **Files**: `apps/web/src/components/RoadmapSection.astro`, `apps/web/src/components/roadmap/EntryCard.astro`, `apps/web/src/components/roadmap/ProgressBar.astro`, `apps/web/src/pages/roadmap.astro`, `apps/web/src/pages/[lang]/roadmap.astro`, `apps/web/src/i18n/roadmap-board.ts`, `extensions/vscode/src/webviews/roadmap.ts`, `extensions/vscode/src/commands/roadmap.ts`
- **Gate**: type
- acceptance:
  - "La web sigue el patrón de `proposals.astro`: sitio estático, fuente de datos generada, sin llamadas a herramientas en vivo."
  - "La web muestra intención (qué está prometido y en qué punto va); el estado vivo y consultable lo dan las herramientas y la extensión. Es el mismo reparto que ya hace la página de proposals."
  - "Las claves de traducción existen para los 12 idiomas del sitio; falta una y el gate de i18n falla."
  - "La webview de la extensión lee su estado por la misma proyección, no por una segunda fuente de verdad."

### S12 — Prueba de agnóstico y cierre editorial
- **Status**: pending
- **DependsOn**: [S9, S11]
- **Files**: `packages/core/tests/src/lib/e2e/roadmap-agnosticism.spec.ts`, `packages/roadmap/tests/src/lib/store/agnosticism.spec.ts`, `docs/delendai/ROADMAP-DOGFOOD.md`
- **Gate**: e2e
- acceptance:
  - "El test carga una configuración sintética con `trunk → release/2.x` y verifica que ninguna ruta de código asume `develop`/`main`."
  - "El test carga una configuración sintética con un solo esquema de versión (sin rama de release) y verifica que el plugin no falla."
  - "Hay un e2e contra un servidor MCP en memoria que ejercita el ciclo completo: init → transición → readiness → delta → close."
  - "Documentado para un adoptante: qué esdogfooding en delendai y qué debe replicar él en su proyecto."

### S13 — A promotion is opened on the cadence the project declares
- **Status**: pending
- **DependsOn**: [S7, S9]
- **Files**: `packages/roadmap/src/lib/promotion/promotion-readiness.service.ts`, `packages/roadmap/tests/src/lib/promotion/promotion-readiness.service.spec.ts`, `tools/scripts/forge/open-promotion.script.ts`, `tools/scripts/forge/open-promotion.script.spec.ts`, `tools/scripts/governance/forge-settings.lib.ts`
- **Gate**: type
- acceptance:
  - "A project that declares `development.roadmap.promotion.schedule` (a cron expression, or `on-ready`) gets a workflow, projected from that configuration like the other forge settings, that opens the release pull request from the integration branch into the release branch when the cadence comes round and the promotion is ready: the integration branch's last full run is green, code scanning reports no open alert on it, and the roadmap's blocking gates for the next version pass."
  - "When it is not ready, the workflow opens nothing and states which condition held it back; it never merges, never bumps and never tags: the release branch's own gate still decides, and the plugin keeps no git-write permission."
  - "A project with one branch, with no release branch, or with no schedule declared gets no workflow and no diagnostic; branch names, the cadence and the conditions come from the configuration, never from this repository's develop and main."
- Asked by the owner on 2026-10-07: promotions of develop into main were opened by hand whenever someone noticed develop was stable, and the first one waited for 48 code scanning alerts nobody was tracking on develop. The roadmap already knows what the next version promises; this slice turns "is it time to promote" into a scheduled, evidence-backed pull request. It keeps decision 3 of `## why this design`: the plugin informs (readiness), the forge acts (a workflow that opens a pull request), and the merge stays behind the release gate.

## dependency graph

```
S1 (contratos + máquina de estados)
 ├── S2 (gates + bump intent)
 └── S3 (store de la autoridad)
      ├── S4 (timeline sin binario) ── S5 (driver SQLite)
      └── S6 (IStateProducer)
              ├── S7 (herramientas de lectura) ─┐
              └── S8 (herramientas de escritura) ─┤
                                                   S9 (manifest + config + barrels)
S3 + S9 ─────────────────────────────────────► S10 (proyección JSON + guard de deriva)
                                                   │
                                                 S11 (web + extensión)
                                                   │
                                      S9 + S11 ─► S12 (agnosticismo + cierre editorial)
```

Paralelizables sin conflicto de ficheros: S2 ∥ S3 ∥ S4 ∥ S5, y S10 ∥ S11 una vez cerrada S9.

**Secuenciales obligadas.** Solapan contratos, no sólo ficheros:

- **S3 → S6 → S7/S8** — el producer, las herramientas y el store comparten los contratos; no se pueden repartir.
- **S7 + S8 → S9** — el manifiesto declara las herramientas que existen.
- **S9 → S10 → S11 → S12** — la deriva se comprueba antes de que la web y la extensión consuman la proyección.

Si al reescribir el reparto esto deja de ser cierto, es que el reparto estaba mal, no que el grafo esté mal.

## acceptance

- El esquema Zod es `.strict()` y rechaza claves desconocidas en entrada, en gates y en la estimación.
- La máquina de estados declara explícitamente qué transiciones son legales y devuelve un motivo de rechazo cuando no lo son; no lanza excepciones para una transición inválida.
- Existe un validador que rechaza un `bumpHint` incoherente con el conjunto de `kind` presentes en el horizonte.
- El esquema declara `schemaVersion` y la lectura rechaza una versión mayor con un motivo accionable, en vez de adivinar.
- Cada gate devuelve un estado ternario (`pass` | `fail` | `unknown`) con un motivo; nunca un booleano desnudo.
- Un gate sin evidencia devuelve `unknown`, no `fail` — la ausencia de datos no es un incumplimiento.
- La intención de bump se deriva calling `inferBump` de `@delendai/changelog/public`; un test falla si el paquete se reimplementa localmente en lugar de importarse.
- El payload de bump nombra siempre su `authority` (`@delendai/changelog::inferBump`) para que ningún consumidor pueda leerlo como permiso para escribir una versión.
- La escritura usa `withFileMutex` + `writeFileAtomic`; el ciclo read-mutate-write completo está bajo el mutex.
- Un fichero corrupto se pone en cuarentena con `quarantineCorruptFile` en vez de tratarse como vacío, y hay un test que lo demuestra.
- El motor es puro sobre un reader inyectado: los tests no tocan el sistema de ficheros real.
- Todo texto persistido pasa por `redactSecrets` antes de escribirse.
- La ruta del fichero es inyectada, nunca derivada de `process.cwd()`.
- `IRoadmapStore` es la abstracción y existen al menos dos implementaciones intercambiables (markdown + in-memory), lo que demuestra que la agnostismo no depende del backend.
- El timeline es append-only: no existe ninguna operación que borre o reescriba un evento pasado.
- La variante markdown permite responder "cuándo se añadió esta entrada" sin ningún binario, para que CI pueda auditar sin SQLite.
- Reconstruir el estado actual desde el timeline produce el mismo resultado que leer el fichero de autoridad directamente.
- El driver implementa la MISMA interfaz del timeline en S4, intercambiable con la variante markdown sin que ningún consumidor cambie.
- Las migraciones son versionadas e idempotentes, siguiendo el patrón de `packages/proposals-sqlite/src/lib/migrations.ts`.
- La base vive bajo `ctx.pluginCacheDir`; nunca en la raíz del workspace ni en un dot-folder propio.
- Hay un test de upgrade que demuestra que una base de una versión anterior migra correctamente.
- El producer declara sus `inputs` explícitamente (fichero de roadmap + índice de proposals) y `rebuild` no muta markdown, git ni código.
- El test de propiedad demuestra `incremental ≡ cleanRebuild`: la misma secuencia de operaciones produce el mismo `canonicalStateHash`.
- El lint de pureza del State Engine (`tools/scripts/lint/state-engine-purity.script.ts`) pasa sin excepciones.
- El estado derivado se cachea bajo `.cache/delendai/state/**` y nunca dentro del árbol de fuentes.
- Las cuatro herramientas declaran `outputSchema` y devuelven `toolJson`/`toolOk`/`toolError`; ninguna lanza excepciones hacia el host.
- Todas son read-only: no aceptan ninguna entrada que cause escritura y el manifest no les asigna `filesystem-write`.
- `roadmap_delta` devuelve las tres columnas — declarado, entregado, publicado — más el bump inferido, su `authority` y un `nextAction`.
- `roadmap_show` devuelve un resumen compacto, no el fichero completo; el detalle va bajo demanda.
- Hay tests de contrato del payload de `delta` que fijan la forma del envelope, porque es lo que consumirán la web y la extensión.
- Toda entrada de path pasa por `resolveWorkspaceContained`; hay un test que prueba que `../` se rechaza.
- La promoción es **informativa**: devuelve si las condiciones exigidas se cumplen y NO ejecuta merge, push ni tag bajo ninguna circunstancia.
- Los nombres de rama de origen y destino se leen de la configuración; ningún literal de rama aparece en el código del plugin.
- Cerrar una entrada exige los gates en verde o una razón explícita; el silencio no es una opción.
- La sección de roadmap en `delendai.config.json` es opcional: un proyecto que no la declare sigue arrancando igual, sin diagnóstico.
- El manifiesto no declara `git-write` en ninguna herramienta y `filesystem-write` sólo en las que de verdad escriben.
- El presupuesto de tokens del manifiesto está medido, no heredado de golpe; y `bun run types:generate` deja el drift-guard en verde.
- El README documenta el reparto autoridad/proyección y deja escrito, para un adoptante, que ninguna rama está hardcodeada.
- El guard falla si la proyección commiteada no coincide con la derivada del fichero de autoridad; el remedio es regenerar, nunca editar el JSON.
- La deriva entre SQLite y markdown también se detecta: markdown manda, SQLite es proyección.
- El generador no escribe fuera de `apps/web/src/data/` y es determinista: dos ejecuciones dan el mismo byte.
- La web sigue el patrón de `proposals.astro`: sitio estático, fuente de datos generada, sin llamadas a herramientas en vivo.
- La web muestra intención (qué está prometido y en qué punto va); el estado vivo y consultable lo dan las herramientas y la extensión. Es el mismo reparto que ya hace la página de proposals.
- Las claves de traducción existen para los 12 idiomas del sitio; falta una y el gate de i18n falla.
- La webview de la extensión lee su estado por la misma proyección, no por una segunda fuente de verdad.
- El test carga una configuración sintética con `trunk → release/2.x` y verifica que ninguna ruta de código asume `develop`/`main`.
- El test carga una configuración sintética con un solo esquema de versión (sin rama de release) y verifica que el plugin no falla.
- Hay un e2e contra un servidor MCP en memoria que ejercita el ciclo completo: init → transición → readiness → delta → close.
- Documentado para un adoptante: qué es dogfooding en delendai y qué debe replicar él en su proyecto.

## risks and mitigations

| Riesgo | Mitigación |
|---|---|
| **Dos verdades sobre la versión** (roadmap frente a `derive-version`) | Campo `authority` obligatorio en todo payload que mencione un bump, non-goal explícito, y un test que falla si el roadmap intenta escribir una versión. |
| **Divergencia entre SQLite y markdown** | Markdown manda; SQLite es proyección. `roadmap_sync` más un guard de deriva que falla el build. |
| **CI se queda sin binario SQLite** | La variante markdown del timeline (S4) sube **antes** que el driver SQLite: CI nunca depende de él para leer. |
| **Roadmap que miente porque el fichero miente** | El fichero se valida en el mismo PR que el código. No hay forma de cambiar el ámbito sin que alguien lo lea. |
| **Agnosticismo falso** (hardcodear `develop`/`main`) | Test con una configuración sintética de otro esquema de ramas (S12) y la tabla explícita de `architecture`. |
| **Coste de tokens** (varias herramientas nuevas en una superficie lazy) | `roadmap_show` devuelve resumen y el detalle va bajo demanda; presupuesto del manifiesto medido. |
| **Un roadmap que nadie mantiene se abandona** | Por eso `deferred`/`dropped`/`superseded` son finales válidos y registrados, y por eso la fecha nunca bloquea: un roadmap que exige disciplina de calendario se abandona el primer trimestre. |
| **Colisión de vocabulario con `audit`**, que ya emite un "roadmap P0/P1/P2" en su informe | Son cosas distintas: el del audit es contenido narrativo dentro de un informe; éste es estado durable y consultable. Los nombres de herramienta no colisionan. |

## notes

**Para quien implemente.** La autoridad para reescribir el reparto en slices es explícita y está en el `## goal`: lo que se fija son las invariantes, no la secuencia. Si algo de este documento resulta más complejo de lo que el código real exige, sobra.

**Estado de planificación.** La propuesta entra en `ready`. Qué slice se empieza, en qué orden y con qué ritmo es decisión de quien la implementa; aquí no se compromete ningún calendario.

**Sobre el tamaño.** Doce slices es un número alto y probablemente se puede reducir fusionando las de contrato y store. Está así para que el paralelismo sea evidente desde el principio y para que ninguna slice tenga que tocar ficheros de otra. Si al reescribir el reparto queda más pequeño y más claro, mejor.

**Deuda asumida a propósito.** La primera versión declara las condiciones pero no las verifica: no hay conector entre un gate y `delendai-validate`. Es una decisión consciente — un gate que se declara y luego se ignora es peor que un gate ausente, así que hasta que exista el conector los gates se reportan como `unknown`, que es exactamente lo que ese estado significa.
