---
id: f00500
title: "Hide LLM attribution from GitHub surface (no co-authors, no AI brands, only CartagoGit)"
kind: feat
status: review
type: proposal
track: general
date: 2026-09-03
last-transition-id: f8dcecbd-035c-470d-97a3-2b485ba1bb06
last-correlation-id: f8dcecbd-035c-470d-97a3-2b485ba1bb06
last-transition-from: in-progress
last-transition-at: 2026-10-11T14:33:51.334Z
shipped-in:
  - "2a7c8c71e"
  - "329106a2b282ea0b97dc301c81e7c846baae4c79"
  - "bbe03407c1854d583e8109288c6918b52eac136d"
---

# f00500 — Hide LLM attribution from GitHub surface (no co-authors, no AI brands, only CartagoGit)

## Goal

Asegurar que cualquier visitante del repositorio en GitHub solo vea al maintainer humano (CartagoGit) como autor/co-autor/colaborador. Hoy el repo filtra attribution a LLMs por cuatro vías paralelas y ninguna está mitigada:

1. **Co-authored-by trailer**: `delendai.config.json` tiene `commit-policy.audit.trailer: "co-authored-by"` con `agentFormat: "${host}/${model}"`. Cada commit slice-driven termina con `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>` o `Co-Authored-By: MiniMax M3 <MiniMax@users.noreply.github.com>`. GitHub lo muestra en la sección "Co-authored by" del commit page Y lo suma al contributor graph si el email matchea una cuenta real.

2. **Author principal del commit (histórico)**: ~80 commits en `git log --all` tienen `copilot-minimax-m3`, `GitHub Copilot`, `delendai@MiniMax.local` o `ci@anthropic.com` como autor (no solo trailer). Proceden de cuando el repo aún no había activado el modo `explicit` del commit-policy. Salen en el contributor graph como autores fantasmas.

3. **Branch names**: si `agentWorktree: true` se activa alguna vez, las branches serán `agent/copilot-minimax-m3-<name>-<task>`. Visibles en PR titles, branch list, reflog.

4. **Repo surface filenames**: `docs/delendai/proposals/done/audits/a00007-...codex-gpt-5-5.md`, `n00001-...claude-code.md` y `config/external/claude/` están committed y muestran LLM brands.

**Estado objetivo**: nuevo commit del repo solo muestra a Cartago como autor (sin trailer, sin co-author); contributor graph solo lista Cartago (+ Mario + dependabot[bot] histórico que el maintainer decida mantener); nombres de ficheros y carpetas del repo no contienen marcas de LLM; branch names no revelan host/model cuando `agentWorktree` esté activo.

## why

El usuario explícito: "no quiero que alguien entre al repo y vea que ha publicado Claude o MiniMax y piense que es una mierda por usar IA". Es una preocupación reputacional real (sesgo anti-AI en una parte significativa del público developer). Las medidas actuales del repo (modo `explicit` del commit-policy, `commitAuthor.mode = "git"`) cubren el autor principal pero dejan tres fugas activas que el visitor de GitHub ve al instante: trailers, autores históricos, y filenames. La fuga más barata de cerrar (config + default flip) quita los trailers futuros y previene los que se generan ahora mismo. La cara (history rewrite + mailmap) requiere coordinación pero es necesaria para que el contributor graph no muestre a Claude/MiniMax como co-author.

Por qué ahora: el repo está en un ciclo de dogfooding intensivo con varios hosts LLM y está generando trailers y autores atribuibles a LLM cada semana. Esperar acumula deuda de rewrite (más commits = más reescritura = más fricción).

## non-goals

- NO cambia el comportamiento de los agentes (siguen pudiendo usar IA para escribir código; solo cambia la atribución visible en GitHub).
- NO modifica el modo `named` del core commit-author (sigue produciendo `Name (model) <email>` — solo se desactiva por config, no por código).
- NO desactiva dependabot[bot] — sigue siendo útil, es un bot neutral reconocido por GitHub.
- NO reescribe métricas internas o outputs que mencionen modelos (e.g. `delendai_metrics`); solo lo que llega a commits/branches/filenames visibles.
- NO cambia el default de `audit.trailer` para downstream consumers de `@delendai/core` que configuren su propio commit-policy — el cambio de default viene con migration note en CHANGELOG pero el campo sigue siendo configurable.
- NO toca la sección de wiki (`docs/delendai/wiki/`) que legítimamente documenta bridges a Claude/Codex/Copilot — la documentación de adapters externos puede y debe nombrarlos.

## Slices

- global_gate: lint

### S1 — Desactivar el trailer Co-authored-by ahora (solo config)
- **Status**: done
- **Shipped-In**: 2a7c8c71e chore: update .claude/agents/delendai-delivery-verifier.md ... (pre-existing chore that landed the trailer:none change)
- **Files**: `delendai.config.json`
- **Gate**: lint
- shipped-in: `2a7c8c71e`

Cambio mínimo y quirúrgico. Edita `delendai.config.json` y dentro de
`plugins.commit-policy.options.audit` sustituye `"trailer": "co-authored-by"`
por `"trailer": "none"`. Es un cambio **sólo de configuración** — no toca
código, no cambia defaults globales, y no rompe a ningún downstream consumer
del paquete (cada consumer sigue configurando lo que quiera).

Después del cambio:

1. `bun tools/scripts/commit-policy/print-effective-options.script.ts` (o
   equivalente) debe reportar `audit.trailer === 'none'`.
2. Un commit manual con `commit_policy_commit` (vía trigger o a mano) produce
   un mensaje cuyo `%B` (full body) NO contiene línea `Co-authored-by:`.
3. `bun run validate` queda verde; el resto de la suite no se ve afectada.

Es el **slice más barato y de mayor impacto**: corta la fuga principal sin
esperar al flip de default que llega en S2. Útil como primer paso aunque S2 lo
haga redundante.
- acceptance:
  - "Setear `plugins.commit-policy.options.audit.trailer` a `"none"` en `delendai.config.json`."
  - "`commit_policy_commit` (manual o via trigger) produce mensajes sin línea `Co-authored-by:`."
  - "`git log -1 --format='%B'` sobre un commit nuevo del repo muestra solo el conventional commit message + scope + body, sin trailer."
  - "`bun run validate` en verde."
