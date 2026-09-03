---
id: f00500
title: "Hide LLM attribution from GitHub surface (no co-authors, no AI brands, only CartagoGit)"
kind: feat
status: ready
type: proposal
track: general
date: 2026-09-03
---

# f00500 — Hide LLM attribution from GitHub surface (no co-authors, no AI brands, only CartagoGit)

## Goal

Asegurar que cualquier visitante del repositorio en GitHub solo vea al maintainer humano (CartagoGit) como autor/co-autor/colaborador. Hoy el repo filtra attribution a LLMs por cuatro vías paralelas y ninguna está mitigada:

1. **Co-authored-by trailer**: `mcp-vertex.config.json` tiene `commit-policy.audit.trailer: "co-authored-by"` con `agentFormat: "${host}/${model}"`. Cada commit slice-driven termina con `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>` o `Co-Authored-By: MiniMax M3 <MiniMax@users.noreply.github.com>`. GitHub lo muestra en la sección "Co-authored by" del commit page Y lo suma al contributor graph si el email matchea una cuenta real.

2. **Author principal del commit (histórico)**: ~80 commits en `git log --all` tienen `copilot-minimax-m3`, `GitHub Copilot`, `mcp-vertex@MiniMax.local` o `ci@anthropic.com` como autor (no solo trailer). Proceden de cuando el repo aún no había activado el modo `explicit` del commit-policy. Salen en el contributor graph como autores fantasmas.

3. **Branch names**: si `agentWorktree: true` se activa alguna vez, las branches serán `agent/copilot-minimax-m3-<name>-<task>`. Visibles en PR titles, branch list, reflog.

4. **Repo surface filenames**: `docs/mcp-vertex/proposals/done/audits/a00007-...codex-gpt-5-5.md`, `n00001-...claude-code.md` y `config/external/claude/` están committed y muestran LLM brands.

**Estado objetivo**: nuevo commit del repo solo muestra a Cartago como autor (sin trailer, sin co-author); contributor graph solo lista Cartago (+ Mario + dependabot[bot] histórico que el maintainer decida mantener); nombres de ficheros y carpetas del repo no contienen marcas de LLM; branch names no revelan host/model cuando `agentWorktree` esté activo.

## why

El usuario explícito: "no quiero que alguien entre al repo y vea que ha publicado Claude o MiniMax y piense que es una mierda por usar IA". Es una preocupación reputacional real (sesgo anti-AI en una parte significativa del público developer). Las medidas actuales del repo (modo `explicit` del commit-policy, `commitAuthor.mode = "git"`) cubren el autor principal pero dejan tres fugas activas que el visitor de GitHub ve al instante: trailers, autores históricos, y filenames. La fuga más barata de cerrar (config + default flip) quita los trailers futuros y previene los que se generan ahora mismo. La cara (history rewrite + mailmap) requiere coordinación pero es necesaria para que el contributor graph no muestre a Claude/MiniMax como co-author.

Por qué ahora: el repo está en un ciclo de dogfooding intensivo con varios hosts LLM y está generando trailers y autores atribuibles a LLM cada semana. Esperar acumula deuda de rewrite (más commits = más reescritura = más fricción).

## non-goals

- NO cambia el comportamiento de los agentes (siguen pudiendo usar IA para escribir código; solo cambia la atribución visible en GitHub).
- NO modifica el modo `named` del core commit-author (sigue produciendo `Name (model) <email>` — solo se desactiva por config, no por código).
- NO desactiva dependabot[bot] — sigue siendo útil, es un bot neutral reconocido por GitHub.
- NO reescribe métricas internas o outputs que mencionen modelos (e.g. `mcp-vertex_metrics`); solo lo que llega a commits/branches/filenames visibles.
- NO cambia el default de `audit.trailer` para downstream consumers de `@mcp-vertex/core` que configuren su propio commit-policy — el cambio de default viene con migration note en CHANGELOG pero el campo sigue siendo configurable.
- NO toca la sección de wiki (`docs/mcp-vertex/wiki/`) que legítimamente documenta bridges a Claude/Codex/Copilot — la documentación de adapters externos puede y debe nombrarlos.

## Slices

- global_gate: lint

### S1 — Desactivar el trailer Co-authored-by ahora (solo config)
- **Status**: pending
- **Files**: `mcp-vertex.config.json`
- **Gate**: lint

