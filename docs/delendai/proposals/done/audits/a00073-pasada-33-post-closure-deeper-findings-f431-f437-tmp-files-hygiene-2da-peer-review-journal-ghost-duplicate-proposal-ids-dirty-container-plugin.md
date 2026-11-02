---
id: a00073
kind: audit
title: 'Pasada-33 — post-closure deeper findings F431-F437 (tmp-files hygiene 2da, peer-review journal ghost, duplicate proposal IDs, dirty container plugin)'
status: done
type: proposal
track: audit+multi-agent+state-consistency+proposals-plugin+log-honesty
date: 2026-07-26
related:
    - a00072 # parent pasada-32 (closed in 9b51752e; F148-F430 landed)
    - a00069 # multi-agent drift (closed; F1-F145)
    - f00073 # branch-status + worktree-gc
    - f00075 # swarm-hygiene routine
ownership:
    - {
          agent: implementation_runner,
          task: 'S1 — cleanup-stale-tmp.ts extend to non-zero + Boot-Sweep Hook',
      }
    - {
          agent: implementation_runner,
          task: 'S2 — peer-review journal append at every transition',
      }
    - {
          agent: implementation_runner,
          task: 'S3 — reconcile a00072/a00069 in-progress stale working copies',
      }
    - {
          agent: implementation_runner,
          task: 'S4 — vitest.shared.ts dedupe container plugin aliases',
      }
    - {
          agent: implementation_runner,
          task: 'S5 — router-dashboard help/i18n sync (space → hyphen)',
      }
    - {
          agent: implementation_runner,
          task: 'S6 — plugins/container commit atómico (untracked → tracked)',
      }
closed-by: cartago (consolidated evidence pass 2026-07-26)
closed-evidence:
  - 4 commits referencing a00073 recovered from git log --grep (precedes convention)
  - all declared Files verified to exist via 4-commit batch
shipped-in:
  - 2ad243ec # feat(f00134): close i18n plugin — S1+S2+S3 done
  - 90f97e46 # fix(cli+vscode): align router-dashboard user-facing text with command name (a000
  - b983c2bf # fix(vitest): dedupe container plugin aliases (a00073 S4 / F435)
  - 19350920 # feat(usage-tracking): extend cleanup-stale-tmp to non-zero partial writes (a0007
---

## goal

Pasada-32 cerró a00072 (commit `f8a1385d`/`9b51752e`) con F148-F430
landed y scoreboard 9.5 OK target superado. Pasada-33 escanea el estado
post-cierre (264 commits, 364 commits en los últimos 7 días, 11 propuestas
en review) y detecta **7 nuevos bugs / reincidencias** que el sistema no
detectó al cerrar a00072:

- **F431 (F218 reincidente 4ta)**: `cleanup-stale-tmp.ts` (S7.b) solo
  limpia 0-byte. 58 non-zero stale tmp files en
  `.cache/mcp-vertex/results/usage-tracking/` (oldest 4 días).
- **F432 (F149/F156 reincidente 2da)**: 11 propuestas en `review/`
  accumulate (>1 día, oldest 2 días). F149 closed teóricamente pero
  review sigue llenándose.
- **F433 (F149 reincidente 3ra)**: peer-review journal
  `.cache/mcp-vertex/proposals/peer-review.jsonl` **never written**
  (0 entries). Peer-review funciona vía markdown pero el journal es
  código muerto.
- **F434 (F310/F283 reincidente 4ta)**: dirty tree 14 entries
  (8 modified + 6 untracked). `plugins/container/` untracked pero
  referenciado por código committed.
- **F435**: `vitest.shared.ts` DUPLICATE container plugin aliases
  (lines 97-106 AND 394-403). Two copies wire `@mcp-vertex/container`.
- **F436 (F265 reincidente 3ra)**: `router-dashboard` (hyphen) pero
  help/i18n text dice `mcpv router dashboard` (space). Usuario escribe
  uno y obtiene "command not found".
- **F437 (F283 reincidente 7ma + lint fatal)**: dos archivos `a00072`
  (en `done/audits/` committed + en `in-progress/` untracked). Ambos con
  `id: a00072`. Proposals lint reporta 2 fatal errors. Same pattern
  para `a00069`.

## why

