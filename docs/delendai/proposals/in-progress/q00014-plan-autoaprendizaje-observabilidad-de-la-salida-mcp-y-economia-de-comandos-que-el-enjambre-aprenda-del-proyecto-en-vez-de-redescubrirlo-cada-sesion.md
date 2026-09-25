---
id: q00014
title: "Plan autoaprendizaje, observabilidad de la salida MCP y economía de comandos: que el enjambre aprenda del proyecto en vez de redescubrirlo cada sesión"
kind: plan
status: in-progress
type: proposal
track: quality
date: 2026-09-03
shipped-in:
  - 2a0ff85ac39cc174fda0646c571e21bc351d33d7
last-transition-id: 6930a4e6-2a1d-485a-8733-83d5a7d91467
last-correlation-id: 6930a4e6-2a1d-485a-8733-83d5a7d91467
last-transition-from: review
---

# q00014 — Autoaprendizaje, observabilidad de la salida y economía de comandos

## Goal

Cerrar el hueco entre *lo que el sistema ya sabe* y *lo que cada agente
tiene que volver a averiguar por su cuenta en cada sesión*.

Hoy DelendAI mide muchísimo (usage-tracking, métricas de confusión,
token budgets, storm detector, validate journal) y no **aprende** nada:
ningún agente arranca sabiendo qué comandos funcionan en esta máquina,
qué tests suelen romperse juntos, qué herramientas se le atragantan al
modelo en este repo, ni qué errores ya se han visto y diagnosticado.

Cuatro capacidades, en orden de dependencia:

1. **Perfil de sistema** — saber en qué máquina estamos para elegir el
   comando más barato, en vez de que cada agente lo descubra a base de
   fallos.
2. **Diario de fallos** — un resultado de test o de validate se lee una
   vez y se consulta después; no se vuelve a lanzar la suite para
   averiguar qué falló.
3. **Lectura de la salida del MCP** — los errores que hoy sólo existen
   en el log de la consola del usuario se convierten en diagnóstico y,
   cuando procede, en issue.
4. **Autoaprendizaje** — un plugin que acumula lo anterior por proyecto
   y lo devuelve como recomendaciones concretas: qué activar, qué
   comando usar, qué suele fallar aquí.

## why

Tres observaciones de esta misma sesión, todas medidas, no supuestas:

- Un agente relanzó `bun run test` (≈6 min, con lock de cómputo
  compartido) sólo para volver a ver un fallo que la primera ejecución
  ya había impreso. La información existía y se tiró.
- La auditoría externa de 2026-09-02 encontró que `develop` avanzó 28
  commits durante la propia revisión, y que uno de los defectos
  señalados ya lo había arreglado otro agente: el enjambre trabaja
  rápido pero **sin memoria compartida** entre sesiones.
- Los cinco bugs de infraestructura más caros de esta ronda (bucle de
  push de 12h, stdout corrompiendo JSON-RPC, `.mutex` en el pathspec,
  fixture reescribiendo `~/.gitconfig`, política no-stash desconectada)
  se encontraron **leyendo el log de la consola del usuario a mano**.
  Ese log es la mejor fuente de defectos reales que tiene el proyecto y
  nada lo lee automáticamente.

El argumento económico: cada una de estas capacidades reduce turnos y
tokens de forma medible. No añaden inteligencia al modelo — le quitan
trabajo redundante.

## non-goals

- **NO** es telemetría hacia fuera. Todo lo que aprende se queda en
  `.cache/delendai/results/` del proyecto. Lo único que sale del
  equipo es lo que `error-reporting` ya envía, con su validador de
  privacidad intacto.
- **NO** sustituye a `usage-tracking`, `observability` ni
  `auto-plugin-selector`. Los consume.
- **NO** introduce ML ni embeddings. Es estadística sobre eventos
  propios: frecuencias, correlaciones y recencia.