Cambio mínimo y quirúrgico. Edita `mcp-vertex.config.json` y dentro de
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
  - "Setear `plugins.commit-policy.options.audit.trailer` a `"none"` en `mcp-vertex.config.json`."
  - "`commit_policy_commit` (manual o via trigger) produce mensajes sin línea `Co-authored-by:`."
  - "`git log -1 --format='%B'` sobre un commit nuevo del repo muestra solo el conventional commit message + scope + body, sin trailer."
  - "`bun run validate` en verde."

### S2 — Flip default en código + ajustar tests que pineaban "co-authored-by"
- **Status**: pending
- **DependsOn**: [S1]
- **Files**: `plugins/commit-policy/src/lib/contracts/options.ts`, `plugins/commit-policy/src/lib/audit/trailer.ts`, `plugins/commit-policy/README.md`, `plugins/commit-policy/tests/src/lib/audit/trailer.spec.ts`, `plugins/commit-policy/tests/src/lib/engine.spec.ts`, `plugins/commit-policy/tests/src/lib/dry-run-commit.spec.ts`, `plugins/commit-policy/tests/src/lib/processed-events.spec.ts`, `plugins/commit-policy/tests/src/lib/services/commit-driver.spec.ts`, `plugins/commit-policy/tests/src/lib/services/scope.spec.ts`, `plugins/commit-policy/tests/src/lib/tools/run-tool.spec.ts`, `plugins/commit-policy/tests/src/e2e/dogfood.spec.ts`
- **Gate**: lint

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

### S3 — Branch name sanitization (opt-in, redactor de host/model cuando agentWorktree=true)
- **Status**: pending
- **Files**: `packages/core/src/lib/contracts/interfaces/agent-identity.interface.ts`, `plugins/proposals/src/lib/shared/agent-identity.ts`, `plugins/proposals/src/index.ts`, `plugins/proposals/tests/src/lib/shared/agent-identity.spec.ts`
- **Gate**: type

`agentWorktree` está desactivado por defecto en este repo, así que esta fuga
no se materializa hoy — pero la preparamos para el día que se active, y de
paso ofrecemos el flag a cualquier consumer del paquete que sí lo tenga on.

1. **Contrato**: en `plugins/proposals/src/index.ts#register()`, leer
   `ctx.options.redactIdentity` (tipo `boolean | undefined`, default
   `false`). Si está activo, pasarlo a las llamadas a `composeIdentity`.
   No es necesario tocar `IMcpVertexPluginConfig.options` (es `Record<string,
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

La activación del flag en este repo (`mcp-vertex.config.json`) NO entra en
este slice — se queda como acción de un follow-up o lo aplica el maintainer
manualmente cuando lo necesite.
- acceptance:
  - "Añadir flag `redactIdentity: boolean` (default `false` en core, opt-in por host) a la config de `proposals` (NO tocar `mcp-vertex.config.json` — queda para que el maintainer lo active manualmente cuando quiera)."
  - "Cuando el flag está activo, `composeIdentity` omite los campos `host` y `model`; el branch queda `agent/<agent_name>-<task_id>` o, si no hay task, `agent/<agent_name>`."
  - "`nextCollisionSuffix` sigue funcionando idéntico."
  - "`parseIdentity` sigue siendo lossless hacia atrás (ramas antiguas con host/model siguen parseando igual)."
  - "Tests nuevos para el camino redactado; tests viejos no se rompen."
  - "El wiring de la config va a través de `IMcpVertexPluginConfig.options` y `proposals/index.ts` lo lee — el campo puede ser opcional, default `false`."

### S4 — Repo surface cleanup: renombrar filenames que contienen marcas de LLM
- **Status**: pending
- **Files**: `docs/mcp-vertex/proposals/done/audits/a00007-*.md`, `docs/mcp-vertex/proposals/done/audits/a00006-*.md`, `docs/mcp-vertex/proposals/done/resumes/n00001-*.md`, `docs/mcp-vertex/proposals/done/resumes/n00002-*.md`, `docs/mcp-vertex/proposals/done/README.md`, `docs/mcp-vertex/proposals/done/resumes/README.md`, `config/external/claude/`, `config/external/README.md`, `.gitignore`
- **Gate**: lint

Renombrar (sin contenido) los archivos cuyo nombre lleva una marca de LLM
visible en el listado de `docs/mcp-vertex/proposals/` y de `config/external/`.

Pasos:

1. **Inventario**: `ls docs/mcp-vertex/proposals/done/audits/ | grep -iE '(claude|minimax|gpt|gemini|copilot|codex)'`
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
   - `docs/mcp-vertex/proposals/done/README.md` (la tabla de audits)
   - `docs/mcp-vertex/proposals/done/resumes/README.md` (la tabla de
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
6. **Verificación final**: `git grep -iE '(claude-opus|minimax-m3|gpt-5-5|gpt-4|gemini)' docs/mcp-vertex/proposals/` no debe devolver hits en
   filenames ni en el frontmatter (sí puede devolverlos en el `## Goal` /
   `## why` si la propuesta legítimamente describe el LLM con el que se
   hizo la auditoría — eso es histórico correcto).