- review-state: done
- review-implementer: Carthage
- review-reviewer: minimax-m3.1-flash-preview
- review-log: approved by minimax-m3.1-flash-preview — verified at 2a7c8c71e, validate exit 0, tests 15/15 — Config-level half of the proposal. Verified on the delivered tree: delendai.config.json carries plugins.commit-policy.options.audit.trailer = "none", the single file S1 declared and the only one of it that 2a7c8c71e changes. The engine behaviour ACC2/ACC3 lean on is measured by the proposal's own evidence script, which I ran from my review worktree: 0 failures across 13 checks, including [PASS] AuditSchema default is 'none' (S2), [PASS] last commit message has no LLM Co-authored-by trailer, [PASS] last 5 commits have no LLM Co-authored-by trailer. I exercised the guard end to end rather than trusting the file's presence: `lefthook run commit-msg` on a message carrying `Co-authored-by: Claude Sonnet 5 <noreply@anthropic.com>` was refused (exit 1, naming f00500 S5 and docs/PRIVACY.md), and the same command on a clean message passed. Gate `lint`: `bun run lint:no-llm-attribution` exits 0 (`no-llm-attribution: ok`), spec 15 pass / 0 fail, which is the 15/15 evidence. Reviewer is me, distinct from the implementer (Carthage, a `round` implementer).

### S2 — Flip default en código + ajustar tests que pineaban "co-authored-by"
- **Status**: done
- **DependsOn**: [S1]
- **Files**: `plugins/commit-policy/src/lib/contracts/options.ts`, `plugins/commit-policy/src/lib/audit/trailer.ts`, `plugins/commit-policy/README.md`, `plugins/commit-policy/tests/src/lib/audit/trailer.spec.ts`, `plugins/commit-policy/tests/src/lib/engine.spec.ts`, `plugins/commit-policy/tests/src/lib/dry-run-commit.spec.ts`, `plugins/commit-policy/tests/src/lib/processed-events.spec.ts`, `plugins/commit-policy/tests/src/lib/services/commit-driver.spec.ts`, `plugins/commit-policy/tests/src/lib/services/scope.spec.ts`, `plugins/commit-policy/tests/src/lib/tools/run-tool.spec.ts`, `plugins/commit-policy/tests/src/e2e/dogfood.spec.ts`
- **Gate**: lint
- shipped-in: `f6c419c01`

Hace que el default del plugin deje de filtrar attribution incluso en
proyectos que todavía no han migrado a `trailer: 'none'` explícito.

Cambios concretos:

1. `plugins/commit-policy/src/lib/contracts/options.ts` — en el `AuditSchema`,
   cambia `trailer: z.enum(AUDIT_TRAILERS).default('co-authored-by')` a
   `.default('none')`. Actualiza el JSDoc que lo precede para reflejar el
   nuevo default y añadir una nota: "Default flipped from `co-authored-by` to
   `none` to keep LLM attribution off GitHub. Projects that need human-human
   Co-authored-by trailers can still set this explicitly."
2. `plugins/commit-policy/src/lib/audit/trailer.ts` — el JSDoc del header
   describe los tres kinds. Añade un párrafo "Default behaviour" que diga
   que el default es `none` y explique por qué.
3. `plugins/commit-policy/README.md` — la tabla de configuración lista
   `audit.trailer` con Default `"co-authored-by"`. Cámbialo a `"none"` y
   actualiza el bloque de ejemplo de configuración del header si muestra el
   valor viejo.
4. Los **tests** del plugin pinean `audit: { trailer: 'co-authored-by' as
   const, agentFormat: '${host}/${model}' }` en varios sitios (engine,
   processed-events, run-tool, dry-run-commit, scope, e2e/dogfood). La
   mayoría lo hacen solo para reproducir el old default — quítalo donde
   sobre. **Mantén** la línea explícita solo en `trailer.spec.ts` (donde se
   ejercita el formato Co-authored-by) y en `commit-driver.spec.ts` (donde
   hay casos específicos que verifican el trailer). El test
   `e2e/dogfood.spec.ts` también la necesita porque dogfoodea la pipeline
   completa; quítalo solo si el test no pierde cobertura.
5. `bun run --cwd plugins/commit-policy test` + `bun run validate` global.
- acceptance:
  - "Cambiar `AuditSchema.trailer` default de `'co-authored-by'` a `'none'` en `options.ts` (la línea `trailer: z.enum(AUDIT_TRAILERS).default('co-authored-by')`)."
  - "Actualizar el JSDoc de `trailer.ts` para reflejar el nuevo default."
  - "Actualizar la tabla de configuración en `plugins/commit-policy/README.md` (la fila de `audit.trailer` + el ejemplo de configuración inicial)."
  - "Quitar de los tests la línea `trailer: 'co-authored-by'` donde solo era para pinear el default; dejarla solo donde el test ejercita el comportamiento del trailer (e.g. `trailer.spec.ts` y `commit-driver.spec.ts` casos específicos)."
  - "Tests del plugin verdes, `bun run validate` global verde."
- review-state: done
- review-implementer: delendai-impl-20260908
- review-reviewer: delivery_verifier
- review-log: approved by delivery_verifier — Revisión independiente completada. El default de audit.trailer quedó en none tanto en el schema como en los defaults del plugin; la documentación y las fixtures comunes reflejan el cambio, mientras los casos explícitos de co-authored-by se conservan. La validación focalizada pasó 119/119 y el typecheck pasó. El gate global permanece rojo por tres fallos lifecycle ajenos a esta slice.
### S3 — Branch name sanitization (opt-in, redactor de host/model cuando agentWorktree=true)
- **Status**: done
- **Files**: `packages/core/src/lib/contracts/interfaces/agent-identity.interface.ts`, `plugins/proposals/src/lib/shared/agent-identity.ts`, `plugins/proposals/src/index.ts`, `plugins/proposals/tests/src/lib/shared/agent-identity.spec.ts`
- **Gate**: type
- shipped-in: `6dcaf0a5a`

`agentWorktree` está desactivado por defecto en este repo, así que esta fuga
no se materializa hoy — pero la preparamos para el día que se active, y de
paso ofrecemos el flag a cualquier consumer del paquete que sí lo tenga on.

1. **Contrato**: en `plugins/proposals/src/index.ts#register()`, leer
   `ctx.options.redactIdentity` (tipo `boolean | undefined`, default
   `false`). Si está activo, pasarlo a las llamadas a `composeIdentity`.
   No es necesario tocar `IDelendaiPluginConfig.options` (es `Record<string,
   unknown>`); basta con leer el flag en el site de uso.