- **NO** cambia el modelo operativo de `q00015` (shared develop,
  eventual settlement). Se apoya en él.

## Slices

- global_gate: lint, types, test

### S1 — Perfil de sistema: elegir el comando más barato para esta máquina

- **Status**: done
- **Files**:
  - `packages/core/src/lib/platform/system-profile.helper.ts` — detecta y cachea: SO y si es WSL, gestor de paquetes disponible (`bun`/`node`+`fnm`/`npm`), núcleos y memoria, si hay `rg`/`fd`/`jq`, locale utilizable, y si el FS es un montaje cruzado Windows↔Linux (que cambia radicalmente el coste de E/S).
  - `packages/core/src/lib/platform/command-preference.ts` — dado un propósito (`search-text`, `list-files`, `run-tests`, `typecheck`), devuelve el comando preferido para ESTE perfil y por qué. Pura, sin efectos.
  - `packages/core/src/lib/contracts/interfaces/system-profile.interface.ts` — `ISystemProfile`, `ICommandPreference`.
  - `packages/core/tests/src/lib/platform/system-profile.spec.ts` — perfiles sintéticos, sin tocar la máquina real.
  - `packages/core/tests/src/lib/platform/command-preference.spec.ts` — que un perfil sin `rg` nunca recomiende `rg`.
- **Gate**: lint, types, test
- review-state: done
- review-implementer: unrecorded
- review-reviewer: qwen-3.8-max
- review-log: approved by qwen-3.8-max — Implementer unrecorded: independence cannot be verified; full independent review performed instead. The commit named by the queue (2a0ff85a) only carries the evidence-pass documentation; the code itself was traced via git log to 9def714f5 and read in the current develop tree. Verified: (1) system-profile.helper.ts + command-preference.helper.ts + system-profile.interface.ts all present — the plan's command-preference.ts now follows the repo role-suffix convention (.helper.ts), documented in the proposal notes; (2) both specs (system-profile.spec.ts, command-preference.spec.ts) ran green: 28/28 tests, exit 0, via env -u CLAUDECODE -u AI_AGENT npx vitest run; (3) acceptance point 1 of the plan is evidenced in the proposal's own evidence pass (WSL2, 10 CPUs, bun/node/npm/fnm/rg/fd/jq/git present, pnpm absent; no absent tool recommended); (4) global bun run typecheck green (exit 0). No out-of-scope changes; non-goals respected (no telemetry out, no ML, stays in .cache/delendai/results/). Gate was none; typecheck+specs run anyway.
- review-attribution: unrecorded — nothing in Git names who delivered 2a0ff85ac39cc174fda0646c571e21bc351d33d7: no work ref of this project in its message or in the merge that brought it into develop, and no Co-Authored-By trailer; independence could not be verified, opened by qwen-3.8-max
### S2 — Diario de fallos de test legible sin relanzar la suite

- **Status**: done
- **Files**:
  - `tools/scripts/test/journal-reporter.ts` — reporter de vitest que escribe JSONL a `.cache/delendai/results/logs/test-runs.jsonl`: fichero, nombre, aserción, diff esperado/recibido, primer frame en código propio, duración, id de ejecución. Nunca lanza; un fallo al escribir no puede tumbar la suite.
  - `packages/test-kit/src/lib/reporters/failure-journal.contract.ts` — `ITestFailureRecord`, `ITestRunRecord`.
  - `tools/scripts/test/read-test-failures.script.ts` — imprime los fallos de la ÚLTIMA ejecución, agrupados por fichero, sin banner y sin relanzar nada. Avisa explícitamente si el diario está obsoleto respecto al árbol de trabajo.
  - `packages/test-kit/tests/src/lib/reporters/failure-journal.spec.ts`