No tocar `docs/mcp-vertex/wiki/` ni nada que documente adapters externos
con su nombre canónico: el wiki puede y debe mencionar Claude/Codex/Copilot.
- acceptance:
  - "Renombrar los 4 proposal filenames sustituyendo el sufijo de modelo (`codex-gpt-5-5`, `claude-code-opus-4-8`, `claude-code`) por sufijos neutros (`codex`, `claude`, `claude`, `claude` — quitar `-code` / `-gpt-5-5` etc.). Patrón: `<id>-<slug>-<host>.md` donde `<host>` es genérico (e.g. `codex`, `claude`)."
  - "Renombrar `config/external/claude/` a `config/external/claude/` y actualizar el `README.md` interno + el de `config/external/README.md`."
  - "Añadir línea defensiva `.cache/chat-with-llms/` a `.gitignore` (verificar primero si ya está; si no, añadir)."
  - "Actualizar las dos tablas que referencian los filenames renombrados."
  - "Correr `bun tools/scripts/proposals/sync-proposal-registry.script.ts` y verificar `errorCount: 0`."
  - "`git grep -iE '(claude-opus|minimax-m3|gpt-5-5|gpt-4|gemini)' docs/mcp-vertex/proposals/` no devuelve hits en filenames ni en la primera línea de cada doc."

### S5 — Pre-commit hook + lint guard para AI attribution (defensa en profundidad)
- **Status**: pending
- **DependsOn**: [S2]
- **Files**: `tools/scripts/hooks/pre-commit.ts`, `tools/scripts/lint/no-llm-attribution.script.ts`, `tools/scripts/lint/no-llm-attribution.spec.ts`, `lefthook.yml`, `package.json`
- **Gate**: lint

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

### S6 — Documentar la política de no-AI-attribution
- **Status**: pending
- **DependsOn**: [S1, S2, S5]
- **Files**: `.github/CONTRIBUTING.md`, `docs/PRIVACY.md`, `README.md`, `README.es.md`
- **Gate**: lint

Hace que la política sea discoverable, no solo enforceable.

1. **`docs/PRIVACY.md`** (nuevo) — documento de una página con secciones:

   - **Commit author**. El autor del commit siempre es el maintainer humano
     (`CartagoGit`). Esto lo garantiza `commit-policy.identity.mode =
     'explicit'` con `owner = { name: 'Cartago', email: 'cartago.relaxingcup@gmail.com' }` en `mcp-vertex.config.json`.
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