2. **`composeIdentity`** en
   `plugins/proposals/src/lib/shared/agent-identity.ts` — añadir un segundo
   parámetro opcional `options?: { redact?: boolean }`. Cuando `redact` es
   `true`, descartar `host` y `model` del array de fields antes de
   componer. La composición cae a `<agent_name>` o `<agent_name>-<task_id>`.
   Mantener la firma actual `(identity)` para back-compat.
3. **Tests** en `plugins/proposals/tests/src/lib/shared/agent-identity.spec.ts`:
   - Caso `redact=true` con `{ host: 'vscode-copilot', model: 'm3', agent_name: 'andromeda', task_id: 'f00281' }` → `"andromeda-f00281"`.
   - Caso `redact=true` con `task_id` ausente → `"andromeda"`.
   - Caso `redact=false` (o ausente) → comportamiento actual intacto.
   - Caso `parseIdentity` con un branch antiguo que sí tenga host/model →
     sigue parseando igual (lossless).
4. **Wiring** en `agent_worktree` tool — pasa el flag al helper
   `composeIdentity`. `branch_gc` y `branch_status` no necesitan cambio
   porque solo leen branches, no las crean.
5. **Docs**: si existe `plugins/proposals/README.md`, documentar el flag en
   la sección de configuración con un párrafo "Privacy: redactIdentity".

La activación del flag en este repo (`delendai.config.json`) NO entra en
este slice — se queda como acción de un follow-up o lo aplica el maintainer
manualmente cuando lo necesite.
- acceptance:
  - "Añadir flag `redactIdentity: boolean` (default `false` en core, opt-in por host) a la config de `proposals` (NO tocar `delendai.config.json` — queda para que el maintainer lo active manualmente cuando quiera)."
  - "Cuando el flag está activo, `composeIdentity` omite los campos `host` y `model`; el branch queda `agent/<agent_name>-<task_id>` o, si no hay task, `agent/<agent_name>`."
  - "`nextCollisionSuffix` sigue funcionando idéntico."
  - "`parseIdentity` sigue siendo lossless hacia atrás (ramas antiguas con host/model siguen parseando igual)."
  - "Tests nuevos para el camino redactado; tests viejos no se rompen."
  - "El wiring de la config va a través de `IDelendaiPluginConfig.options` y `proposals/index.ts` lo lee — el campo puede ser opcional, default `false`."
- review-state: done
- review-implementer: claude-opus-5-5
- review-reviewer: minimax-m3.1-flash-preview
- review-log: approved by minimax-m3.1-flash-preview — verified at 329106a2b282, validate exit 0, tests 25/25 — Redaction flag delivered by 329106a2b ("feat(proposals): f00500 S3 — redactIdentity flag for composeIdentity"), the commit the queue offers and which changes 3 of the 4 declared files. Read the implementation, not just the flag: agent-identity.ts:142-147 omits host/model from the composite when the flag is true and :166 omits them from the bare slug, with the single-field early return at :152-154 preserving the historical `agent/<agent_name>` shape. Gate `type`: `bun run typecheck` from my worktree exits 0. ACC2/ACC3/ACC4 measured by running plugins/proposals/tests/src/lib/shared/agent-identity.spec.ts — 25 pass / 0 fail, 51 assertions, including the default-keeps-host/model case (:123), the redacted case (:145, :164), the untouched nextCollisionSuffix quartet (null / 1 / gap-filling 2 / no prefix false-positive) and the backwards-compat round-trip. ACC1's "do not touch delendai.config.json" holds: the config carries no redactIdentity key, so activation stays the maintainer's.

### S4 — Repo surface cleanup: renombrar filenames que contienen marcas de LLM
- **Status**: retired
- **Files**: `docs/delendai/proposals/done/audits/a00007-*.md`, `docs/delendai/proposals/done/audits/a00006-*.md`, `docs/delendai/proposals/done/resumes/n00001-*.md`, `docs/delendai/proposals/done/resumes/n00002-*.md`, `docs/delendai/proposals/done/README.md`, `docs/delendai/proposals/done/resumes/README.md`, `config/external/claude/`, `config/external/README.md`, `.gitignore`
- **Gate**: lint

Renombrar (sin contenido) los archivos cuyo nombre lleva una marca de LLM
visible en el listado de `docs/delendai/proposals/` y de `config/external/`.

Pasos:

1. **Inventario**: `ls docs/delendai/proposals/done/audits/ | grep -iE '(claude|minimax|gpt|gemini|copilot|codex)'`
   y análogo para `.../resumes/`. Lo mismo para `config/external/`.
2. **Rename** con `git mv`:
   - `<id>-...-codex-gpt-5-5.md` → `<id>-...-codex.md`
   - `<id>-...-claude-code-opus-4-8.md` → `<id>-...-claude.md`
   - `<id>-...-claude-code.md` → `<id>-...-claude.md`
   - `config/external/claude/` → `config/external/claude/`
   La regla heurística: el último segmento del nombre (separado por `-`)
   suele ser el modelo o el host; si contiene un número de versión o un
   vendor específico, recortar a la parte genérica.
3. **Actualizar referencias** en:
   - `docs/delendai/proposals/done/README.md` (la tabla de audits)
   - `docs/delendai/proposals/done/resumes/README.md` (la tabla de
     resumes)
   - `config/external/README.md` (la tabla de adapters externos)
   - El `README.md` interno de `config/external/claude/` (si menciona la
     ruta anterior — ahora debe decir `config/external/claude/`).
4. **`.gitignore`** — confirmar que `.cache/` ya está ignorado (sí, ver
   `.gitignore`). Añadir `.cache/chat-with-llms/` defensivamente, aunque ya
   esté cubierto por la regla umbrella.
5. **Re-sincronizar el índice**:
   `bun tools/scripts/proposals/sync-proposal-registry.script.ts` debe
   mostrar `errorCount: 0`.
6. **Verificación final**: `git grep -iE '(claude-opus|minimax-m3|gpt-5-5|gpt-4|gemini)' docs/delendai/proposals/` no debe devolver hits en
   filenames ni en el frontmatter (sí puede devolverlos en el `## Goal` /
   `## why` si la propuesta legítimamente describe el LLM con el que se
   hizo la auditoría — eso es histórico correcto).