- **Gate**: lint, types, test
- review-state: done
- review-implementer: unrecorded
- review-reviewer: qwen-3.8-max
- review-log: approved by qwen-3.8-max — Implementer unrecorded: independence cannot be verified; full independent review performed instead. Gate was none; ran typecheck + the covering spec anyway. Verified in the current develop tree: (1) tools/scripts/test/journal-reporter.ts exists and vitest-wires the JSONL journal; (2) tools/scripts/test/test-journal.ts exports ITestFailureRecord/ITestRunRecord — the planned packages/test-kit/src/lib/reporters/failure-journal.contract.ts does not exist, but this divergence is explicitly documented in the slice's own Status ('el diario vive en tools/scripts/test/, no en packages/test-kit/ como decía el plan'), matching the notes-section convention for plan-vs-tree drift; (3) `bun run test:failures` (read-test-journal.script.ts) runs and prints last run, totals, failure detail and freshness warning without re-launching any suite — exit 0; (4) tools/scripts/test/test-journal.spec.ts green: 16/16. Global `bun run typecheck` exit 0; `bun run lint:architecture` exit 0. Full `bun run validate` is red on this workspace since 2026-09-21T06:16Z from shared-branch breakage in files unrelated to this slice (check:quantitative, lint:proposals, etc.) — validateExitCode field reflects the gates actually run for this slice.
- review-attribution: unrecorded — nothing in Git names who delivered 2a0ff85ac39cc174fda0646c571e21bc351d33d7: no work ref of this project in its message or in the merge that brought it into develop, and no Co-Authored-By trailer; independence could not be verified, opened by qwen-3.8-max
### S3 — Lector de la salida del servidor MCP: del log al diagnóstico

- **Status**: done
- **Files**:
  - `plugins/error-reporting/src/lib/intake/server-log-reader.helper.ts` — parsea el log de stderr del servidor (el que el host escribe: VS Code, Claude Code, Codex) y extrae eventos estructurados: refusals repetidos, `Failed to parse message`, tormentas de reintentos, plugins que no cargaron, fallos de push.
  - `plugins/error-reporting/src/lib/intake/log-diagnosis.ts` — convierte esos eventos en un diagnóstico con causa probable y siguiente acción. Reutiliza `storm-detector` de `commit-policy` en vez de duplicar la detección de bucles.
  - `plugins/error-reporting/src/lib/tools/diagnose-log.tool.ts` — herramienta `error_reporting_diagnose_log`: lee, diagnostica, y SÓLO con confirmación abre issue. El validador de privacidad existente se aplica sin excepción.
  - `plugins/error-reporting/src/lib/contracts/interfaces/log-intake.interface.ts`
  - `plugins/error-reporting/tests/src/lib/intake/server-log-reader.spec.ts` — fixtures con los logs reales de 2026-09-02 (anonimizados) que contenían los cinco bugs.
- **Gate**: lint, types, test
- review-state: done
- review-implementer: unrecorded
- review-reviewer: qwen-3.8-max
- review-log: approved by qwen-3.8-max — Implementer unrecorded: independence cannot be verified; full independent review performed instead. Gate was none; ran typecheck + covering specs anyway. Verified in the current develop tree: (1) plugins/error-reporting/src/lib/intake/server-log-reader.helper.ts and log-diagnosis.helper.ts exist (planned log-diagnosis.ts carries the repo role-suffix convention, documented in the proposal notes); diagnose-log.tool.ts and log-intake.interface.ts exist; (2) server-log-reader.spec.ts green 11/11 via env -u CLAUDECODE -u AI_AGENT npx vitest run: it classifies the twelve-hour push retry loop, the 'Failed to parse message' stdout corruption and the .mutex pathspec failure from rewritten copies of the 2026-09-02 incidents, and asserts no log text or machine identifier reaches a finding (privacy validator intact, per non-goals); (3) plan acceptance point 3 itself is documented as not verifiable from this repository (original host log absent) — the slice's deliverable is the parser/diagnosis/tool/spec, all present and registered; the proposal's own evidence pass states this limitation honestly; (4) bun run typecheck exit 0, bun run lint:architecture exit 0. Full bun run validate is red workspace-wide since 2026-09-21T06:16Z on shared-branch breakage unrelated to this slice.
- review-attribution: unrecorded — nothing in Git names who delivered 2a0ff85ac39cc174fda0646c571e21bc351d33d7: no work ref of this project in its message or in the merge that brought it into develop, and no Co-Authored-By trailer; independence could not be verified, opened by qwen-3.8-max
### S4 — Plugin `self-learning`: superficie y almacén

