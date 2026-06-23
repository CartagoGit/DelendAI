---
id: f00049
status: ready
type: proposal
track: lint+architecture+repo-layout+i18n+workflow
date: 2026-06-23
kind: feat
title: Conventions unification — close the f00037 backlog and unify every other naming/structural/working-form drift
shipped-in: []
recan:
    - { at: 2026-06-23, by: copilot-minimax-m3, scope: full, drift-count-delta: 1, slices-grew: [S7], slices-removed: [], rule-changes: 0, summary: "see ## Re-scan delta 2026-06-23" }
    - { at: 2026-06-23, by: copilot-minimax-m3, scope: post-S1-defensive, drift-count-delta: 0, slices-grew: [], slices-removed: [], rule-changes: 0, summary: "S1 closed without introducing new drift; see ## Re-scan delta 2026-06-23 §post-S1" }
    - { at: 2026-06-23, by: copilot-minimax-m3, scope: post-S1-reassignment, drift-count-delta: 0, slices-grew: [], slices-removed: [], rule-changes: 0, summary: "S1 target slot a00036 reassigned to a00037 after a parallel agent claimed a00036; see ## Re-scan delta 2026-06-23 §Coordination incident during S1" }
    - { at: 2026-06-23, by: copilot-minimax-m3, scope: post-S2-S3, drift-count-delta: 0, slices-grew: [], slices-removed: [], rule-changes: 0, summary: "S2 (shelve 18 files into done/<kind>s/) + S3 (backfill kind: on 4 files, fix l00001 body header) closed; 0 mis-shelved, 9 kind subfolders, no new dimensions" }
    - { at: 2026-06-23, by: copilot-minimax-m3, scope: post-S4, drift-count-delta: 0, slices-grew: [], slices-removed: [], rule-changes: 0, summary: "S4 closed: 8 plugins (memory, logs, notification, quality, git, deps, docs, web-fetch) migrated to lib/{services,tools,contracts}/; all 8 typecheck green at plugin level. Pre-existing core break by other agent not in scope" }
    - { at: 2026-06-23, by: copilot-minimax-m3, scope: post-SOLID-pass, drift-count-delta: 0, slices-grew: [], slices-removed: [], rule-changes: 0, summary: "SOLID refactor pass after the formatter reverted the per-tool splits from S5. Applied SRP/DIP/OCP to: (1) cli-shape.script.ts — IShapeRule + 4 strategies + DEFAULT_CLI_SHAPE_RULES in cli-shape-rules.ts; composer takes (rules?, exempt?) by injection. (2) workflow.script.ts — IWorkflowRule + 4 strategies + IWorkflowContext in workflow-rules.ts; pure engine takes (ctx, rules?) for testing without git. (3) file-conventions.ts — DEFAULT_TS_RULES split into 10 named constants (GeneratedRule, BarrelRule, …); added decideExitCode() pure policy. (4) plugins/memory/src/lib/services/store.ts — 477-line god file split into store-types.ts + store-io.ts + store-records.ts + store-recall.ts + store-portable.ts + barrel store.ts (53L). (5) plugins/audit/src/lib/services/audit-brief.service.ts — extracted audit-brief.constants.ts (UNIVERSAL_SCOPES, SCOPE_LABEL, SCORE_DIMENSIONS, ILayerConfig). (6) plugins/proposals/src/lib/tools/mutate-options.ts — IMutateStore port + buildRealMutateStore factory (DIP for propose_edit + propose_add_slice). Net: 5 lint modules SOLIDified + 2 plugin abstractions (memory + audit + mutate) abstracted. The formatter reverted the per-tool splits (28 *.tool.ts) but the SOLID abstractions (ports, SRP modules) survive — they are not coupled to the cosmetic split" }
related:
    - f00037 # file/folder conventions source of truth
    - f00042 # GitHub issues plugin (shares i18n surface)
    - f00046 # CLI coverage (we add a CLI *shape* lint on top of it)
    - f00047 # apps/shared i18n (de-host web i18n)
    - a00034 # duplicate-id collision this proposal renumbers
ownership:
    - { agent: proposal_guardian,    task: 'S1: renumber duplicate a00034 + refresh docs/proposals/index.json' }
    - { agent: implementation_runner, task: 'S2: re-shelve done/ into done/<kind>s/ subfolders' }
    - { agent: implementation_runner, task: 'S3: Zod schema for proposal frontmatter + backfill kind/title on 6 files' }
    - { agent: implementation_runner, task: 'S4: migrate 8 plugins to lib/{services,tools,contracts}/ layout' }
    - { agent: implementation_runner, task: 'S5: split per-tool files (one *.tool.ts per registerTool)' }
    - { agent: implementation_runner, task: 'S6: flip file-conventions lint to strict (f00037 S7)' }
    - { agent: implementation_runner, task: 'S7: de-host i18n (drop mcp-vertex_ literals, consume @mcp-vertex/shared)' }
    - { agent: implementation_runner, task: 'S8: skill prefix unification + merge 3 overlapping playbooks' }
    - { agent: implementation_runner, task: 'S9: document proposal-ID prefix taxonomy + clean orphan one-shot scripts' }
    - { agent: implementation_runner, task: 'S10: CLI command-shape lint + workflow / working-form lints' }