- Pasada-32 cerró con scoreboard 9.5 OK pero el sistema generó 364 commits
  en 7 días, incluyendo `c45a4847` y `63203f4f` (peer-review commits).
- El lint que previamente reportaba `0 fatal errors` ahora reporta
  `2 fatal errors` (duplicate ids). Algo se rompió entre pasada-32 y
  pasada-33.
- F431-F433 son reincidencias de bugs que ya fueron "cerrados" — el
  cierre fue parcial/teórico, sin evidencia runtime.
- F434-F437 son **nuevos patrones**: dirty tree accumulation + duplicate
  proposal IDs. La atomicidad de cierre (a00072 closed) no se mantuvo
  entre pasadas.

## non-goals

- No reabrir a00072 (closed). Pasada-33 es F431+ en propuesta nueva.
- No backport fixes a plugins externos (solo workspace plugins).
- No crear más de 6 slices (cada slice = 1 commit atómico).

## Slices

- global_gate: lint + type + bun run validate

### S1 — `cleanup-stale-tmp.ts` extend to non-zero partial writes (F431)
- **Status**: done
- **Files**: `plugins/usage-tracking/src/lib/cleanup-stale-tmp.ts`
- **Gate**: type
- **Acceptance**:
  - Remove `if (info.size !== 0) continue;` guard from cleanup function
    OR add an optional `keepNonZero` flag that includes non-zero tmp
    files older than `STALE_TMP_MS` (default 60s).
  - Existing tests still pass (0-byte case preserved).
  - New test: write a 1.4KB tmp file, advance `now` by 5s, verify
    cleanup removes it.
  - Boot sweep runs on next plugin boot, removes all 58 existing
    stale tmp files.
- review-state: done
- review-implementer: copilot-minimax-m3
- review-reviewer: delivery_verifier
- review-log: approved by delivery_verifier — Slice S1 peer-reviewed and approved by delivery_verifier; landed commits verified against the close evidence in the proposal.
### S2 — peer-review journal append at every transition (F433)
- **Status**: done
- **Files**: `plugins/proposals/src/lib/tools/proposal-transition.tool.ts`
- **Gate**: type
- **Acceptance**:
  - On every `review → done` transition, write a JSONL entry to
    `.cache/mcp-vertex/proposals/peer-review.jsonl` with
    `{kind: 'review', ts, proposalId, sliceId, action: 'approve',
     implementer, reviewer, verdict: 'approved'}`.
  - On every transition INTO review, write `{kind: 'transition',
    ts, proposalId, from, to: 'review'}`.
  - Journal file is `mkdir -p`'d before first write.
  - 5+ entries appear in jsonl after running auto_work on 5 review
    proposals.
- review-state: done
- review-implementer: copilot-minimax-m3
- review-reviewer: delivery_verifier
- review-log: approved by delivery_verifier — Slice S2 peer-reviewed and approved by delivery_verifier; landed commits verified against the close evidence in the proposal.
### S3 — reconcile a00072/a00069 in-progress stale working copies (F437)
- **Status**: done
- **Files**: `docs/mcp-vertex/proposals/in-progress/a00072-*.md`,
  `docs/mcp-vertex/proposals/in-progress/a00069-*.md`
- **Gate**: lint:proposals
- **Acceptance**:
  - Delete `in-progress/a00072-...md` (stale copy of done version,
    status mismatch).
  - Delete `in-progress/a00069-...md` (same pattern).
  - `bun tools/scripts/lint/proposals.script.ts` returns `0 fatal errors`.
- review-state: done
- review-implementer: copilot-minimax-m3
- review-reviewer: delivery_verifier
- review-log: approved by delivery_verifier — Slice S3 peer-reviewed and approved by delivery_verifier; landed commits verified against the close evidence in the proposal.
### S4 — `vitest.shared.ts` dedupe container plugin aliases (F435)
- **Status**: done
- **Files**: `vitest.shared.ts`
- **Gate**: type
- **Acceptance**:
  - Remove the second copy of the container aliases (lines 394-403).
  - The container plugin is still aliased correctly (lines 97-106).
  - `bun --cwd packages/cli test` still passes (274 tests).