### S7 — Validación end-to-end del conjunto
- **Status**: pending
- **DependsOn**: [S1, S2, S3, S4, S5, S6]
- **Files**: `tools/scripts/verify/post-slice-f00500-evidence.script.ts`
- **Gate**: lint

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
       run: () => exec('git grep -ilE "codex-gpt|claude-opus|minimax-m3" docs/mcp-vertex/proposals/done/').trim() === ''
         ? { ok: true } : { ok: false } },
     { name: 'no-llm-folder-name',
       run: () => exec('git ls-files config/external/ | grep -i claude-code').trim() === ''
         ? { ok: true } : { ok: false } },
     { name: 'config-audit-trailer-none',
       run: () => /"trailer"\s*:\s*"none"/.test(readFile('mcp-vertex.config.json'))
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

### S8 — History rewrite + .mailmap (limpieza histórica, opcional pero recomendado)
- **Status**: pending
- **DependsOn**: [S1, S2]
- **Files**: `.mailmap`, `tools/scripts/git/rewrite-llm-attribution.script.ts`, `tools/scripts/git/rewrite-llm-attribution.spec.ts`, `docs/mcp-vertex/wiki/git-history-rewrite.md`
- **Gate**: none

Cierra la fuga histórica**.** El `.mailmap` es instantáneo y barato; el
history rewrite es destructivo y opcional.

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
Cartago <cartago.relaxingcup@gmail.com> <copilot-minimax-m3@mcp-vertex.local>
Cartago <cartago.relaxingcup@gmail.com> <copilot@MiniMax>
Cartago <cartago.relaxingcup@gmail.com> <mcp-vertex@MiniMax.local>
Cartago <cartago.relaxingcup@gmail.com> <copilot@anthropic.com>
Cartago <cartago.relaxingcup@gmail.com> <ci@anthropic.com>
Cartago <cartago.relaxingcup@gmail.com> <mcp-vertex-bot@users.noreply.github.com>
Cartago <cartago.relaxingcup@gmail.com> <copilot@local>
Cartago <cartago.relaxingcup@gmail.com> <mensa-orchestrator@copilot>
```

NO mapear a `dependabot[bot]` ni a `Mario Volarich - WSL` — son legítimos.

Verificar con: `git log --use-mailmap --format='%an <%ae>' | sort -u`
— debe quedar solo Cartago + Mario + dependabot[bot].

GitHub respeta el mailmap para el **contributor graph** (colapsa aliases
en el canonical). NO lo respeta para los commit pages individuales (esos
siguen mostrando el autor original).

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
// 4. opcional: colapsar autores bot (release-s5-agent, mcp-vertex-bot)
//    si se confirma que eran el maintainer.
// 5. exit 0 SOLO si el caller pasó --apply; en otro modo es dry-run.
```

**Nunca** auto-corre en `bun run validate` — `gate: none` significa
"manual con sign-off explícito".

### S8c — Tests del script

`tools/scripts/git/rewrite-llm-attribution.spec.ts` — usa `mkdtemp` +
`git init` + 3 fixtures + asserts post-rewrite. NO toca el repo real.

### S8d — Runbook

`docs/mcp-vertex/wiki/git-history-rewrite.md` con los pasos numerados
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
  - "Crear `tools/scripts/git/rewrite-llm-attribution.script.ts` que envuelve `git filter-repo` (con fallback a `git filter-branch`) para: (a) reescribir autores según `.mailmap`, (b) eliminar líneas `Co-authored-by:` cuyo valor matchee el regex de marcas LLM, (c) opcionalmente colapsar autores tipo `release-s5-agent` y `mcp-vertex-bot` a Cartago cuando el bot fuera realmente el maintainer."
  - "Tests del script con un repo throwaway: la fixture tiene 3 commits (uno normal Cartago, uno con Co-authored-by Claude, uno con autor `copilot-minimax-m3`); tras el rewrite los tres quedan limpios."
  - "Crear `docs/mcp-vertex/wiki/git-history-rewrite.md` con el runbook: (1) backup `git clone --mirror` antes; (2) ejecutar el script en una rama temporal; (3) validar que `git log --all --format='%B' | grep -iE 'co-authored-by:.*(claude|minimax)' | wc -l` da 0; (4) coordinar con collaborators para force-push; (5) dejar refs originales en `refs/original/*` para forensic recovery durante 30 días; (6) nota en CHANGELOG."
  - "El script NO se ejecuta automáticamente como parte de `bun run validate` — es `none` gate, manual con check-in explícito del maintainer."
  - "`.mailmap` se commitea y se pushea independientemente del rewrite; el rewrite requiere un window de freeze y un announcement."

## notes

### Surfaces → slices (mapa rápido)

| Surface (lo que ve el visitor en GitHub) | Estado hoy | Slice que lo arregla | Tipo de fix |
|---|---|---|---|
| Autor del commit (git author) | `Cartago <cartago.relaxingcup@gmail.com>` | (nada — ya correcto) | — |
| Co-authored-by trailer en commits futuros | leak activo (Claude, MiniMax) | **S1** + **S2** | config + default flip |
| Commits históricos con Co-authored-by | 833 commits (~20%) | **S8** (opcional) | history rewrite |
| Commits históricos con autor LLM | ~80 commits (`copilot-minimax-m3`, `GitHub Copilot`, `mcp-vertex@MiniMax.local`) | **S8** | `.mailmap` (instant) + rewrite |
| Branch names cuando `agentWorktree: true` | leak latente | **S3** | opt-in flag `redactIdentity` |
| Filenames en `docs/mcp-vertex/proposals/done/` | 4 archivos con sufijo de modelo | **S4** | rename + sync |
| Carpeta `config/external/claude/` | leak visible | **S4** | rename |
| Defensa en profundidad (un agente externo inyecta trailers) | sin red de seguridad | **S5** | hook + lint script |
| Documentación de la política | inexistente | **S6** | `docs/PRIVACY.md` + CONTRIBUTING + README |
| Validación empírica | sin test | **S7** | `tools/scripts/verify/post-slice-f00500-evidence.script.ts` |

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

## acceptance

- Setear `plugins.commit-policy.options.audit.trailer` a `"none"` en `mcp-vertex.config.json`.
- `commit_policy_commit` (manual o via trigger) produce mensajes sin línea `Co-authored-by:`.
- `git log -1 --format='%B'` sobre un commit nuevo del repo muestra solo el conventional commit message + scope + body, sin trailer.
- `bun run validate` en verde.
- Cambiar `AuditSchema.trailer` default de `'co-authored-by'` a `'none'` en `options.ts` (la línea `trailer: z.enum(AUDIT_TRAILERS).default('co-authored-by')`).
- Actualizar el JSDoc de `trailer.ts` para reflejar el nuevo default.
- Actualizar la tabla de configuración en `plugins/commit-policy/README.md` (la fila de `audit.trailer` + el ejemplo de configuración inicial).
- Quitar de los tests la línea `trailer: 'co-authored-by'` donde solo era para pinear el default; dejarla solo donde el test ejercita el comportamiento del trailer (e.g. `trailer.spec.ts` y `commit-driver.spec.ts` casos específicos).
- Tests del plugin verdes, `bun run validate` global verde.
- Añadir flag `redactIdentity: boolean` (default `false` en core, opt-in por host) a la config de `proposals` (NO tocar `mcp-vertex.config.json` — queda para que el maintainer lo active manualmente cuando quiera).
- Cuando el flag está activo, `composeIdentity` omite los campos `host` y `model`; el branch queda `agent/<agent_name>-<task_id>` o, si no hay task, `agent/<agent_name>`.
- `nextCollisionSuffix` sigue funcionando idéntico.
- `parseIdentity` sigue siendo lossless hacia atrás (ramas antiguas con host/model siguen parseando igual).
- Tests nuevos para el camino redactado; tests viejos no se rompen.
- El wiring de la config va a través de `IMcpVertexPluginConfig.options` y `proposals/index.ts` lo lee — el campo puede ser opcional, default `false`.
- Renombrar los 4 proposal filenames sustituyendo el sufijo de modelo (`codex-gpt-5-5`, `claude-code-opus-4-8`, `claude-code`) por sufijos neutros (`codex`, `claude`, `claude`, `claude` — quitar `-code` / `-gpt-5-5` etc.). Patrón: `<id>-<slug>-<host>.md` donde `<host>` es genérico (e.g. `codex`, `claude`).
- Renombrar `config/external/claude/` a `config/external/claude/` y actualizar el `README.md` interno + el de `config/external/README.md`.
- Añadir línea defensiva `.cache/chat-with-llms/` a `.gitignore` (verificar primero si ya está; si no, añadir).
- Actualizar las dos tablas que referencian los filenames renombrados.
- Correr `bun tools/scripts/proposals/sync-proposal-registry.script.ts` y verificar `errorCount: 0`.
- `git grep -iE '(claude-opus|minimax-m3|gpt-5-5|gpt-4|gemini)' docs/mcp-vertex/proposals/` no devuelve hits en filenames ni en la primera línea de cada doc.
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
- Crear `tools/scripts/git/rewrite-llm-attribution.script.ts` que envuelve `git filter-repo` (con fallback a `git filter-branch`) para: (a) reescribir autores según `.mailmap`, (b) eliminar líneas `Co-authored-by:` cuyo valor matchee el regex de marcas LLM, (c) opcionalmente colapsar autores tipo `release-s5-agent` y `mcp-vertex-bot` a Cartago cuando el bot fuera realmente el maintainer.
- Tests del script con un repo throwaway: la fixture tiene 3 commits (uno normal Cartago, uno con Co-authored-by Claude, uno con autor `copilot-minimax-m3`); tras el rewrite los tres quedan limpios.
- Crear `docs/mcp-vertex/wiki/git-history-rewrite.md` con el runbook: (1) backup `git clone --mirror` antes; (2) ejecutar el script en una rama temporal; (3) validar que `git log --all --format='%B' | grep -iE 'co-authored-by:.*(claude|minimax)' | wc -l` da 0; (4) coordinar con collaborators para force-push; (5) dejar refs originales en `refs/original/*` para forensic recovery durante 30 días; (6) nota en CHANGELOG.
- El script NO se ejecuta automáticamente como parte de `bun run validate` — es `none` gate, manual con check-in explícito del maintainer.
- `.mailmap` se commitea y se pushea independientemente del rewrite; el rewrite requiere un window de freeze y un announcement.