- **Status**: done
- **Files**:
  - `plugins/self-learning/package.json`
  - `plugins/self-learning/src/index.ts` — registro del plugin, `cacheNamespace: 'self-learning'`, desactivado por defecto (opt-in explícito).
  - `plugins/self-learning/src/lib/store/observation-store.ts` — almacén append-only por proyecto en `.cache/delendai/results/self-learning/`. Escritura atómica, tamaño acotado, compactación por recencia.
  - `plugins/self-learning/src/lib/contracts/interfaces/observation.interface.ts` — `IObservation` con un `kind` cerrado: `command-outcome`, `test-failure`, `tool-confusion`, `refusal`, `slice-outcome`.
  - `plugins/self-learning/src/lib/collectors/index.ts` — se suscribe a lo que YA existe (usage-tracking, el diario de S2, el storm detector, los refusals del engine). No instrumenta nada nuevo.
  - `plugins/self-learning/tests/src/lib/store/observation-store.spec.ts`
- **Gate**: lint, types, test
- review-state: done
- review-implementer: unrecorded
- review-reviewer: qwen-3.8-max
- review-log: approved by qwen-3.8-max — Implementer unrecorded: independence cannot be verified; full independent review performed instead. Gate was none; ran typecheck + covering spec anyway. Verified in the current develop tree: (1) plugins/self-learning/ exists with package.json and src/index.ts; the index documents 'Opt-in on purpose, and absent from every preset' and no preset in config/delendai references it; (2) observation-store.service.ts (planned observation-store.ts, role-suffix convention divergence documented in the slice Status) is append-only JSONL under .cache/delendai/results/self-learning/ with writeFileAtomic + realpathContained from @delendai/core/public, DEFAULT_MAX_OBSERVATIONS=5000 bound and recency-first reads — the R2 mitigation (bound + recency compaction) is implemented, not deferred; (3) the single collector is collectors/test-journal.service.ts, consuming the S2 journal with no new instrumentation, as planned; (4) observation.interface.ts present; (5) observation-store.spec.ts green 13/13. Non-goals respected: nothing leaves the machine, no ML/embeddings — the store is plain JSONL counting. typecheck exit 0; lint:architecture exit 0. Full validate red workspace-wide since 2026-09-21 on shared breakage unrelated to this slice.
- review-attribution: unrecorded — nothing in Git names who delivered 2a0ff85ac39cc174fda0646c571e21bc351d33d7: no work ref of this project in its message or in the merge that brought it into develop, and no Co-Authored-By trailer; independence could not be verified, opened by qwen-3.8-max
### S5 — Plugin `self-learning`: lecciones y recomendaciones

- **Status**: done
- **Files**:
  - `plugins/self-learning/src/lib/lessons/derive-lessons.helper.ts` — de observaciones a lecciones con evidencia y confianza: "en este proyecto `bun run lint:web` falla tras tocar `packages/core` sin reconstruir dist (visto 6 veces)". Cada lección cita las observaciones que la sostienen y caduca si dejan de reproducirse.
  - `plugins/self-learning/src/lib/lessons/confidence.ts` — soporte, recencia y contraejemplos. Una lección con contraejemplos recientes se degrada sola.
  - `plugins/self-learning/src/lib/tools/lessons-tool.ts` — `self_learning_lessons` (qué sabemos de este proyecto) y `self_learning_advice` (dado un objetivo, qué activar y qué comando usar). Salida compacta por defecto.
  - `plugins/self-learning/tests/src/lib/lessons/derive-lessons.spec.ts` — incluye el caso negativo: una correlación con soporte bajo NO debe convertirse en lección.