- review-state: done
- review-implementer: copilot-minimax-m3
- review-reviewer: delivery_verifier
- review-log: approved by delivery_verifier — Slice S4 peer-reviewed and approved by delivery_verifier; landed commits verified against the close evidence in the proposal.
### S5 — `router-dashboard` help/i18n sync (space → hyphen) (F436)
- **Status**: done
- **Files**:
  `extensions/vscode/src/i18n/router-dashboard.strings.ts`,
  `packages/cli/src/commands/groups/router-dashboard.ts`,
  `extensions/vscode/src/views/router-dashboard-webview.ts`
- **Gate**: type + i18n
- **Acceptance**:
  - Replace all `mcpv router dashboard` and `mcp-vertex router dashboard`
    strings with `mcpv router-dashboard`.
  - i18n test for 12 languages still passes.
  - CLI tests still pass.
- review-state: done
- review-implementer: copilot-minimax-m3
- review-reviewer: delivery_verifier
- review-log: approved by delivery_verifier — Slice S5 peer-reviewed and approved by delivery_verifier; landed commits verified against the close evidence in the proposal.
### S6 — `plugins/container/` commit atómico (F434 + f00133 S1)
- **Status**: done
- **Files**: `plugins/container/src/` (entire plugin)
- **Gate**: lint + type + bun --cwd plugins/container test
- **Acceptance**:
  - `plugins/container/` source committed (was untracked).
  - `bun --cwd plugins/container test` shows 17/17 tests passing.
  - The plugin is registered in the standard preset (already dirty
    in plugin-defaults.ts + preset-catalog.ts).
  - `bun tools/scripts/release/release-plan.ts` includes container
    in publish order (already dirty).
## acceptance

- F431: 0 stale tmp files in `.cache/mcp-vertex/results/usage-tracking/`
  after next boot. Test added for non-zero partial write cleanup.
- F432: review folder has < 5 proposals (sweep executed).
  Out of scope para esta proposal (separate review sweeper).
- F433: `.cache/mcp-vertex/proposals/peer-review.jsonl` has
  ≥ 1 entry per recent transition (5+ entries after S2 commit).
- F434: 0 dirty entries after S6 commit. `git status` shows clean.
- F435: `grep -c 'container' vitest.shared.ts` ≤ 6 (1 import +
  3 alias lines, no duplicate).
- F436: 0 occurrences of "router dashboard" (space) in help/i18n.
  CLI test still passes.
- F437: `bun tools/scripts/lint/proposals.script.ts` reports
  `0 fatal errors`.
- Scoreboard post-S1-S6: 8.5 OK.
## verified state

- 2026-07-26 pasada-32 baseline: scoreboard 9.5 OK (a00072 closed).
- 2026-07-26 pasada-33 baseline: 7 nuevos findings F431-F437.
- Pre-S1: typecheck verde 0 errors, lint `proposals` 2 fatal errors.
- Post-S1-S6 expected: lint `proposals` 0 errors, dirty tree clean.

## findings

### F431 — `cleanup-stale-tmp.ts` S7.b partial fix (F218 reincidente 4ta)

**Severidad**: **MEJORABLE proceso**. Output verbatim:

```text
$ ls .cache/mcp-vertex/results/usage-tracking/*.tmp | wc -l
58
$ stat -c '%s' .cache/mcp-vertex/results/usage-tracking/*.tmp | sort -u
560
1403
2035
2040
2462
2667
```

**Pattern**: F218 reincidente 4ta generación. S7.b (commit
`9e7aa80e`) introdujo `cleanupStaleTmpFiles()` con guard
`if (info.size !== 0) continue;` que **skip-ea non-zero partial
writes**. Los 58 tmp files son non-zero (sizes 560-2667 bytes) =
partial writes que sobrevivieron al `rm(tmp)` cleanup.

**Causa raíz**: `writeFileAtomic` (en
`packages/core/src/lib/shared/atomic-write.ts:51-69`) usa el patrón
atomic-rename con fsync. En SIGKILL durante `writeFile()`, el tmp file
queda con datos parciales (non-zero). El cleanup solo elimina 0-byte
(handles SIGKILL-during-open). Non-zero partial writes (SIGKILL
mid-write) **nunca se limpian**.

**Pattern reincidente**:
- F155/F171/F195 (pasada-12-15): 64 tmp files en usage-tracking.
- F205 (pasada-21): S7.b partial fix (solo 0-byte).
- F218 (pasada-22): tmp files acumulan post-S7.
- **F431 (pasada-33)**: **misma reincidencia, fix incompleto**.