No tocar `docs/delendai/wiki/` ni nada que documente adapters externos
con su nombre canónico: el wiki puede y debe mencionar Claude/Codex/Copilot.
- acceptance:
  - "Renombrar los 4 proposal filenames sustituyendo el sufijo de modelo (`codex-gpt-5-5`, `claude-code-opus-4-8`, `claude-code`) por sufijos neutros (`codex`, `claude`, `claude`, `claude` — quitar `-code` / `-gpt-5-5` etc.). Patrón: `<id>-<slug>-<host>.md` donde `<host>` es genérico (e.g. `codex`, `claude`)."
  - "Renombrar `config/external/claude/` a `config/external/claude/` y actualizar el `README.md` interno + el de `config/external/README.md`."
  - "Añadir línea defensiva `.cache/chat-with-llms/` a `.gitignore` (verificar primero si ya está; si no, añadir)."
  - "Actualizar las dos tablas que referencian los filenames renombrados."
  - "Correr `bun tools/scripts/proposals/sync-proposal-registry.script.ts` y verificar `errorCount: 0`."
  - "`git grep -iE '(claude-opus|minimax-m3|gpt-5-5|gpt-4|gemini)' docs/delendai/proposals/` no devuelve hits en filenames ni en la primera línea de cada doc."

Retired 2026-10-11. Renaming closed documents so that no file name carries a model's name was decided against by what the project chose afterwards: an agent is named by the model it runs as, in its work refs and its pull requests, which is the same surface (x00878, x00880, x00882). What this proposal protects, and still holds, is authorship: no commit names a model as author or co-author. The four documents are closed records and keep their names.
- review-state: in_review
- review-implementer: claude-opus-5-5

### S5 — Pre-commit hook + lint guard para AI attribution (defensa en profundidad)
- **Status**: done
- **DependsOn**: [S2]
- **Files**: `tools/scripts/lint/no-llm-attribution.script.ts`, `tools/scripts/lint/no-llm-attribution.spec.ts`, `lefthook.yml`, `package.json`
- **Gate**: lint
- shipped-in: `0adb72233`

Red de seguridad final: aunque alguien fuerce el `trailer: 'co-authored-by'`
o un agente externo (no-core) inyecte un trailer, el hook lo detecta y
rechaza.

1. **`tools/scripts/lint/no-llm-attribution.script.ts`** (nuevo) — script
   `*.script.ts` (convención del repo: ejecutable con `bun`). Pasos:
   - Si recibe argv[2] = path a un commit message file, lo lee y parsea
     trailers.
   - Si no, lee de `$(git rev-parse --git-dir)/COMMIT_EDITMSG` (el mensaje
     staged actual).
   - Para cada trailer `Key: value`, si el key matchea
     `/^(co-?authored-by|signed-off-by|generated-with|generated-by)$/i`
     AND el value matchea el regex de marcas LLM (definido abajo),
     registra violación.
   - Además escanea `git diff --cached --name-only` y para cada archivo
     staged, lee su contenido y aplica el mismo regex (catches source
     que bakea trailers AI como constantes).
   - Exit 1 con mensaje claro si hay violaciones; exit 0 si no.

   Regex de marcas LLM (case-insensitive):

   ```
   /\b(claude[\w-]*|minimax[\w-]*|gpt-?[3-9][\w-]*|gemini[\w-]*|copilot[\w-]*|codex[\w-]*|llama[\w-]*|mistral[\w-]*|qwen[\w-]*|deepseek[\w-]*)\b/i
   /\b(anthropic\.com|minimax\.ai|minimax\.local|copilot@local|copilot@anthropic|copilot@MiniMax)\b/i
   ```

   Pero: NO flagear `Co-authored-by: other-human <x@y>` aunque el email
   tenga `claude` como substring (es raro pero no imposible). El regex
   exige matchear el value completo, no un substring dentro de un email.

2. **`tools/scripts/lint/no-llm-attribution.spec.ts`** (nuevo) — 3+ fixtures:
   - Fixture 1: `Co-authored-by: Claude Sonnet 5 <noreply@anthropic.com>` →
     `exit 1` con mensaje que contiene "Claude Sonnet 5".
   - Fixture 2: `feat: x\n\nSome body.` → `exit 0`.
   - Fixture 3: `Co-authored-by: Alice <alice@personal.example>` → `exit 0`.
   - Fixture 4: `feat: x\n\n🤖 Generated with claude-opus-4.8` → `exit 1`.
   - Fixture 5: source file que contiene `const SIGNATURE = 'Co-authored-by: Claude'` → `exit 1`.

3. **`tools/scripts/hooks/pre-commit.ts`** — añadir paso que ejecute
   `bun tools/scripts/lint/no-llm-attribution.script.ts "$(git rev-parse --git-dir)/COMMIT_EDITMSG"` antes de aceptar el commit. Si falla,
   `exit 1` con el mensaje del lint (que ya es claro).

4. **`lefthook.yml`** — añadir bajo `pre-commit:` y `pre-push:` un job:

   ```yaml
   no-llm-attribution:
     run: bun tools/scripts/lint/no-llm-attribution.script.ts
   ```

   (Para `pre-commit`, pasarle el path a `COMMIT_EDITMSG`; para `pre-push`,
   pasarle un scan del working tree reciente.)

5. **`package.json`** — añadir `"lint:no-llm-attribution": "bun tools/scripts/lint/no-llm-attribution.script.ts"` al bloque `scripts`. Si
   existe un `lint` aggregate, añadirlo ahí para que `bun run validate` lo
   incluya.
- acceptance:
  - "Crear `tools/scripts/lint/no-llm-attribution.script.ts` que escanea staged diff (o el working tree) y rechaza con exit 1 cualquier commit message staged o archivo tracked que contenga un Co-authored-by/Generated-with/🤖 trailer cuyo valor mencione marcas LLM (regex: `\b(claude|minimax|gpt-4|gpt-5|gemini|copilot|codex|llama|mistral|qwen|deepseek)\b` + extensiones de modelo o dominios como `anthropic.com`, `MiniMax.ai`, `users.noreply.github.com` cuando el local-part matchea)."
  - "Tests spec que pinen: una fixture con `Co-authored-by: Claude Sonnet 5` → refuse; un commit normal de Cartago → pass; un `Co-authored-by: other-human <x@y>` no-LLM → pass."
  - "Extender el hook `tools/scripts/hooks/pre-commit.ts` para invocar este lint sobre el commit message staged antes de aceptar el commit."
  - "Añadir `bun tools/scripts/lint/no-llm-attribution.script.ts` a `pre-commit` + `pre-push` chains en `lefthook.yml`."
  - "Añadir `lint:no-llm-attribution` al script set en `package.json` para que `bun run validate` lo incluya."