- **Gate**: lint, types, test
- review-state: done
- review-implementer: unrecorded
- review-reviewer: qwen-3.8-max
- review-log: approved by qwen-3.8-max — Implementer unrecorded: independence cannot be verified; full independent review performed instead. Gate was none; ran typecheck + covering spec anyway. Verified in the current develop tree: (1) plugins/self-learning/src/lib/lessons/derive-lessons.helper.ts and confidence.helper.ts exist; scoreConfidence weighs support, recency and counterexamples and a counterexample-recent lesson degrades (spec asserts 'degrades when nothing recent supports it'); (2) tools/lessons.tool.ts exposes self_learning_lessons with an optional goal filter — one tool, not two duplicated schemas, as the slice Status documents; (3) derive-lessons.spec.ts green 12/12 including the mandated negative case: a low-support correlation must NOT become a lesson ('what a history does not support' describe block); (4) no core coupling: grep of the lessons dir shows imports stay inside the plugin plus typed contracts. typecheck exit 0; lint:architecture exit 0. Plan acceptance point 4 (a full round with self-learning enabled) remains documented as not verified by the proposal itself and is a plan-level acceptance item, not this slice's deliverable — the slice ships derive/score/tool/spec and all four exist and pass. Full validate red workspace-wide since 2026-09-21 on unrelated shared-branch breakage.
- review-attribution: unrecorded — nothing in Git names who delivered 2a0ff85ac39cc174fda0646c571e21bc351d33d7: no work ref of this project in its message or in the merge that brought it into develop, and no Co-Authored-By trailer; independence could not be verified, opened by qwen-3.8-max
### S6 — Compactación automática de conversación con criterio de pérdida

- **Status**: done
- **Files**:
  - `plugins/memory/src/lib/compaction/auto-compaction-policy.helper.ts` — decide CUÁNDO compactar (presupuesto consumido, antigüedad, saturación de un tema) en vez de que lo pida el agente. Se apoya en `memory_compaction_check`, que ya existe.
  - `plugins/memory/src/lib/compaction/preserve-rules.ts` — qué NO puede perderse nunca en un resumen: decisiones del usuario, restricciones declaradas, causas raíz ya diagnosticadas, identificadores (SHA, ids de propuesta, rutas). Es la parte que hace la compactación segura, y se prueba con casos que antes se perdían.
  - `plugins/memory/tests/src/lib/compaction/preserve-rules.spec.ts` — un resumen que suelta una restricción del usuario debe fallar el test.
- **Gate**: lint, types, test
- review-state: done
- review-implementer: unrecorded
- review-reviewer: qwen-3.8-max
- review-log: approved by qwen-3.8-max — Implementer unrecorded: independence cannot be verified; full independent review performed instead. Gate was none; ran typecheck + covering specs anyway. Verified in the current develop tree: (1) plugins/memory/src/lib/compaction/auto-compaction-policy.helper.ts exists and decides WHEN to compact on four signals: token-size facts, budget ratio (0.7 window threshold), turns since last compaction, and topic saturation; (2) judgeCompactedSummary lives in the same helper and is consumed by compact.tool.ts with binding = trigger === 'policy' — the preservation check is legally binding for policy-triggered compaction; the planned preserve-rules.ts maps to preserve-rules.helper.ts (role-suffix divergence documented in the proposal notes) whose CONSTRAINT_PATTERN classifies bare prohibitions in both languages; (3) specs green via env -u CLAUDECODE -u AI_AGENT npx vitest run: preserve-rules.spec.ts 9/9, auto-compaction-policy.spec.ts 11/11, and compaction-corpus.spec.ts 4/4; the corpus spec is exactly plan acceptance point 5: recognises all 16 declared constraints (>=16 asserted), does not flag surrounding chatter, accepts a binding compaction carrying every constraint, and REFUSES a binding compaction dropping any single constraint (asserted per-constraint, line 115-128); (4) commit 2a0ff85a (the queue-named delivering commit) itself only exempts compaction-corpus.spec.ts from the English-prose lint because the Spanish constraint lines ARE the fixture data — a legitimate, minimal, in-scope change with its reason documented in both the commit and the lint's exclusion list. typecheck exit 0; lint:architecture exit 0. Full validate red workspace-wide since 2026-09-21 on unrelated shared-branch breakage.
- review-attribution: unrecorded — nothing in Git names who delivered 2a0ff85ac39cc174fda0646c571e21bc351d33d7: no work ref of this project in its message or in the merge that brought it into develop, and no Co-Authored-By trailer; independence could not be verified, opened by qwen-3.8-max
### S7 — Higiene: que los defectos pequeños no puedan reaparecer