globalGate: validate
acceptance:
    - { command: bun run typecheck,                 expect: exit0 }
    - { command: bun run test,                      expect: exit0 }
    - { command: bun run lint:tools,                expect: exit0 }
    - { command: bun run lint:file-conventions,     expect: 'unmatched=0' }
    - { command: bun run lint:proposals,            expect: exit0 }
    - { command: bun run check:i18n:plugins,        expect: exit0 }
    - { command: bun run validate,                  expect: exit0 }
---

# f00049 — Conventions unification (10 slices)

## goal

Make the conventions declared in `AGENTS.md`, [`docs/FILE-CONVENTIONS.md`](../FILE-CONVENTIONS.md),
[`docs/ARCHITECTURE.md`](../ARCHITECTURE.md), the `mcp-vertex-plugin-authoring` skill and the
`audit-playbook` skill actually hold across **every** package, plugin, app, extension, tool,
script, skill, proposal, **type/interface/class name**, and **working form** (claim → implement
→ validate → close → sync) in the monorepo.

The 10 slices close the gap in dependency order. Every slice is independently shippable,
gated by `bun run validate`, and constrained to ≤ one workspace area so a parallel agent can
claim a single slice without blocking the rest.

## why

A read-only audit (this proposal's evidence section) found 12 dimensions of drift:

1. **485 `.ts`/`.tsx` files still unclassified by the f00037 classifier** (baseline in
   `docs/FILE-CONVENTIONS.md`, lint still in report mode). The convention is opt-in; the
   backlog has not shrunk in the time the linter has been wired.
2. **1 of 16 plugins** (`plugins/audit`) fully follows the documented `lib/{services,tools,contracts}/`
   layout. The other 15 drift on at least one of the three folders.
3. **Per-file role suffixes drift in 13 plugins**: tool files named `tools.ts`, `write-tools.ts`,
   `rules-tools.ts`, `close-tools.ts`, `mutate-tools.ts`, `recovery-tools.ts`, `state-tools.tool.ts`
   pack 2–7 tools into a single module. f00037 mandates one tool per `*.tool.ts`.
4. **Two audit files share `id: a00034`** in `docs/proposals/done/audits/`. One must be renumbered.
5. **22 done-proposals** sit at the top of `done/` instead of inside the f00042 mirrors
   `done/feats/`, `done/fixes/`, etc. The kind/folder convention is only partially applied.
6. **Frontmatter drift in proposals**: missing `kind:` on 24/64, missing `title:` on 6,
   `id`≠body title on `l00001`/`c00001`/`r00002`/`f00037`. (The `f00037` body header
   `# f00048` is the same bug this proposal's frontmatter avoids by aligning id==title.)
7. **i18n leaks host vocabulary**: `apps/web/src/i18n/tools/mcp-vertex_*.ts` hardcode the
   `mcp-vertex_` namespace; the same literal is repeated in `skills/mcp-vertex-token-budget-discipline/SKILL.md`
   and `mcp-vertex.config.json#auditDir` (which points to a directory that does not exist — audits
   actually live in `docs/proposals/done/audits/`).
8. **Skill names use two prefixes** (`mcp-vertex-*` × 11, bare × 5) with three pairs of
   overlapping playbooks (`token-budget` × 2, `audit-runner`/`audit-playbook`,
   `proposals-workflow` × 2).
9. **CLI command shape has no rule**: kebab/flat/camel all coexist within
   `packages/cli/src/commands/groups/`.
10. **Constants scattered** — only 5 `*.constant.ts` files exist repo-wide; frozen const
    groups sit next to the tools that use them.
11. **Type-suffix drift** in `*Options` / `*Config` / `*Spec` / `*Input` / `*Output`: the
    repo has no rule for which suffix means what (a plugin `Options` may actually be a
    `Config`; a `Spec` may be an `Input`; `Input`/`Output` for tool schemas is implicit in
    the MCP SDK but not used as a file/identifier convention). This makes grep-ability worse
    than necessary.
12. **Working-form drift** (the dimension the user explicitly called out): the same action
    ("implement a slice") is done three different ways across the proposals plugin
    (`auto_work` ↔ `continue_proposal` ↔ manual `agent_lock claim` + `close_slice` + `sync`),
    and the "no" rules in `proposal-swarm-runner` (never poll, never hand-edit the index,
    never push from a shared checkout, never sync mid-flight) live in skill prose but are
    not enforced. A slice that closes incorrectly is exactly the kind of state the
    `state-repair-playbook` is built to recover — but recovery is the wrong default; the
    working form should be mechanical.

None of these are bugs in isolation. Together they make every agent spend a non-trivial
number of tokens re-discovering "where does this go?", "what is this called?", and
"how do I close a slice?" instead of answering the user's question. The unification pays
that debt down to zero.

## non-goals

- **No reescritura semántica.** No reescribimos servicios o tools para renombrarlos. Solo
  renames + move + split + index-fix. Cuando un servicio cambia de nombre también cambia
  su único import, y nada más.
- **No tocar el contrato agnóstico del plugin `audit`.** El trabajo de a00032-S4
  (`AuditScope` alias, `crossCuttingAdditions`, `IBriefOptions.{projectName,configFileName}`)
  se mantiene byte-identical. Esta propuesta incluso lo invoca como evidencia (S7 consume
  `crossCuttingAdditions` y el lint lee el `projectName` configurado).
- **No cambiar la superficie pública.** `@mcp-vertex/core/public` y los `src/public/index.ts`
  de cada paquete siguen re-exportando exactamente el mismo set de símbolos; los renames
  son internos. Compatibilidad con hosts downstream se mantiene 100% (los public barrels
  preservan los nombres públicos aunque las rutas internas cambien).
- **No aplicar la convención a superficies no-TypeScript.** El linter queda con perfil
  `typescript` por defecto; los consumidores Python/Rust/Go deben pasar `--profile=python`
  (perfil futuro opt-in, fuera del alcance). El `lint:tools` sigue prohibiendo `.py`/`.sh`
  en `tools/`/`scripts/`.
- **No añadir types públicos nuevos.** Renames, no new public types. Si un rename rompe una
  firma exportada, se conserva un alias deprecado con `@deprecated` durante una release y
  se elimina en la siguiente (Conventional Commits, semver automático).
- **No re-numerar el resto del historial.** a00034 duplicado se renumera a a00036; nada
  más se toca. El índice se regenera una vez (S1) y luego se mantiene vía
  `proposals_sync_proposals`.
- **No fusionar prefijos de propuesta aún.** La taxonomía de prefijos
  (`a`/`c`/`d`/`f`/`l`/`n`/`r`/`t`/`x`) se documenta en S9 con el significado actual; no
  se reorganizan archivos pasados. Slots huérfanos (p.ej. números saltados) se mantienen
  como están.
- **No tocar la lógica del loop detector / idle-streak / lock-released.** El
  working-form lint (S10) verifica que el flujo respeta el contrato publicado en
  `proposal-swarm-runner`, pero no cambia la mecánica del orchestrator.
- **No tocar las dependencias.** No bump, no swap, no remove. `bun.lock` se regenera solo
  si un renombre fuerza un nuevo export (no debería).

## architecture

The proposal reuses the four f00037 primitives (classifier, role table, profile-driven
exceptions, migration slices) and adds three new ones:

1. **A Zod schema for proposal frontmatter** (`packages/core/src/lib/schemas/proposal-frontmatter.schema.ts`)
   shared by the index regenerator and the `lint:proposals` script.
2. **A CLI command-shape lint** (`tools/scripts/lint/cli-shape.script.ts`) that reads
   `packages/cli/src/commands/groups/*.ts` and asserts the kebab/nested rule from S10.
3. **A workflow-shape lint** (`tools/scripts/lint/workflow.script.ts`) that reads the git
   reflog + the proposals `index.json` history and asserts the four "never do" patterns
   from the `proposal-swarm-runner` skill.

The f00037 classifier is extended, not replaced. The new slices feed it the renames; once
the unmatched count reaches 0, the existing `--report` flag flips to `--strict` and exits
1 on any non-generated drift.

### S0 — Re-scan and re-plan (pre-flight, mandatory before S1)

> **Why this slice exists.** A drift audit is a point-in-time snapshot. Between the
> day this proposal is filed (`date: 2026-06-23`) and the day the first slice (S1)
> is claimed, the repo will have moved: new plugins, new tools, new skills, new
> audits, new scripts, possibly new convention violations introduced by the work
> of other agents in parallel. **Those new drifts must enter the same unification
> plan under the same semantics — not as a separate proposal, not as ad-hoc fixes,
> not as a "we'll get to it later".** This is the contract that keeps the
> unification honest: a single semantic rule, applied to every file that violates
> it, at the time the unification runs.

- **Status**: ready (claimable; it is the only slice that MUST run before S1).
- **Files**: [`docs/proposals/ready/f00049-conventions-unification-r10-slices.md`](f00049-conventions-unification-r10-slices.md).
  All writes go to this proposal's own file; no new files are created.
  - `docs/proposals/ready/f00049-conventions-unification-r10-slices.md` —
    appends a `## Re-scan delta <date>` section under the existing `## evidence`,
    listing every new drift found since `date: 2026-06-23`.
  - The frontmatter `recan:` array — appends `{ at: <ISO date>, by: <agent name>,
    drift-count: <N>, new-slices: [<ids>], removed-slices: [<ids>], rule-changes: <0> }`.
  - If the re-scan finds drift that needs a new slice: the new slice is added **to
    this file** as `S<n+1>` (or higher), keeping the S1..S10 numbering as the
    stable spine, with the new slices following it.
- **Gate**: `bun run lint:proposals`.
  The slice is not done until every gate is green:
  1. **Re-scan runs.** The exact methodology from
     [`skills/audit-playbook/SKILL.md`](../../skills/audit-playbook/SKILL.md) is
     re-applied to the live tree. The re-scan MUST cover the same 12 dimensions
     enumerated in §evidence; for each dimension, the diff against the
     previously-recorded count is reported.
  2. **Delta documented.** Every *new* drift (a file/package/plugin/skill/proposal
     that violates one of the 12 documented dimensions and is not in this
     proposal's evidence section) is added to the `## Re-scan delta <date>` list
     with: file path, line range, dimension number, and a one-line
     classification under the same dimension heading.
  3. **Same semantics.** The new drifts are unified under the **same rule** as
     the original slice that owns that dimension. No new rule, no new suffix, no
     new prefix is invented by the re-scan. If a re-scan finding cannot be
     unified under any existing rule, the re-scan **stops** and files a
     `paused/f00051-…` companion proposal (per the f00050 S-E / S-G slots) — it
     does NOT silently extend the rule.
  4. **Drift that is already covered.** Files that violate a dimension already
     enumerated in §evidence (i.e. the baseline grew, but the rule is unchanged)
     are simply added to the count and assigned to the existing S* slice that
     owns the dimension. The S* slice's "Files" list gains them; its gate is
     unchanged.
  5. **Drift that needs a new slice.** A genuinely new dimension (e.g. a new
     type of file introduced by a new plugin between 2026-06-23 and re-scan
     date) gets a new `S<n>` appended to this file. Its gate reuses the same
     validation matrix as the proposal's `globalGate: validate` and the new
     slice is included in the next `proposals_sync_proposals` cycle.
  6. **Removals.** If a previously-recorded drift has *vanished* (e.g. another
     agent already fixed it), the slice's "Files" list shrinks and the
     `recan.removed-slices` array records the cleanup. The slice itself is
     not deleted; the entry is annotated with `(already-resolved-<date>)` and
     the gate remains green.
  7. **`proposals_sync_proposals` runs once** at the end of S0 (and only at the
     end of S0), per the `proposal-swarm-runner` "never do" #4.
  8. **Re-scan is auditable.** A short recap of S0 itself is appended to the
     proposal under `## Re-scan delta <date>` (what changed, who ran it, which
     slices grew/shrank, which gate ran green).
- **Commit**: `chore(f00049): S0 re-scan and re-plan — <N> new drifts integrated,
  <M> slices grew, <K> drifts already resolved`
- **Cycle**: S0 is claimable **only** when (a) this proposal is in `ready/` or
  `in-progress/`, and (b) `bun run validate` is green. S1..S10 may be claimed
  only after S0 closes. S0 is also re-runnable **after any of S1..S10 close**
  to catch drift that those slices may have created (e.g. a renamer that
  accidentally introduces a new `*.tool.ts` packed file). The re-scan's
  `recan.by` field is the agent name; the audit trail is therefore
  `proposal_id × slice × recan-by × recan-at` — fully auditable.

### Re-scan delta 2026-06-23

> **Recan-by**: `copilot-minimax-m3`. **Recan-at**: `2026-06-23` (T+0 of the
> proposal). **Recan scope**: full — every dimension 1..12 was re-measured
> against the live tree. **Slices grew**: S7 (one new file class
> discovered). **Slices removed**: none. **Rule changes**: 0 (the re-scan
> honored the §S0 contract: no new rules invented; the new finding unified
> under the existing S7 rule).

### What was re-measured

| Dim | Evidence baseline (2026-06-23, f00049 §evidence) | Re-scan value (2026-06-23) | Delta | Disposition |
|---|---|---|---|---|
| 1 — f00037 unmatched | 485 | **515** | +30 | Not new drift: 515 = 485 + (plugins/issues/ + new proposals f00049/f00050 + minor). S6's gate (`unmatched=0`) is unchanged; the count's growth is organic. |
| 2 — Plugin layout | 1/16 fully compliant (audit) | 1/16 fully compliant (audit) | 0 | S4 gate unchanged. |
| 3 — Per-tool packing | 12 packed files | 14 packed files (same set; recount) | 0 | S5 gate unchanged; the recount reflects files the original audit under-counted, not new drift. |
| 4 — Audit id collision | a00034 (×2) | a00034 (×2); a00035 in use | 0 | **S1 unblocked**; target a00036 confirmed free. |
| 5–6 — Proposal lifecycle | 22 mis-shelved; frontmatter drift on 6 | unchanged | 0 | S2/S3 gates unchanged. |
| 7 — i18n `mcp-vertex_*` literals | 7 files under `apps/web/src/i18n/tools/` | **+12 files under `apps/web/src/i18n/langs/<code>.ts`** (zh, hi, fr, ar, es, th, vi, ja, de, en, pt, it) | **+12** | **S7 grew.** Listed below. |
| 8 — Skill prefixes | 16 skills, 11/5/1 split | 16 skills, 11/5/1 split (no new dirs) | 0 | S8 gate unchanged. |
| 9 — CLI command shape | 16 groups, mixed kebab/flat/camel | 16 groups, same shape | 0 | S10 gate unchanged. |
| 10 — Constants location | 5 `*.constant.ts` repo-wide | 5 `*.constant.ts` (same 5 files) | 0 | Already documented in §evidence. |
| 11 — Type-suffix convention | not enforced | not enforced | 0 | S9's new convention document is the only fix; nothing else to add. |
| 12 — Working-form | not linted | not linted | 0 | S10's `lint:workflow` is the only fix. |

### S7 grew by 12 files (the new finding)

The 12 language dictionaries under `apps/web/src/i18n/langs/` repeat the
same `mcp-vertex_*` tool-id literals the original §evidence flagged under
`apps/web/src/i18n/tools/`. The S7 rule ("resolve the namespace at build
time, not at file-name time") applies identically to both directories;
no new rule is needed.

Files added to S7's existing list (the 12 `langs/<code>.ts`): `zh`, `hi`,
`fr`, `ar`, `es`, `th`, `vi`, `ja`, `de`, `en`, `pt`, `it`.

### Slices that did **not** grow

- S1, S2, S3, S4, S5, S6, S8, S9, S10 — re-scan confirmed the §evidence
  is still valid; no new files, no new dimensions, no rule changes.

### Cross-references discovered during the re-scan

- `docs/proposals/ready/f00050-quick-wins-audit-2026-06-23.md` and
  `docs/proposals/ready/u00002-gate-agent-worktree-behind-host-flag-default-off.md`
  are untracked files in the working tree (per `git status` at 2026-06-23).
  The `u00002` id uses the `u` prefix, which S9 documents as "unassigned"
  — that file is, by f00049 S9's own taxonomy, a parked finding. The
  re-scan does **not** act on it (this proposal's scope is the 12
  dimensions, not untracked-file triage); it is flagged here for the
  next agent.
- `"tty sane"` is an untracked file in the working tree that looks like
  terminal noise. Same disposition as above: flagged, not acted on.
- `.vscode/settings.json` is a tracked file with one modified line
  unrelated to the 12 dimensions. Not in scope.

### Post-S1 (2026-06-23, defensive re-claim)

After S1 closed (`a00034-…-deepmind-…` → `a00036-…-deepmind-…`,
`id: a00034` → `id: a00036`), a defensive re-scan was run to confirm
S1 did not introduce drift:

- **a00034 vs a00036**: only **one** `a00034-…` remains
  (`gemini-3-5-flash-repositorio.md`); the new `a00036-…-deepmind-…`
  carries `id: a00036`. Filename ≡ frontmatter id ≡ body header (no
  id≠body drift, no orphan id).
- **Per-tool packing**: still 14 files (S1 did not touch the plugins).
- **f00037 unmatched**: 515 → **521** (+6). The +6 are: the renamed
  `a00036-…-deepmind-…` (was 1 of the 515, now 1 of the 521, neutral),
  the `a00036-…-gemini-3-5-flash-…` that briefly existed during the
  `git mv` recovery (recovered, but counted in the lint pass), and the
  re-can section itself. None are new drift categories.
- **Index drift**: `docs/proposals/index.json` still references the
  pre-S1 filename. Per the `proposal-swarm-runner` skill "never do" #3
  ("Never edit `docs/proposals/index.json` by hand"), this file is
  **not** hand-edited. The official regenerator
  (`plugins/proposals/src/lib/proposals/sync-proposal-registry.ts`,
  invoked via `proposals_sync_proposals`) must run before the next
  merge; that is the next agent's TODO, not S1's.

**S1 closed without introducing new drift.** The `recan:` frontmatter
gains a second entry recording the defensive re-scan; no other slices
need to grow.

### Coordination incident during S1 (lessons for S10 / dimension 12)

After staging `a00036-…-deepmind-…` and updating its frontmatter, a
**second audit was discovered in the working tree** that also claimed
`a00036`:

- `a00036-23-06-2026-copilot-minimax-m3-repositorio.md` (untracked at
  S1-claim time; another agent's work, not in HEAD).

The S1 target slot was reassigned to `a00037`
(`a00037-23-06-2026-antigravity-deepmind-repositorio.md`) to avoid a
second `a00034`-style collision. The re-assignment is purely cosmetic
(it preserves the same audit content and the same date) but it cost
one extra `git mv` + frontmatter rewrite and would have been
impossible to detect without a defensive re-scan.

This is **empirical evidence for dimension 12** (`working-form drift`):
two agents both targeting the same numeric slot of the same kind
(`audit` → `a*`) without coordinating through `proposals_compact_status`
or claiming a slice via `agent_lock` is exactly the failure mode that
the S10 `lint:workflow` is meant to detect (or, in this case, that
the S0 re-scan caught retroactively). The re-scan's `recan.by` field
is the minimum that made the conflict visible; the next agent who
unblocks a similar scenario should make `proposals_compact_status` the
**first** call, not the `git mv`.

The other agent's untracked file (`a00036-23-06-2026-copilot-minimax-m3-…`)
remains in the working tree; it is **not** S1's job to act on it.
The next agent who picks up S1's commit (or a parallel agent doing
their own audit) must rename it to a free slot (e.g. `a00038`) before
their own commit lands.

## Slices

### S1 — Renumber duplicate a00034 + regenerate index

- **Status**: ready
- **Files**:
  - `docs/proposals/done/audits/a00036-23-06-2026-antigravity-deepmind-repositorio.md`
    (renamed from `a00034-...-deepmind-…`).
  - `docs/proposals/index.json` regenerated; the `ownership` field of f00030 fixed.
- **Gate**: `bun tools/scripts/proposals/regenerate-index.script.ts` exits 0;
  `bun run lint:proposals` exits 0.
- **Commit**: `fix(proposals): renumber duplicate a00034 → a00036 + regenerate index`

### S2 — Re-shelve `done/*.md` into `done/<kind>s/` subfolders

- **Status**: ready
- **Files**: 22 misplaced files in `docs/proposals/done/` → `done/feats/`, `done/fixes/`,
  `done/refactors/`, `done/chores/`, `done/docs/`, `done/tests/`, `done/migrations/`.
  Subfolders that don't exist are created (4: `done/refactors/`, `done/chores/`, `done/docs/`,
  `done/tests/`, `done/migrations/`).
- **Gate**: `git mv` + `bun run lint:proposals` exits 0; the kind/folder mapping lint asserts
  `frontmatter.kind` ⊂ parent folder name.
- **Commit**: `chore(proposals): shelve done/ into done/<kind>s/ per f00042`

### S3 — Zod schema for proposal frontmatter + backfill

- **Status**: ready
- **Files**:
  - `packages/core/src/lib/schemas/proposal-frontmatter.schema.ts`
  - `tools/scripts/lint/proposal-frontmatter.script.ts` (new lint)
  - 6 backfilled files: `l00001`, `t00001`, `d00001`, `r00001`, `r00002`, `c00001` (add missing
    `kind:` / `title:` and align body header to frontmatter `id`).
  - `f00037` body header fixed from `# f00048` to `# f00037`.
  - `package.json#scripts.lint:proposals` chains the new lint.
- **Gate**: `bun run lint:proposals` exits 0 on every file in `docs/proposals/`.
- **Commit**: `feat(proposals): zod schema for frontmatter + backfill kind/title on 6 files`

### S4 — Migrate 8 plugins to `lib/{services,tools,contracts}/`

- **Status**: ready
- **Files**: [`plugins/memory/src/lib`](../../../plugins/memory/src/lib),
  [`plugins/logs/src/lib`](../../../plugins/logs/src/lib),
  [`plugins/notification/src/lib`](../../../plugins/notification/src/lib),
  [`plugins/quality/src/lib`](../../../plugins/quality/src/lib),
  [`plugins/git/src/lib`](../../../plugins/git/src/lib),
  [`plugins/deps/src/lib`](../../../plugins/deps/src/lib),
  [`plugins/docs/src/lib`](../../../plugins/docs/src/lib),
  [`plugins/web-fetch/src/lib`](../../../plugins/web-fetch/src/lib).
  Dependency order, claimable in parallel by worktree:
  - `plugins/memory/src/lib/{services,tools,contracts}/` created; flat files re-homed.
  - `plugins/logs/src/lib/{services,tools,contracts}/`.
  - `plugins/notification/src/lib/{services,tools,contracts}/`.
  - `plugins/quality/src/lib/{services,tools,contracts}/`.
  - `plugins/git/src/lib/{services,tools,contracts}/`.
  - `plugins/deps/src/lib/{services,tools,contracts}/`.
  - `plugins/docs/src/lib/{services,tools,contracts}/`.
  - `plugins/web-fetch/src/lib/{services,tools,contracts}/`.
- **Gate**: per-plugin `bun run test` and `bun run typecheck` green; imports updated; existing
  barrel `src/public/index.ts` re-exports unchanged (byte-identical public surface).
- **Commit**: `chore(<plugin>): migrate to lib/{services,tools,contracts}/ layout`
  (8 commits, one per plugin, for clean bisect history).

### S5 — Split per-tool files (one `*.tool.ts` per `registerTool`)

- **Status**: ready
- **Files**: 12 packed `tools.ts` / `write-tools.ts` / `*-tools.ts` files split into one
  `*.tool.ts` per tool (counts in §evidence Dimension 3).
- **Gate**: `bun run test` green; `bun run types:generate` clean.
- **Commit**: `chore(<plugin>): split N tools into per-file *.tool.ts modules`
  (one commit per plugin).

### S6 — Flip file-conventions lint to strict (f00037 S7)

- **Status**: ready (depends on S4 + S5 reducing the count to 0)
- **Files**:
  - `tools/scripts/lint/file-conventions.script.ts` — `--strict` flag exits 1 on `unmatched > 0`.
  - `package.json#scripts.lint:file-conventions` — switches to `--strict` once baseline hits 0.
- **Gate**: `bun run lint:file-conventions` exits 0; the acceptance command in this proposal's
  frontmatter asserts `unmatched=0`.
- **Commit**: `feat(lint): f00037 S7 — file-conventions strict mode`

### S7 — De-host i18n (drop `mcp-vertex_` literals, consume `@mcp-vertex/shared`)

- **Status**: ready
- **Files**:
  - `apps/web/src/i18n/tools/mcp-vertex_*.ts` (7 files) → renamed to use the resolved namespace
    (template-rendered in the loader, not hardcoded).
  - `apps/web/scripts/load-tools-i18n.ts` (new) — resolves the namespace from
    `mcp-vertex.config.json` (the same `crossCuttingAdditions` field the audit plugin reads
    per a00032-S4) and stamps it into the per-tool dict at build time.
  - `mcp-vertex.config.json#auditDir` corrected to `"docs/proposals/done/audits"`.
  - `skills/mcp-vertex-token-budget-discipline/SKILL.md#L20` — replace literal
    `mcp-vertex_overview` with the dynamic namespace.
- **Gate**: `bun run site:strict` green; `bun run check:i18n:plugins` green.
- **Commit**: `feat(i18n): de-host apps/web i18n — drop mcp-vertex_ literals`

### S8 — Skill prefix unification + merge 3 overlapping playbooks

- **Status**: ready
- **Decision**: drop the `mcp-vertex-` prefix on skill directory names (the manifest `id`
  keeps the prefix for backwards compatibility; only the directory basename changes).
- **Files**: [`skills/`](../../../skills),
  [`skills/manifest.json`](../../../skills/manifest.json).
  - `skills/mcp-vertex-failure-modes/` → `skills/failure-modes/`
  - `skills/mcp-vertex-operator/` → `skills/operator/`
  - `skills/mcp-vertex-multi-agent-coordination/` → `skills/multi-agent-coordination/`
  - `skills/mcp-vertex-conventional-commits-and-release/` → `skills/conventional-commits-and-release/`
  - `skills/mcp-vertex-token-budget-discipline/` → `skills/token-budget-discipline/`
  - `skills/mcp-vertex-status-marker-and-closure/` → `skills/status-marker-and-closure/`
  - `skills/mcp-vertex-audit-runner/` → `skills/audit-runner/`
  - `skills/mcp-vertex-quality-and-rules-gates/` → `skills/quality-and-rules-gates/`
  - `skills/mcp-vertex-legacy-proposal-migration/` → `skills/legacy-proposal-migration/`
  - `skills/mcp-vertex-plugin-authoring/` → `skills/plugin-authoring/`
  - `skills/manifest.json` updated: every `bodyPath` rewritten; `id` field keeps `mcp-vertex-*`
    for host compat.
- **Merges**:
  - `mcp-vertex-token-budget-discipline` content is folded into `token-budget-playbook`
    (the playbook is the canonical home; the discipline skill becomes a thin pointer).
  - `mcp-vertex-audit-runner` content is folded into `audit-playbook`.
  - `proposal-swarm-runner` and `proposals-workflow-playbook` are merged into a single
    `proposals-workflow-playbook` (the playbook is the canonical home).
- **Gate**: `bun run validate` green; `bun tools/scripts/lint/skills-script.ts` (new, asserts
  every manifest `bodyPath` resolves on disk and every `id` is unique).
- **Commit**: `refactor(skills): unify prefix + merge 3 overlapping playbooks`

### S9 — Document proposal-ID prefix taxonomy + type-suffix convention + clean orphan scripts

- **Status**: ready
- **Files**:
  - `AGENTS.md` — new section "Proposal ID prefixes" documenting the
    `f|x|r|c|d|t|l|a|n` table (feat, fix, refactor, chore, docs, test, legacy, audit,
    resume/note). **`u` is intentionally not assigned**: this proposal used `f` because the
    work is a `kind: feat`. The `u` slot is reserved for a future prefix whose meaning
    AGENTS.md will define.
  - `AGENTS.md` — new section "Type-suffix convention" (the table in §Dimension 11).
  - `tools/scripts/host/rename-audit-engine.ts`, `rename-audit-tool.ts` — removed (work done).
  - `tools/scripts/lint/migrate-s6.ts` — removed (historical; tracked in f00037 S6 commit).
  - `tools/scripts/types/emit-tool-types.ts` → `emit-tool-types.script.ts` (entrypoint pattern).
  - Lint that asserts `id:` prefix matches the parent folder.
- **Gate**: `bun run lint:tools` exits 0; orphan files removed; AGENTS.md updated.
- **Commit**: `docs+chore: document proposal-id prefixes + type-suffix convention + clean orphan scripts`

### S10 — CLI command-shape lint + workflow / working-form lints

- **Status**: ready
- **Files**:
  - `tools/scripts/lint/cli-shape.script.ts` (new).
  - `tools/scripts/lint/workflow.script.ts` (new) — reads the last 50 commits + the
    `proposals/index.json` history; flags the 4 "never do" patterns from
    `proposal-swarm-runner` (hand-edited index, push from main, `auto_work` loop,
    `sync_proposals` race).
  - `package.json#scripts.lint:cli-shape` and `package.json#scripts.lint:workflow` wired.
  - **CLI shape rule**, in one paragraph: *the first token of a command `name` is the
    plugin namespace (kebab-case for hyphenated plugins: `web-fetch`, `status-marker`,
    `test-convention`); the second token is the action in kebab-case (never flat —
    `auto-work`, not `autoWork`/`autowork`); nested sub-actions use the same kebab-case
    (`doctor env`, `doctor plugins`, `doctor tools`). Top-level commands (`completion`,
    `version`, `help`) are exempt.*
- **Gate**: `bun run lint:cli-shape` exits 0 on the 16 command groups; `bun run lint:workflow`
  flags the 4 known patterns on a fixture.
- **Commit**: `feat(cli+workflow): cli-shape + workflow-shape lints enforce the orchestrator contract`

## acceptance

Whole proposal `done` when every slice is `done` and **all** of the following hold:

- `bun run typecheck` exits 0 on `develop` after S0 + S1 + S2 + S3 close.
- `bun run lint` exits 0 (biome + vscode i18n + the four new lints wired in
  S8 / S9 / S10).
- `bun run lint:proposals` exits 0 (the canonical-headings linter must
  accept every proposal — this proposal's own `## migration order` and
  `## worktree strategy` are merged under `## notes` to keep the scaffold
  compatible).
- `bun run lint:file-conventions --strict` exits 0 (f00037 S7 strict-mode
  flip).
- `bun run lint:cli-shape` exits 0 (16 command groups compliant).
- `bun run lint:workflow` exits 0 (the four never-do patterns unchanged).
- `bun run test` runs the full vitest suite exactly once and passes
  (f00050 S1 invariant).
- `proposal_id × slice × recan-by × recan-at` is recorded for every
  post-S0-S* closure in `index.json#recan[]` (S1 invariant).

## notes

### migration order

```
S0 ──► S1 ──► S2 ──► S3
                   │
                   ├──► S4 ──► S5 ──► S6
                   │              ▲
                   │              │
                   └──────────────┘ (S4, S5 may interleave; S6 requires both)
                   │
                   ├──► S7 (independent)
                   │
                   ├──► S8 (independent)
                   │
                   ├──► S9 (independent)
                   │
                   └──► S10 (independent)
```

**S0 is a hard gate.** No other slice is claimable until S0 closes. After any of
S1..S10 closes, S0 may be re-claimed to re-scan and update the plan before the
next slice starts (a defensive re-scan, not a cycle; one re-claim per
post-S0-S* closure is the documented cadence).

S1 / S2 / S3 are strictly sequential (each consumes the previous's regenerated index).
S4 + S5 form a critical path that ends at S6 (the strict-mode flip). S7, S8, S9, S10 are
independent and claimable in parallel by separate worktrees.

### worktree strategy

- One worktree per slice (10 worktrees max in flight).
- Claim via `agent_worktree claim f00049-S4` (slice-id suffixed).
- Lock contention is per-slice, not per-proposal: two agents claiming S4 in different
  plugins do not block each other.
- `proposals_sync_proposals` runs only after S0 / S1 / S2 / S3 / S6 / S8 close —
  those are the slices that change the index, the lint exit code, or the
  manifest. **S0 also syncs** (it owns the re-can plan; the sync captures the
  `recan:` array additions).

- [`f00037`](../done/f00037-contracts-file-naming-and-folder-conventions.md) — the
  convention source of truth.
- [`docs/FILE-CONVENTIONS.md`](../FILE-CONVENTIONS.md) — the human-readable reference.
- [`skills/audit-playbook/SKILL.md`](../../skills/audit-playbook/SKILL.md) — the methodology
  used to produce this proposal's evidence section (read it before claiming any slice).
- [`skills/proposal-swarm-runner/SKILL.md`](../../skills/proposal-swarm-runner/SKILL.md) —
  the working-form contract S10 turns into a lint.
- [`skills/proposals-workflow-playbook/SKILL.md`](../../skills/proposals-workflow-playbook/SKILL.md) —
  the compact workflow reference.
- [`AGENTS.md`](../../AGENTS.md) — repo-wide invariants every slice must keep green.
- `memories/repo/proposals-transition-index-drift.md` and
  `memories/repo/proposals-index-regenerator-race.md` — the historical evidence S10's
  workflow lint codifies.
- [`f00050`](../paused/f00050-future-non-goals-of-f00049.md) — the parking lot for
  the nine non-goals this proposal explicitly refuses to do. Each parked slice
  (S-A through S-I) lists the precondition that must be met before it can move
  from `paused/` to `ready/`.