Delivered on 2026-09-04 in `0adb72233` and never marked: the lint exists with its spec, `lefthook.yml` runs it on every commit message (`no-llm-attribution`), and `package.json` names it. It refuses a commit today, as every agent that added the trailer has found.
- review-state: done
- review-implementer: claude-opus-5-5
- review-reviewer: minimax-m3.1-flash-preview
- review-log: approved by minimax-m3.1-flash-preview — verified at bbe03407c185, validate exit 0, tests 15/15 — Approving the commit the supersede guard names. The slice's own first delivery is 0adb72233 ("chore(gen): regenerate the registries the new permission declarations feed"), which carried no-llm-attribution.script.ts and its spec; bbe03407c ("fix(lint): clear the biome regressions blocking every agent's proposal close") later touched the same declared files — all four (script, spec, lefthook.yml, package.json) exist at bbe03407c. I read the tree AT bbe03407c and judged that, per the queue's own guidance. Gate `lint`: `bun run lint:no-llm-attribution` exits 0 (`no-llm-attribution: ok`), spec 15 pass / 0 fail, 25 assertions — the 15/15 evidence. The finding that matters for ACC3/ACC4: the guard is NOT in `pre-commit`+`pre-push` as written; it is in lefthook's `commit-msg` block (lefthook.yml:447). I read the implementer's stated reason at lefthook.yml:435-446 and it is correct — pre-commit reads $(git rev-parse --git-dir)/COMMIT_EDITMSG, which git writes only AFTER pre-commit passes, so a pre-commit guard judges the previous message and would then refuse every subsequent commit for a message the author had already fixed, with a refusal telling them to change a message they had changed. commit-msg receives the real file as {1}, same as the conventional-commit check beside it. I did not take that on trust: .git/hooks/commit-msg dispatches to lefthook, and `lefthook run commit-msg` on a message carrying `Co-authored-by: Claude Sonnet 5 <noreply@anthropic.com>` was refused with exit 1, naming f00500 S5 and docs/PRIVACY.md, while the clean message passed. The guard is live on every commit, which is the coverage ACC3/ACC4 reach for — a deviation from the literal text in the direction of correctness, so met.

### S6 — Documentar la política de no-AI-attribution
- **Status**: review
- **DependsOn**: [S1, S2, S5]
- **Files**: `.github/CONTRIBUTING.md`, `docs/PRIVACY.md`, `README.md`
- **Gate**: lint
- shipped-in: `1ab56e2e9`

Hace que la política sea discoverable, no solo enforceable.

1. **`docs/PRIVACY.md`** (nuevo) — documento de una página con secciones:

   - **Commit author**. El autor del commit siempre es el maintainer humano
     (`CartagoGit`). Esto lo garantiza `commit-policy.identity.mode =
     'explicit'` con `owner = { name: 'Cartago', email: 'cartago.relaxingcup@gmail.com' }` en `delendai.config.json`.
   - **Co-authored-by trailers**. No se aceptan hacia asistentes IA. El
     plugin `commit-policy` configura `audit.trailer = 'none'` por default.
     El pre-commit hook (`tools/scripts/lint/no-llm-attribution.script.ts`,
     ver S5) rechaza cualquier trailer que matchee marcas LLM con un error
     claro.
   - **Branch names**. Cuando se active `agentWorktree`, las branches se
     componen vía `composeIdentity`. El flag opt-in
     `proposals.options.redactIdentity = true` (ver S3) elimina los campos
     `host` y `model` del nombre, dejando solo `<agent_name>` y opcionalmente
     `<task_id>`.
   - **Repo surface**. Los nombres de fichero y de carpeta del repo no
     contienen marcas de LLM (auditados en S4).
   - **Why**. Razón: el maintainer no quiere que un visitante del repo
     forme una opinión sobre la calidad del trabajo basándose en la marca
     del LLM que lo asistió. Es una preocupación reputacional legítima;
     sesgos anti-AI son reales en parte del público developer.

   Tono: factual, no militante. Sin责令 a nadie. Solo describe qué hace
   el repo y por qué.

2. **`.github/CONTRIBUTING.md`** — añadir un bullet al final de la sección
   "Commit messages — Conventional Commits":

   > **No AI attribution.** Co-authored-by trailers toward AI assistants are
   > not accepted. See [`docs/PRIVACY.md`](../docs/PRIVACY.md). The pre-commit
   > hook refuses them with a clear error.

3. **`README.md` y `README.es.md`** — al final del primer párrafo
   descriptivo, añadir una línea similar:

   > Attribution policy: see [`docs/PRIVACY.md`](docs/PRIVACY.md) — only
   > the human maintainer appears as commit author / co-author on GitHub.

   (Mantener tono neutral y breve. No es un manifesto, es un puntero.)

4. Verificar que los links renderizan (no hay paths rotos) y que no hay
   contradicción entre lo que dice la doc y lo que hace el engine.
- acceptance:
  - "Crear `docs/PRIVACY.md` con la política completa en 4 secciones: (a) commit author siempre humano (git config o explicit mode); (b) sin trailers Co-authored-by hacia LLMs; (c) branch names no contienen host/model cuando se redacta (S3); (d) PR descriptions y review comments no deben mencionar AI authorship."
  - "Añadir un bullet en `.github/CONTRIBUTING.md` en la sección de Commit messages que linke a `docs/PRIVACY.md` y diga "Co-authored-by trailers toward AI assistants are not accepted (see docs/PRIVACY.md). The pre-commit hook refuses them with a clear error.""
  - "Añadir una línea al final del bloque de "Why this project" en `README.md` y `README.es.md` que apunte a `docs/PRIVACY.md` (formato: "Attribution policy: [docs/PRIVACY.md](docs/PRIVACY.md) — only the human maintainer appears as commit author / co-author on GitHub.")."
  - "Links renderizan, no hay contradicción entre el comportamiento del engine y la documentación."

Delivered on 2026-09-04 in `1ab56e2e9`: `docs/PRIVACY.md` states the policy, and `README.md` and `.github/CONTRIBUTING.md` point to it.
- review-state: in_review
- review-implementer: claude-opus-5-5

### S7 — Validación end-to-end del conjunto
- **Status**: review
- **DependsOn**: [S1, S2, S3, S4, S5, S6]
- **Files**: `tools/scripts/verify/post-slice-f00500-evidence.script.ts`
- **Gate**: lint
- shipped-in: `1ab56e2e9`

Verifica que las 6 slices anteriores cierran la fuga de **commits
futuros y de archivos del repo**. La fuga de **commits históricos** se
queda para S8 (que es destructiva y opcional).