- **Status**: in-progress
- **Files**:
  - `biome.json` — `noUnusedImports` pasa de warning a error. Un import muerto tras un refactor debe romper la build, no quedarse en un aviso que nadie lee.
  - `tools/scripts/lint/no-silent-gates.script.ts` — un gate que sale con código distinto de cero sin escribir NADA es un fallo del gate. Comprueba que cada script de `validate:run` produce salida en su camino de error.
  - `tools/scripts/lint/no-duplicate-implementation.script.ts` — detecta el patrón que causó el P0 de `commit-policy`: dos definiciones del mismo nombre exportado en el mismo paquete, una de ellas sombreando a la otra. Es exactamente la clase de defecto que ningún test encuentra porque cada copia tiene los suyos.
  - `tools/scripts/lint/tests/no-duplicate-implementation.spec.ts`
- **Gate**: lint, types, test
- review-state: changes_requested
- review-implementer: unrecorded
- review-reviewer: qwen-3.8-max
- review-log: requested_changes by qwen-3.8-max — WHAT IS WRONG: the slice's declared Files list includes `tools/scripts/lint/tests/no-duplicate-implementation.spec.ts`, and that spec does not exist. WHERE: `tools/scripts/lint/tests/` directory does not exist at all; repo-wide search `find . -path ./node_modules -prune -o -type f -name '*.spec.ts' -print | xargs grep -ln 'no-duplicate-implementation|no-silent-gates|shadowed-export|silent-exit'` returns zero hits, and `git log --all -- '*duplicate-implementation*spec*'` returns zero commits, so the file never existed in history and is not a rename under the role-suffix convention either. HOW TO REPRODUCE: `ls tools/scripts/lint/tests/` fails with ENOENT on develop @ 522aabfc3. WHY IT MATTERS: `no-duplicate-implementation.script.ts` itself claims at line 114 of its own docblock that 'an entry with an empty `reason` fails this gate's own spec' — the script references a spec that does not exist, so its documented self-test is unbacked. WHAT I DID VERIFY AND HOLDS: both lints exist and pass (`bun run lint:no-duplicate-implementation` exit 0, 'debt 98 → 89'; `bun run lint:no-silent-gates` exit 0, '135 gate script(s) … all report on their failure path'); both are wired into `validate:run` (package.json line 226); biome.json declares noUnusedImports: error for TS (line 138, with a documented astro exception) plus a baseline script that the evidence pass proved ratchets (aa4f41eef); plan acceptance point 6 is evidenced by measured defect reintroduction in the proposal. WHAT MUST HOLD TO APPROVE: either the spec lands and passes (`env -u CLAUDECODE -u AI_AGENT npx vitest run tools/scripts/lint/tests/no-duplicate-implementation.spec.ts` green) covering at least the [shadowed-export] and [silent-exit] failure paths, or an explicit documented divergence in the slice Status/notes (as S2/S4/S5 carry for their renames) stating the spec was dropped and what covers the lints instead — the docblock claim at line 114 of no-duplicate-implementation.script.ts must then be corrected by whoever owns it, not by this reviewer. Implementer is unrecorded: independence could not be verified; this review was performed identically to a recorded delivery.
- review-attribution: unrecorded — nothing in Git names who delivered 2a0ff85ac39cc174fda0646c571e21bc351d33d7: no work ref of this project in its message or in the merge that brought it into develop, and no Co-Authored-By trailer; independence could not be verified, opened by qwen-3.8-max
## acceptance