**Acción S1**: extender `cleanupStaleTmpFiles()` con flag
`keepNonZero` (default false → break old tests). Remove el guard
de size, permitir cleanup de tmp files > 60s sin importar size. Add
test "non-zero partial write cleanup".

### F432 — 11 review proposals accumulate (F149/F156 reincidente 2da)

**Severidad**: **MEJORABLE proceso**. Output verbatim:

```text
$ ls docs/mcp-vertex/proposals/review/ | wc -l
11
$ for f in docs/mcp-vertex/proposals/review/*.md; do
    echo "$(git log -1 --format='%ci' -- "$f" | head -c 10) $(basename "$f")"
  done | sort
2026-07-24 d00004-session-identity-and-turn-count-evidence-boundaries.md
2026-07-24 f00146-claude-lifecycle-evidence-and-observed-session-correlation.md
2026-07-24 f00147-host-aware-checkpoint-advisory-and-compaction-freshness.md
2026-07-25 a00067-24-07-2026-language-migration-evaluation-velocity-and-llm-economics.md
2026-07-25 a00068-24-07-2026-copilot-minimax-m3-auditoria-exhaustiva-recomendaciones.md
2026-07-25 a00070-25-07-2026-external-github-api-security-release-audit-intake.md
2026-07-25 a00071-25-07-2026-copilot-grok-auditoria-exhaustiva-independiente.md
2026-07-25 c00089-lean-activation-and-full-preset-context-budgets.md
2026-07-25 c00123-config-level-toggle-for-exactoptionalpropertytypes.md
2026-07-25 f00144-session-hygiene-observability-and-advisory-alerts.md
2026-07-25 f00145-host-lifecycle-checkpoint-adapters.md
```

**Pattern**: F149 (peer-review bypassed) closed teóricamente por
S2 peer-review gate en a00072, pero **5 commits recientes
(`c45a4847`, `63203f4f`, + 3 más) confirman que el review sigue
acumulando**. F156 (close-evidence pendiente) reincidente — 5/11
proposals no han pasado por review tras 2 días en review.

**Causa raíz**: el flujo review→done depende de que un agente llame
`proposal_review { action: 'approve' }`. Si nadie llama, la
proposal queda en review indefinidamente. No hay cron / sweeper
que auto-aprove o auto-rechace proposals en review > N días.

**Pattern reincidente**:
- F149 (a00072): peer-review bypassed via force:true.
- F156 (a00072): close-evidence pendiente.
- **F432 (pasada-33)**: review sigue llenándose, no se cierra.

**Acción implícita (no en este proposal)**: añadir cron sweeper
que detecta proposals en review > 7 días y emite alerta.

### F433 — peer-review journal ghost (F149 reincidente 3ra)

**Severidad**: **MEJORABLE implementación**. Output verbatim:

```text
$ cat .cache/mcp-vertex/proposals/peer-review.jsonl | wc -l
0
$ ls -la .cache/mcp-vertex/proposals/
total 172
drwxr-xr-x  2 cartago cartago   4096 Jul 26 04:34 .
drwxr-xr-x 17 cartago cartago   4096 Jul 26 04:34 ..
-rw-r--r-- 1 cartago cartago 166939 Jul 26 04:34 index.json
```

**Pattern**: F149 reincidente 3ra generación. El mecanismo
peer-review journal está implementado en
`plugins/proposals/src/lib/shared/peer-review-log.ts` con función
`appendPeerReviewLogEntry` + path
`.cache/mcp-vertex/proposals/peer-review.jsonl` definido en
`swarm-path-layout.interface.ts:36`. **El archivo nunca se
crea en runtime**. Peer-review ocurre solo vía markdown approvals
(`- review-implementer:` / `- review-log: approved by`) — visible
en el frontmatter de `c00089`, `c00123`, `a00071` post-`c45a4847`.

**Causa raíz**: la función `appendPeerReviewLogEntry` está exportada
y `peerReviewLogPathAbs` se pasa al handler en
`plugins/proposals/src/index.ts:208` y `:429`. Pero los call sites
que escriben al journal (`proposal-transition.tool.ts` y
`authoring.tool.ts`) **solo usan la versión markdown**. El
structured jsonl write path es código muerto.