1. **`tools/scripts/verify/post-slice-f00500-evidence.script.ts`** (nuevo)
   — script que produce evidencia empírica:

   ```ts
   #!/usr/bin/env bun
   // pseudo-code del script
   const checks = [
     { name: 'validate', run: () => spawnSync('bun', ['run', 'validate']) },
     { name: 'no-llm-trailer-last-commit',
       run: () => {
         const out = exec('git log -1 --format=%B');
         return /co-authored-by:.*(claude|minimax|gpt-4|gpt-5|gemini|copilot|codex|llama|mistral|qwen|deepseek|anthropic\.com|minimax\.ai)/i.test(out)
           ? { ok: false, detail: out }
           : { ok: true };
       } },
     { name: 'no-llm-filenames-in-proposals-done',
       run: () => exec('git grep -ilE "codex-gpt|claude-opus|minimax-m3" docs/delendai/proposals/done/').trim() === ''
         ? { ok: true } : { ok: false } },
     { name: 'no-llm-folder-name',
       run: () => exec('git ls-files config/external/ | grep -i claude-code').trim() === ''
         ? { ok: true } : { ok: false } },
     { name: 'config-audit-trailer-none',
       run: () => /"trailer"\s*:\s*"none"/.test(readFile('delendai.config.json'))
         ? { ok: true } : { ok: false } },
     { name: 'lint-script-present',
       run: () => existsSync('tools/scripts/lint/no-llm-attribution.script.ts')
         ? { ok: true } : { ok: false } },
     { name: 'privacy-doc-present',
       run: () => existsSync('docs/PRIVACY.md') ? { ok: true } : { ok: false } },
   ];
   ```

2. El script sale con exit code = número de checks fallidos. stdout
   es una tabla markdown lista para pegar al commit body de S7.
3. Pegar el output al body del commit que cierra S7. Eso da la cadena
   de evidencia empírica para el reviewer.

Acceptance: el script produce `0` failures; `bun run validate` global
queda verde.
- acceptance:
  - "Crear `tools/scripts/verify/post-slice-f00500-evidence.script.ts` (script de evidencia) que ejecuta: `bun run validate`, `git log --format='%B' -1` (no debe tener Co-authored-by hacia LLM), `git grep -iE 'co-authored-by:.*(claude|minimax|gpt)' -- ':!*.script.ts' ':!.cache'` (debe devolver 0 hits en lo que se commitea)."
  - "El script sale con 0; el log se adjunta al commit body de S7 como evidencia empírica."
  - "`bun run validate` global verde."

Delivered on 2026-09-04: the evidence script exists and the attribution lint reports `ok` on the tree as it is on 2026-10-11.
- review-state: in_review
- review-implementer: claude-opus-5-5

### S8 — History rewrite + .mailmap (limpieza histórica, opcional pero recomendado)
- **Status**: review
- **DependsOn**: [S1, S2]
- **Files**: `.mailmap`, `tools/scripts/git/rewrite-llm-attribution.script.ts`, `tools/scripts/git/rewrite-llm-attribution.spec.ts`, `docs/delendai/wiki/git-history-rewrite.md`
- **Gate**: none
- shipped-in: `1ab56e2e9`

Cierra la fuga histórica**.** El `.mailmap` es instantáneo y barato; el
history rewrite es destructivo y opcional.

Delivered on 2026-09-04, the tooling: `.mailmap`, the rewrite script with its spec, and the runbook. Running the rewrite is not part of the slice and was not done: it rewrites published history, needs a freeze, and is the owner's to call, as the slice says (`none` gate, manual).
- review-state: in_review
- review-implementer: claude-opus-5-5

### S8a — `.mailmap`

Archivo nuevo en la raíz del repo. Formato git mailmap (canonical first,
aliases después). Mapeo inicial (los conteos exactos vendrán del audit
previo con `git shortlog -sne --all | grep -iE '(claude|minimax|anthropic|copilot|minimax|gemini)'`):

```
Cartago <cartago.relaxingcup@gmail.com> <cartago.relaxingcup@gmail.com>
Cartago <cartago.relaxingcup@gmail.com> <cartago@example.com>
Cartago <cartago.relaxingcup@gmail.com> <cartago@local>
Cartago <cartago.relaxingcup@gmail.com> <cartago@relaxingcup.dev>
Cartago <cartago.relaxingcup@gmail.com> <copilot-minimax-m3>
Cartago <cartago.relaxingcup@gmail.com> <copilot-minimax-m3@cartago.relaxingcup@gmail.com>
Cartago <cartago.relaxingcup@gmail.com> <copilot-minimax-m3@delendai.local>
Cartago <cartago.relaxingcup@gmail.com> <copilot@MiniMax>
Cartago <cartago.relaxingcup@gmail.com> <delendai@MiniMax.local>
Cartago <cartago.relaxingcup@gmail.com> <copilot@anthropic.com>
Cartago <cartago.relaxingcup@gmail.com> <ci@anthropic.com>
Cartago <cartago.relaxingcup@gmail.com> <delendai-bot@users.noreply.github.com>
Cartago <cartago.relaxingcup@gmail.com> <copilot@local>
Cartago <cartago.relaxingcup@gmail.com> <mensa-orchestrator@copilot>
```

NO mapear a `dependabot[bot]` ni a `Mario Volarich - WSL` — son legítimos.

Verificar con: `git log --use-mailmap --format='%an <%ae>' | sort -u`
— debe quedar solo Cartago + Mario + dependabot[bot].

GitHub respeta el mailmap para el **contributor graph** (colapsa aliases
en el canonical). NO lo respeta para los commit pages individuales (esos
siguen mostrando el autor original).
- review-state: in_review
- review-implementer: claude-opus-5-5

### S8b — `tools/scripts/git/rewrite-llm-attribution.script.ts`

Script que envuelve `git filter-repo` (preferido) con fallback a
`git filter-branch`:

```ts
#!/usr/bin/env bun
// pseudo-code
// 1. snapshot a /tmp/<repo>-mirror via `git clone --mirror`.
// 2. aplicar `.mailmap` con `git filter-repo --mailmap .mailmap`.
// 3. message-callback que elimina líneas Co-authored-by cuyo valor
//    matchee el regex LLM del S5.
// 4. opcional: colapsar autores bot (release-s5-agent, delendai-bot)
//    si se confirma que eran el maintainer.
// 5. exit 0 SOLO si el caller pasó --apply; en otro modo es dry-run.
```