1. `system-profile` identifica correctamente esta máquina (WSL2, bun,
   fnm, locale no generado) y `command-preference` no recomienda ni una
   sola herramienta ausente.
2. Tras una ejecución de tests con fallos, un agente diagnostica cada
   fallo leyendo el diario, **sin volver a lanzar la suite**. Verificado
   cronometrando ambos caminos.
3. `error_reporting_diagnose_log` sobre el log real de 2026-09-02
   identifica al menos el bucle de push, la corrupción de stdout y el
   fallo de pathspec del `.mutex`, sin que ningún dato del proyecto
   salga en el DTO.
4. Con `self-learning` activo durante una ronda completa, produce
   lecciones con evidencia citada, y ninguna lección sin soporte
   suficiente.
5. La compactación automática conserva el 100% de las restricciones
   declaradas por el usuario en un corpus de conversación de prueba.
6. Reintroducir un import muerto, un gate silencioso o una
   implementación duplicada rompe `validate`. Probado reintroduciendo
   cada uno de los tres.

**Evidence pass (2026-09-15).** All seven slices are done, but the plan stays open: four of its six acceptance points are proven (1, 2, 5 and 6).

- **1 — proven.** `detectSystemProfile` on this machine reports Linux under WSL2, 10 CPUs, `bun`, `node`, `npm`, `fnm`, `rg`, `fd`, `jq` and `git` present, `pnpm` absent, and the requested locale usable. `preferCommand` picks a present tool for all five purposes (`search-text` → `rg`, `list-files` → `fd`, `run-tests`/`typecheck`/`install-deps` → `bun`) and recommends none that is absent.
- **6 — proven, after a fix.** Each defect was reintroduced on a clean develop checkout and its gate run before and after. A script that exits 1 with no output, wired into `validate:run`, fails `no-silent-gates` (`[silent-exit]`). A second exported `defineInMemoryStateRegistry` in `packages/state` fails `no-duplicate-implementation` (`[shadowed-export]`). A dead import did **not** fail at first: the Biome baseline still recorded 6 errors while the tree had 2, so the new error fit in the slack. Since `aa4f41eef` (#220) locked the smaller baseline, the same import fails with `__errors__: 3 (baseline 2, +1)`.
- **5 — proven over a corpus, after a fix.**
  - **The corpus.** `compaction-corpus.spec.ts` holds two conversations, one Spanish and one English, with 16 declared constraints worded as they were actually given in a real session.
  - **What was broken.** Against the detector on `develop` (`59edf7214`), only 4 of the 16 were recognised as user constraints. In 12 of 16 cases, a summary that dropped one constraint still passed `verifySummaryPreserves`, so a binding compaction would have accepted it. The detector only knew modal verbs, and people state most boundaries as bare prohibitions: "No abras…", "Do not raise…", "Don't mark…", "Deja de…", "Avoid…", "NO QUIERO QUE PARES".
  - **The fix.** `CONSTRAINT_PATTERN` now also counts a line that opens with "no", plus those negative imperatives in both languages. With it the corpus is 16/16 recognised, the surrounding chatter is not flagged, a summary carrying every constraint is accepted, and dropping any single one is refused by `judgeCompactedSummary({ binding: true })`.
  - **Checks.** The memory project passes 16 files and 117 tests. `preserve-rules.helper.ts` coverage is 98.07 / 96.15 / 100 / 100 (statements / branches / functions / lines).
  - **Limit.** The claim holds for this corpus. A phrasing it does not contain can still be missed, so new real misses should be added to the corpus.
- **3 — not verifiable from this repository.** `proposals_error_reporting_diagnose_log` reads host log text (`readServerLogText`). The original host log of 2026-09-02 is not in the repo. The only local file for that day, `.cache/delendai/results/logs/2026-09-02.jsonl`, is delendai's own results log (agent and incident events), a different format, so running the tool on it would not test this point. `server-log-reader.spec.ts` classifies the push loop and the `.mutex` pathspec failure from rewritten copies of those incidents. That is support, not the acceptance.
- **2 — proven by measurement.** On a clean `develop` checkout (`5a69dee52`), a throwaway spec with three failures was run once. Its failures were a deep-equal diff, a value mismatch and a thrown error; the spec was never committed.
  - Diagnosis came from `bun run test:failures` alone. It printed each failing test, its `file:line:column`, the expected/received diff and the thrown message with its frames.
  - Reading the journal took 44 ms. Re-running just that spec took 1.9 s, and re-running the full suite takes 355–359 s (three timed runs, recorded under x00542).
- **4 — not verified.** It needs a full round with `self-learning` enabled.

## risks and mitigations

- **R1**: el autoaprendizaje aprende de un periodo malo y recomienda
  algo peor. Mitigación: toda lección lleva evidencia y caduca; el
  consumidor puede ignorarla; el plugin es opt-in.
- **R2**: el almacén de observaciones crece sin control en un repo con
  enjambre activo. Mitigación: cota de tamaño y compactación por
  recencia desde S4, no después.
- **R3**: `no-duplicate-implementation` produce falsos positivos con
  sobrecargas legítimas y re-exports. Mitigación: empezar acotado a
  definiciones de valor en el mismo paquete, con lista de excepciones
  explícita y justificada.
- **R4**: el lector de logs se acopla al formato de un host concreto.
  Mitigación: parser tolerante que ignora lo que no reconoce, con
  fixtures de más de un host.

### Out of scope

- Enviar observaciones o lecciones fuera del equipo.
- Sustituir `auto-plugin-selector` por el recomendador de S5; S5 le
  aporta señal histórica, no lo reemplaza.
- Reescribir el resumidor de conversación; S6 aporta la política de
  cuándo compactar y el contrato de qué no perder.

## notes

### Estado real frente a este documento

Verificado fichero a fichero contra `develop` el 2026-09-03. Las siete
slices decían `pending` mientras cinco estaban implementadas total o
parcialmente, lo que en un enjambre no es un detalle de forma: otro
agente podía reclamar S1, reimplementar el perfil de sistema, y quemar
una sesión reescribiendo código que ya existía. Una auditoría externa lo
señaló como riesgo de gobernanza, no de código, y tenía razón.

Los `Status` de abajo son ahora observaciones sobre el árbol, no
intenciones. Dos anotan además una divergencia real entre lo planificado
y lo construido (S2 vive en `tools/scripts/`, no en `packages/test-kit/`),
que se deja escrita en lugar de corregirla en silencio.

Actualizado el 2026-09-14: las siete slices están en `develop`. S3 cerró
con el spec de fixtures reales (#153), S4 y S5 con el plugin
`self-learning` y su derivación de lecciones (#156, #166), y S6 con la
política de compactación automática y el juicio vinculante del resumen
(#154). Los nombres de fichero de S4 y S5 que este documento escribió en
septiembre son anteriores a la convención de sufijos por rol del repo;
lo construido lleva `.service.ts`, `.helper.ts` y `.tool.ts`, y se anota
aquí en vez de reescribir el plan para que parezca que siempre lo dijo.