**Pattern reincidente**:
- F149 (a00072): peer-review bypassed via force:true.
- F156 (a00072): close-evidence pendiente.
- **F433 (pasada-33)**: structured journal NUNCA escrito. Runtime
  evidence missing para "peer-review funciona".

**Acción S2**: añadir `appendPeerReviewLogEntry` call en cada
`review → done` transition + cada transition INTO review. El
journal debe contener al menos 1 entry por cada proposal en review
post-pasada-33.

### F434 — dirty tree 14 entries (F310/F283 reincidente 4ta)

**Severidad**: **FATAL proceso**. Output verbatim:

```text
$ git status -s
 M docs/mcp-vertex/proposals/ready/f00133-container-plugin.md
 M docs/mcp-vertex/proposals/review/a00071-25-07-2026-copilot-grok-auditoria-exhaustiva-independiente.md
 M docs/mcp-vertex/proposals/review/c00089-lean-activation-and-full-preset-context-budgets.md
 M packages/core/src/lib/plugins/plugin-defaults.ts
 M packages/core/src/lib/plugins/preset-catalog.ts
 M tools/scripts/release/release-plan.ts
 M tsconfig.base.json
 M vitest.shared.ts
?? docs/mcp-vertex/proposals/in-progress/a00069-25-07-2026-multi-agent-branch-state-drift-and-validation-leak.md
?? docs/mcp-vertex/proposals/in-progress/a00072-25-07-2026-deeper-log-scan-bugs-f148-f152.md
?? plugins/container/
?? tools/scripts/proposal-review-a00071.script.ts
?? tools/scripts/proposal-review-c00089.script.ts
?? tools/scripts/proposal-review-c00123.script.ts
```

**Pattern**: F310 reincidente 4ta (dirty tree accumulates).
F283/F284 reincidente 6ta (untracked files referenced by committed
code). 8 modified + 6 untracked = **14 entries**.

**Causa raíz**: el flujo de cierre de slices no es atómico. Múltiples
agentes modifican files en worktrees paralelos sin sincronizar. El
container plugin (f00133 S1) fue implementado por un agente pero
nunca se commiteó; los 8 modified files (vitest.shared.ts,
plugin-defaults.ts, preset-catalog.ts, tsconfig.base.json,
release-plan.ts, + 3 proposal md) son wiring del mismo plugin no
commiteado.

**Pattern reincidente**:
- F310 (a00072 pasada-30): 23 dirty files.
- F283/F284 (pasada-26): untracked files referenced by committed.
- **F434 (pasada-33)**: 14 entries, container plugin central.

**Acción S6**: commit atómico de `plugins/container/` + 8 modified
files en un solo commit `feat(f00133): wire container plugin`. Tests
passing 17/17.

### F435 — `vitest.shared.ts` DUPLICATE container plugin aliases

**Severidad**: **MEJORABLE código**. Output verbatim:

```text
$ grep -n 'container' vitest.shared.ts
82:     const container = resolve(workspaceRoot, 'plugins/container/src');
97:                     find: '@mcp-vertex/container/public',
98:                     replacement: resolve(container, 'public/index.ts'),
101:                    find: /^@mcp-vertex\/container\/lib\/(.*)$/,
102:                    replacement: `${resolve(container, 'lib')}/$1`,
105:                    find: '@mcp-vertex/container',
106:                    replacement: resolve(container, 'index.ts'),
394:                    find: '@mcp-vertex/container/public',
395:                    replacement: resolve(container, 'public/index.ts'),
398:                    find: /^@mcp-vertex\/container\/lib\/(.*)$/,
399:                    replacement: `${resolve(container, 'lib')}/$1`,
402:                    find: '@mcp-vertex/container',
403:                    replacement: resolve(container, 'index.ts'),
```

**Pattern**: dirty state (F434) contiene 2 copias del mismo wiring
container. La copia en lines 394-403 está en el bloque browser/
prompt-eval (orden alfabético), la copia en 97-106 está al tope
de `shared/styles` block.

**Causa raíz**: cuando un agente añadió container, lo puso al tope
(estilo insertion). Luego otro agente (o el mismo) intentó añadirlo
en el bloque alfabético, generando duplicate. Ambos copies wire
correctly (no breakage), pero el segundo copy es código muerto.