**Nunca** auto-corre en `bun run validate` — `gate: none` significa
"manual con sign-off explícito".
- review-state: in_review
- review-implementer: claude-opus-5-5

### S8c — Tests del script

`tools/scripts/git/rewrite-llm-attribution.spec.ts` — usa `mkdtemp` +
`git init` + 3 fixtures + asserts post-rewrite. NO toca el repo real.
- review-state: in_review
- review-implementer: claude-opus-5-5

### S8d — Runbook

`docs/delendai/wiki/git-history-rewrite.md` con los pasos numerados
del runbook: backup, dry-run, validación con `git log --all --format='%B' | grep -ciE 'co-authored-by:.*(claude|minimax|gpt)'` (debe
dar 0), coordination con collaborators para force-push, retention de
`refs/original/*` durante 30 días, nota en CHANGELOG.

**Slice opcional pero recomendado.** Sin ella, el contributor graph
seguirá mostrando a `copilot-minimax-m3`, `GitHub Copilot`, etc. como
contribuidores (aunque el mailmap los colapsará en GitHub). El usuario
debe decidir si quiere la limpieza dura (rewrite) o solo la blanda
(mailmap + comportamiento futuro limpio).

- acceptance:
  - "Crear `.mailmap` con entradas para mapear cada autor histórico atribuido a LLM a `Cartago <cartago.relaxingcup@gmail.com>` (canonical GitHub-linked). El mailmap es instantáneo (no reescribe historia) y arregla el contributor graph en GitHub."
  - "Crear `tools/scripts/git/rewrite-llm-attribution.script.ts` que envuelve `git filter-repo` (con fallback a `git filter-branch`) para: (a) reescribir autores según `.mailmap`, (b) eliminar líneas `Co-authored-by:` cuyo valor matchee el regex de marcas LLM, (c) opcionalmente colapsar autores tipo `release-s5-agent` y `delendai-bot` a Cartago cuando el bot fuera realmente el maintainer."
  - "Tests del script con un repo throwaway: la fixture tiene 3 commits (uno normal Cartago, uno con Co-authored-by Claude, uno con autor `copilot-minimax-m3`); tras el rewrite los tres quedan limpios."
  - "Crear `docs/delendai/wiki/git-history-rewrite.md` con el runbook: (1) backup `git clone --mirror` antes; (2) ejecutar el script en una rama temporal; (3) validar que `git log --all --format='%B' | grep -iE 'co-authored-by:.*(claude|minimax)' | wc -l` da 0; (4) coordinar con collaborators para force-push; (5) dejar refs originales en `refs/original/*` para forensic recovery durante 30 días; (6) nota en CHANGELOG."
  - "El script NO se ejecuta automáticamente como parte de `bun run validate` — es `none` gate, manual con check-in explícito del maintainer."
  - "`.mailmap` se commitea y se pushea independientemente del rewrite; el rewrite requiere un window de freeze y un announcement."
- review-state: in_review
- review-implementer: claude-opus-5-5

## acceptance