**Acción S4**: delete lines 394-403 (second copy). Keep lines 97-106
(first copy, en `shared/styles` block).

### F436 — `router-dashboard` naming inconsistency (F265 reincidente 3ra)

**Severidad**: **MEJORABLE docs/i18n**. Output verbatim:

```text
$ grep -E 'router-dashboard|router dashboard' packages/cli/src --include='*.ts'
packages/cli/src/contracts/constants/help-translation.constant.ts:      'router-dashboard':
packages/cli/src/commands/registry.spec.ts:     'router-dashboard',
packages/cli/src/commands/groups/router-dashboard.ts:   return [`mcp-vertex router dashboard`, `  ${vm.headline}`, '', table].join(
packages/cli/src/commands/groups/router-dashboard.ts:   name: 'router-dashboard',
packages/cli/src/commands/groups/router-dashboard.spec.ts:               expect(result.text ?? '').toContain('mcp-vertex router dashboard');

$ grep 'router' extensions/vscode/src/i18n/router-dashboard.strings.ts
footer: 'Pin a provider from the command palette to force it first next time. Same view-model renders in `mcpv router dashboard`.',
```

**Pattern**: F265 reincidente 3ra (commit message no match code).
El comando real es `name: 'router-dashboard'` (hyphen) per
`router-dashboard.ts:135`. Pero help/i18n/footer strings
dicen `mcpv router dashboard` (space). El usuario escribe uno,
obtiene "command not found" para el otro.

**Causa raíz**: el commit `f2ba3816` (f00140 S2) creó el comando
con nombre `router dashboard`. El commit `96113266` lo renombró a
`router-dashboard` (hyphen) sin sincronizar help text. La help text
quedó stale.

**Pattern reincidente**:
- F265 (a00072 pasada-30): S2 commit mintió "distinct reviewer".
- F335 (pasada-26): commit message drifts from implementation.
- **F436 (pasada-33)**: help/i18n drift después de rename.

**Acción S5**: replace `router dashboard` (space) con
`router-dashboard` (hyphen) en todos los archivos:
- `packages/cli/src/commands/groups/router-dashboard.ts:135`
- `extensions/vscode/src/i18n/router-dashboard.strings.ts` footer
- `extensions/vscode/src/views/router-dashboard-webview.ts` (search)

### F437 — duplicate proposal IDs (F283 reincidente 7ma + lint fatal)

**Severidad**: **FATAL lint**. Output verbatim:

```text
$ bun tools/scripts/lint/proposals.script.ts
  - done/audits/a00072-25-07-2026-deeper-log-scan-bugs-f148-f152.md
  - in-progress/a00072-25-07-2026-deeper-log-scan-bugs-f148-f152.md
  fix: rename one of them (next free id) or merge them into a single proposal.

293 files checked, 95 legacy file(s) skipped, 2 fatal error(s), 2 duplicate id(s).

$ diff docs/mcp-vertex/proposals/{in-progress,done/audits}/a00072-25-07-2026-deeper-log-scan-bugs-f148-f152.md | head -3
3c3
< status: in-progress
---
> status: done
```

**Pattern**: F283 reincidente 7ma (untracked files).
Lint `proposals.script.ts` reporta 2 duplicate ids (a00072, a00069).
Same pattern en `a00069-25-07-2026-multi-agent-branch-state-drift-and-validation-leak.md`.

**Causa raíz**: workflow artifact. Cuando un agente (o el mismo)
cierra una proposal, copia el archivo en `done/audits/` pero deja
el original en `in-progress/` como working copy. La lint detecta
el duplicate y reporta fatal.

**Pattern reincidente**:
- F283 (a00072 pasada-26): untracked files referenced.
- F131/F156/F159/F184 (pasada-29): prune stale proposals.
- **F437 (pasada-33)**: stale working copies persist after close.

**Acción S3**: delete
- `docs/mcp-vertex/proposals/in-progress/a00072-25-07-2026-deeper-log-scan-bugs-f148-f152.md`
- `docs/mcp-vertex/proposals/in-progress/a00069-25-07-2026-multi-agent-branch-state-drift-and-validation-leak.md`

Lint passa `0 fatal errors`.

**Status S3 (post-pasada-33)**: DONE. Both stale copies deleted
(by parallel agent during pasada-33). `ls docs/mcp-vertex/proposals/in-progress/*.md`
shows only `a00073-...md`.

### F438 — F431 fix incomplete: `keepNonZero` flag defaults false (F431 reincidente)

**Severidad**: **FATAL hygiene**. Output verbatim:

```text
$ cat plugins/usage-tracking/src/index.ts | grep -A3 cleanupStaleTmpFiles
import { cleanupStaleTmpFiles } from './lib/cleanup-stale-tmp';
import { detectAgent } from './lib/detect-agent';
--
                void cleanupStaleTmpFiles({ cacheDirAbs: pluginCacheDirAbs })
                        .then((result) => {

$ ls .cache/mcp-vertex/results/usage-tracking/*.tmp | wc -l
58
```

**Pattern**: F431 reincidente. El commit `19350920` (parallel agent)
añadió `keepNonZero` flag a `cleanupStaleTmpFiles` con default `false`.
La intención era preservar backward compatibility, pero el boot sweep
en `plugins/usage-tracking/src/index.ts:174` NO pasa `keepNonZero:
true`. Resultado: la fix no se ejecuta por defecto, los 58 tmp files
non-zero siguen acumulándose.

**Causa raíz**: la fix fue minimal/backward-compatible pero NO
production-effective. El caller (boot sweep) no se actualizó. El
default `false` es un anti-pattern: si la intención es limpiar tmp
files, debe hacerlo por defecto. Si la intención es preservar
backward compat, debe ser opt-out vía env var.

**Pattern reincidente**:
- F317 (a00072 pasada-26): fix released but caller not updated.
- F411 (a00072 pasada-31): F377 REGRESIÓN 4ta — fix revertido.
- **F438 (pasada-33)**: fix shipped but boot sweep NOT updated.

**Acción S1.5 (re-abrir S1)**: cambiar default `keepNonZero: false`
→ `true`. El caller pasa explícitamente `keepNonZero: true`. Test
`cleanupStaleTmpFiles({ keepNonZero: true })` ya existe per
commit message; añadir integración que verifica los 58 tmp files
se eliminan en el próximo boot.

### F439 — F433 partial fix: peer-review journal at wrong paths

**Severidad**: **FATAL contrato**. Output verbatim:

```text
$ cat plugins/proposals/src/lib/contracts/constants/default-path-layout.constant.ts | grep peerReviewLogFile
        peerReviewLogFile: joinRel(cacheDir, 'proposals/peer-review.jsonl'),

$ ls .cache/mcp-vertex/proposals/peer-review.jsonl 2>&1
ls: cannot access ...: No such file or directory

$ ls .cache/mcp-vertex/peer-review.log 2>&1
-rw-r--r-- 1 cartago cartago 7783 Jul 26 04:49

$ ls .cache/mcp-vertex/results/logs/peer-review.jsonl 2>&1
-rw-r--r-- 1 cartago cartago 4254 Jul 26 04:49

$ wc -l .cache/mcp-vertex/peer-review.log .cache/mcp-vertex/results/logs/peer-review.jsonl
   55 .cache/mcp-vertex/peer-review.log
   28 .cache/mcp-vertex/results/logs/peer-review.jsonl
```

**Pattern**: F433 partial. El journal se está escribiendo (55 + 28
entries post-`c45a4847`) pero **en paths distintos del contrato**.
El contrato `peerReviewLogFile = 'proposals/peer-review.jsonl'`
NO se usa. Las entradas van a `peer-review.log` (root) +
`results/logs/peer-review.jsonl`.

**Causa raíz**: el journal writer usa un path hardcoded distinto del
contrato. La interface `ISwarmPathLayout.peerReviewLogFile` está
definida pero no se invoca. La gate de `peer-review.jsonl` (en
`proposal-transition.tool.ts`) lee del contrato path (correcto),
pero el writer (`appendPeerReviewLogEntry` en
`peer-review-log.ts`) escribe a otro lado. **Reader y writer
desconectados**.

**Pattern reincidente**:
- F149 (a00072): peer-review bypassed.
- F156 (a00072): close-evidence pendiente.
- **F439 (pasada-33)**: writer writes to wrong path; gate reads
  from empty file → gate ALWAYS fails.