- Setear `plugins.commit-policy.options.audit.trailer` a `"none"` en `delendai.config.json`.
- `commit_policy_commit` (manual o via trigger) produce mensajes sin línea `Co-authored-by:`.
- `git log -1 --format='%B'` sobre un commit nuevo del repo muestra solo el conventional commit message + scope + body, sin trailer.
- `bun run validate` en verde.
- Cambiar `AuditSchema.trailer` default de `'co-authored-by'` a `'none'` en `options.ts` (la línea `trailer: z.enum(AUDIT_TRAILERS).default('co-authored-by')`).
- Actualizar el JSDoc de `trailer.ts` para reflejar el nuevo default.
- Actualizar la tabla de configuración en `plugins/commit-policy/README.md` (la fila de `audit.trailer` + el ejemplo de configuración inicial).
- Quitar de los tests la línea `trailer: 'co-authored-by'` donde solo era para pinear el default; dejarla solo donde el test ejercita el comportamiento del trailer (e.g. `trailer.spec.ts` y `commit-driver.spec.ts` casos específicos).
- Tests del plugin verdes, `bun run validate` global verde.
- Añadir flag `redactIdentity: boolean` (default `false` en core, opt-in por host) a la config de `proposals` (NO tocar `delendai.config.json` — queda para que el maintainer lo active manualmente cuando quiera).
- Cuando el flag está activo, `composeIdentity` omite los campos `host` y `model`; el branch queda `agent/<agent_name>-<task_id>` o, si no hay task, `agent/<agent_name>`.
- `nextCollisionSuffix` sigue funcionando idéntico.
- `parseIdentity` sigue siendo lossless hacia atrás (ramas antiguas con host/model siguen parseando igual).
- Tests nuevos para el camino redactado; tests viejos no se rompen.
- El wiring de la config va a través de `IDelendaiPluginConfig.options` y `proposals/index.ts` lo lee — el campo puede ser opcional, default `false`.
- Renombrar los 4 proposal filenames sustituyendo el sufijo de modelo (`codex-gpt-5-5`, `claude-code-opus-4-8`, `claude-code`) por sufijos neutros (`codex`, `claude`, `claude`, `claude` — quitar `-code` / `-gpt-5-5` etc.). Patrón: `<id>-<slug>-<host>.md` donde `<host>` es genérico (e.g. `codex`, `claude`).
- Renombrar `config/external/claude/` a `config/external/claude/` y actualizar el `README.md` interno + el de `config/external/README.md`.
- **Status**: done
- Actualizar las dos tablas que referencian los filenames renombrados.
- Correr `bun tools/scripts/proposals/sync-proposal-registry.script.ts` y verificar `errorCount: 0`.
- `git grep -iE '(claude-opus|minimax-m3|gpt-5-5|gpt-4|gemini)' docs/delendai/proposals/` no devuelve hits en filenames ni en la primera línea de cada doc.
- Crear `tools/scripts/lint/no-llm-attribution.script.ts` que escanea staged diff (o el working tree) y rechaza con exit 1 cualquier commit message staged o archivo tracked que contenga un Co-authored-by/Generated-with/🤖 trailer cuyo valor mencione marcas LLM (regex: `\b(claude|minimax|gpt-4|gpt-5|gemini|copilot|codex|llama|mistral|qwen|deepseek)\b` + extensiones de modelo o dominios como `anthropic.com`, `MiniMax.ai`, `users.noreply.github.com` cuando el local-part matchea).
- Tests spec que pinen: una fixture con `Co-authored-by: Claude Sonnet 5` → refuse; un commit normal de Cartago → pass; un `Co-authored-by: other-human <x@y>` no-LLM → pass.
- Extender el hook `tools/scripts/hooks/pre-commit.ts` para invocar este lint sobre el commit message staged antes de aceptar el commit.
- Añadir `bun tools/scripts/lint/no-llm-attribution.script.ts` a `pre-commit` + `pre-push` chains en `lefthook.yml`.
- Añadir `lint:no-llm-attribution` al script set en `package.json` para que `bun run validate` lo incluya.
- Crear `docs/PRIVACY.md` con la política completa en 4 secciones: (a) commit author siempre humano (git config o explicit mode); (b) sin trailers Co-authored-by hacia LLMs; (c) branch names no contienen host/model cuando se redacta (S3); (d) PR descriptions y review comments no deben mencionar AI authorship.
- Añadir un bullet en `.github/CONTRIBUTING.md` en la sección de Commit messages que linke a `docs/PRIVACY.md` y diga "Co-authored-by trailers toward AI assistants are not accepted (see docs/PRIVACY.md). The pre-commit hook refuses them with a clear error."
- Añadir una línea al final del bloque de "Why this project" en `README.md` y `README.es.md` que apunte a `docs/PRIVACY.md` (formato: "Attribution policy: [docs/PRIVACY.md](docs/PRIVACY.md) — only the human maintainer appears as commit author / co-author on GitHub.").
- Links renderizan, no hay contradicción entre el comportamiento del engine y la documentación.
- Crear `tools/scripts/verify/post-slice-f00500-evidence.script.ts` (script de evidencia) que ejecuta: `bun run validate`, `git log --format='%B' -1` (no debe tener Co-authored-by hacia LLM), `git grep -iE 'co-authored-by:.*(claude|minimax|gpt)' -- ':!*.script.ts' ':!.cache'` (debe devolver 0 hits en lo que se commitea).
- El script sale con 0; el log se adjunta al commit body de S7 como evidencia empírica.
- `bun run validate` global verde.
- Crear `.mailmap` con entradas para mapear cada autor histórico atribuido a LLM a `Cartago <cartago.relaxingcup@gmail.com>` (canonical GitHub-linked). El mailmap es instantáneo (no reescribe historia) y arregla el contributor graph en GitHub.
- Crear `tools/scripts/git/rewrite-llm-attribution.script.ts` que envuelve `git filter-repo` (con fallback a `git filter-branch`) para: (a) reescribir autores según `.mailmap`, (b) eliminar líneas `Co-authored-by:` cuyo valor matchee el regex de marcas LLM, (c) opcionalmente colapsar autores tipo `release-s5-agent` y `delendai-bot` a Cartago cuando el bot fuera realmente el maintainer.
- **Status**: pending
- Crear `docs/delendai/wiki/git-history-rewrite.md` con el runbook: (1) backup `git clone --mirror` antes; (2) ejecutar el script en una rama temporal; (3) validar que `git log --all --format='%B' | grep -iE 'co-authored-by:.*(claude|minimax)' | wc -l` da 0; (4) coordinar con collaborators para force-push; (5) dejar refs originales en `refs/original/*` para forensic recovery durante 30 días; (6) nota en CHANGELOG.
- El script NO se ejecuta automáticamente como parte de `bun run validate` — es `none` gate, manual con check-in explícito del maintainer.
- `.mailmap` se commitea y se pushea independientemente del rewrite; el rewrite requiere un window de freeze y un announcement.

## risks and mitigations

- **S2 cambia un default** del plugin commit-policy. Para downstream
  consumers que dependan del default `co-authored-by`, será un cambio
  breaking en el comportamiento por defecto (aunque sigue siendo
  configurable). Mitigación: nota prominente en CHANGELOG; los projects
  que quieran el comportamiento antiguo lo configuran explícitamente.
- **S8 es destructivo**. La history rewrite rompe los clones existentes
  de cualquier collaborator. Mitigación: `refs/original/*` durante 30
  días + announcement en CHANGELOG + freeze window. Marcar la slice
  como **opcional** y dejar la decisión al maintainer.
- **S3 aumenta el riesgo de colisión de branch** cuando hay muchos
  agentes en paralelo (todos pasan a `agent/<name>-<task>` sin host/model
  que los distinga). Mitigación: `nextCollisionSuffix` ya maneja esto;
  el branch queda `agent/<name>-<task>-1`, `-2`, etc.
- **S5 puede tener falsos positivos** si el regex matchea un email
  legítimo con `claude` como substring. Mitigación: el regex exige
  matchear el **value completo del trailer**, no un substring dentro de
  un email — y se loggean los offenders para revisión.

## notes

### Surfaces → slices (mapa rápido)

| Surface (lo que ve el visitor en GitHub)                    | Estado hoy                                                                     | Slice que lo arregla | Tipo de fix                                                 |
| ----------------------------------------------------------- | ------------------------------------------------------------------------------ | -------------------- | ----------------------------------------------------------- |
| Autor del commit (git author)                               | `Cartago <cartago.relaxingcup@gmail.com>`                                      | (nada — ya correcto) | —                                                           |
| Co-authored-by trailer en commits futuros                   | leak activo (Claude, MiniMax)                                                  | **S1** + **S2**      | config + default flip                                       |
| Commits históricos con Co-authored-by                       | 833 commits (~20%)                                                             | **S8** (opcional)    | history rewrite                                             |
| Commits históricos con autor LLM                            | ~80 commits (`copilot-minimax-m3`, `GitHub Copilot`, `delendai@MiniMax.local`) | **S8**               | `.mailmap` (instant) + rewrite                              |
| Branch names cuando `agentWorktree: true`                   | leak latente                                                                   | **S3**               | opt-in flag `redactIdentity`                                |
| Filenames en `docs/delendai/proposals/done/`                | 4 archivos con sufijo de modelo                                                | **S4**               | rename + sync                                               |
| Carpeta `config/external/claude/`                           | leak visible                                                                   | **S4**               | rename                                                      |
| Defensa en profundidad (un agente externo inyecta trailers) | sin red de seguridad                                                           | **S5**               | hook + lint script                                          |
| Documentación de la política                                | inexistente                                                                    | **S6**               | `docs/PRIVACY.md` + CONTRIBUTING + README                   |
| Validación empírica                                         | sin test                                                                       | **S7**               | `tools/scripts/verify/post-slice-f00500-evidence.script.ts` |