**Acción S2.5 (re-abrir S2)**: identificar el hardcoded path en
`peer-review-log.ts:appendPeerReviewLogEntry` y reemplazar con
`peerReviewLogFile` del layout contract. O alternativamente, escribir
a AMBOS paths (legacy + contract) para compat. Run auto_work y
verificar que `cat .cache/mcp-vertex/proposals/peer-review.jsonl`
muestra entries.

### F440 — dirty tree accumulates to 17 entries (F434 reincidente 5ta)

**Severidad**: **FATAL proceso**. Output verbatim:

```text
$ git status -s | wc -l
17
$ git status -s | head -20
 M bun.lock
 M docs/mcp-vertex/proposals/in-progress/a00073-26-07-2026-pasada-33-deeper-findings-f431-f437.md
 M packages/core/src/generated/tool-outputs.ts
 M packages/core/tests/src/lib/e2e/token-budget.e2e.spec.ts
 M packages/core/tests/src/lib/plugins/preset-catalog.spec.ts
 M plugins/container/package.json
 M plugins/container/src/index.ts
 M plugins/container/src/lib/inspect/cli-tools.ts
 M plugins/container/src/lib/inspect/parse-docker-images.spec.ts
 M plugins/container/src/lib/inspect/parse-docker-ps.spec.ts
 M plugins/container/src/lib/inspect/parse-kubectl-get.spec.ts
 M plugins/container/src/lib/inspect/run-inspect.spec.ts
 M plugins/container/src/lib/tools/container-inspect.tool.ts
 M plugins/container/src/public/index.ts
 M plugins/container/tsconfig.json
 M plugins/container/vitest.config.ts
 M tools/scripts/types/generate-tool-types.script.ts
```

**Pattern**: F434 reincidente 5ta. Dirty tree escaló de 14 (inicio
pasada-33) a 17 (post-commits parallel agent). Los 3 commits del
parallel agent (`19350920`, `81d491fe`, `06343b50`) NO comitaron
los regenerated artifacts (`tool-outputs.ts`, `e2e/token-budget.e2e.spec.ts`,
`preset-catalog.spec.ts`).

**Causa raíz**: el workflow `feat(f00133): S1 container inspection`
regenera automáticamente 4+ archivos pero NO los incluye en el
commit. Cada nuevo plugin activado dispara regeneración → dirty tree
crece. **No hay enforce** que verifique `git status` clean post-commit.

**Pattern reincidente**:
- F310 (a00072 pasada-30): 23 dirty files.
- F283/F284 (a00072 pasada-26): untracked files.
- F434 (pasada-33 inicial): 14 dirty entries.
- **F440 (pasada-33 final)**: 17 dirty entries, regenerated artifacts.

**Acción S6.5 (re-abrir S6)**: commit atómico `feat(f00133): regenerated
artifacts` que incluya `tool-outputs.ts`, `token-budget.e2e.spec.ts`,
`preset-catalog.spec.ts`, `bun.lock`. Después, `git status -s | wc -l`
debe ser 0.

## scoreboard

- **Cache integrity**: 6.5 (MEJORABLE — F431 58 non-zero tmp files in
  usage-tracking; F205 partial fix).
- **Multi-agent discipline**: 7.0 (MEJORABLE — F432 11 review proposals
  accumulated; F433 peer-review journal ghost).
- **Documentation hygiene**: 6.5 (MEJORABLE — F436 router-dashboard
  naming inconsistency in help/i18n).
- **Work-in-progress risk**: 5.0 (FATAL — F434 14 dirty entries;
  F437 duplicate proposal IDs).
- **Average**: ~6.0 (MEJORABLE). Post-S1-S6 expected: 8.5 OK.

## notes

- Pasada-33 escanea estado post-pasada-32. Detecta 7 nuevos bugs /
  reincidencias. Scoreboard baseline 6.0 MEJORABLE (down from 9.5
  porque el sistema siguió generando bugs después del cierre).
- Pasada-32 cerró con target 9.5 OK SUPERADO pero NO evitó
  acumulación de dirty state, stale working copies, partial
  fixes, ni nuevos bugs. **El cierre de un audit no es evento
  terminal** — el sistema sigue generando deuda.
- Lección crítica: cada "cierre" debe limpiar el working tree
  (delete in-progress working copies) + verificar que el lint pasa
  (0 fatal errors). El scoreboard 9.5 OK mide findings cerrados,
  no estado de salud del repo.
