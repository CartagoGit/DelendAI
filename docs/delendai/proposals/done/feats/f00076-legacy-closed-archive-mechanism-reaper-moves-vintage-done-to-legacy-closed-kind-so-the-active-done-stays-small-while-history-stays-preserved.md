---
id: f00076
title: "legacy/closed/ archive mechanism — reaper moves vintage done/ to legacy/closed/<kind>/ so the active done/ stays small while history stays preserved"
kind: feat
status: done
type: proposal
track: proposals+workflow
date: 2026-07-26
---

# f00076 — `legacy/closed/` archive mechanism

## Goal

Add a **`legacy/closed/`** subtree under `docs/mcp-vertex/proposals/` that mirrors `done/<kind>/` so vintage `done/` proposals can be **reaped** (moved out of the live `done/` tree) once they have outlived their active-review window. Reaped proposals stay indexed, stay searchable, and stay in the global history — but they are **frozen** (no transitions, no edits, no slice-status changes) so they cannot be confused with proposals that are still in active maintenance.

The mechanism has three moving parts:

1. **`legacy/closed/<kind>/<proposal>.md`** — physical folder, mirror of `done/<kind>/`. Each file gets a `archived-on: <ISO date>` frontmatter field on reaping, recorded in the body too.
2. **`tools/scripts/lint/reap-legacy-proposals.script.ts`** — periodic lint that **identifies** which `done/` proposals are vintage (default: `shipped-in:` is older than 30 days, or frontmatter `date:` is older than 60 days when `shipped-in:` is missing) and prints a one-line-per-proposal report. Default behaviour is dry-run; `--apply` performs the move with `git mv`.
3. **`tools/scripts/lint/closed-frozen-guard.script.ts`** — CI lint that **enforces** the freeze: any proposal under `legacy/closed/` whose `archived-on:` is older than the file's mtime, whose `status:` is no longer `done`, or whose slice statuses have changed since archival, fails the build.

The index aggregator (`plugins/proposals/src/lib/proposals/sync-proposal-registry.ts`) **adds** `legacy/closed/<kind>/` to its scan roots so reaped proposals keep appearing in `.cache/mcp-vertex/proposals/index.json` — just under a new `archived: true` flag — and the slice-completeness lint **exempts** them (they are by definition frozen, not actively maintained).

## Why

Today every `done/` proposal is permanently live: 293 proposals sit under `docs/mcp-vertex/proposals/done/<kind>/` and the count keeps growing every slice. Three concrete problems:

- **The active `done/` directory is misleading.** `done/feats/` has 146 entries — most of them are historic slices from June 2026 that no agent will ever revisit. New `proposal_transition --to done` operations mix fresh closures with five-week-old reaped ones, so the operator cannot tell "what shipped this week?" from "what shipped in the first sweep?".
- **There is no archival mechanism at all.** A proposal that closes today is reachable the same way a proposal from 2026-06-21 (the oldest in `done/feats/`, `f00001-adopt-core-migrations-for-agent-registry.md`) is. Nothing tells the workflow "this is settled, don't look at it again" — and the slice-completeness lint just landed (a00074) so a stale proposal with a missing `Files:` path now **fails** the validate gate even though it is already settled.
- **History preservation is non-negotiable.** The user explicitly asked for "tengamos un historico de ellas" — the archive must stay searchable, must appear in the index, and must count for global metrics (`count: 300` today). Dropping or hiding reaped proposals is not an option.

`legacy/closed/<kind>/` is the right shape because it:

- Mirrors the `done/<kind>/` subtree visually, so reaping looks like a move (the kind and id stay readable from the path).
- Sits **inside** the proposals root so the existing scanner can pick it up by adding one folder to its scan list — no new plugin, no new index format, no migration script for already-existing entries.
- Is **not** a new DFA status. Adding a status (`closed`) would require peer-review transitions, blocked-back-move guards, slice-status updates — none of which apply to a file that is frozen by definition. Treating it as a **location** rather than a status sidesteps the whole review-vs-archive debate.

## Why this design

Three independent decisions, each at the smallest layer that buys the property:

- **Folder over status.** The proposals plugin's state machine has 7 statuses and 14 kinds and adding an 8th status would cascade through `proposal_transition`, `proposal_force_transition`, `auto_work`, `proposal_review`, `proposal_create`, the DFA transition table, the folder-drift lint, the slice-completeness gate, and 30+ tests. The user wants an archive, not a workflow state — and the workflow already has `retired` for "do not work on this again". A physical folder is one new scan root, one new lint, and zero DFA changes.
- **Mirror `done/<kind>/` instead of a flat `legacy/closed/`.** A flat layout would force every consumer (the index, `proposal_diagnose`, the kind-filter in `proposal_review`) to learn a new shape. Mirroring means **the only difference is the parent folder**, so the existing kind inference (`PROPOSAL_KIND_BY_PREFIX`) keeps working and the file URL stays in the same `proposals/done/<kind>/<id>-<slug>.md` shape with two extra path segments. The reaper literally does `git mv done/<kind>/<id>-<slug>.md legacy/closed/<kind>/<id>-<slug>.md` — no rewriting, no frontmatter mutation beyond adding `archived-on:`.
- **Reaper is a lint, not an auto-runner.** Per repo convention, mutation scripts are gated by an explicit `--apply` flag (`migrate-legacy.script.ts`, `normalize-legacy.script.ts`, `sync-proposal-counters.script.ts` all follow this pattern). The default dry-run makes it safe to call from CI without an approval prompt, and `--apply` is the single-character opt-in. The vintage threshold is configurable: `--older-than=30d` (default) for proposals with `shipped-in:` frontmatter, `--older-than=60d` (fallback) for proposals without — a single flag covers both.

## Non-goals

- **No migration of existing `done/` proposals.** `legacy/closed/` starts empty; the user (or the reaper, when invoked with `--apply`) decides which proposals to move. No retroactive reaping without explicit consent.
- **No "un-archive" workflow.** Reaped proposals can be re-reaped, but moving a proposal out of `legacy/closed/` back to `done/` is a manual `git mv` — the reaper does **not** undo itself, and the closed-frozen-guard lint does **not** enforce one-way (only freeze). The user retains full agency; the archive only enforces "don't quietly drift", not "must stay forever".
- **No mass reaping during this slice set.** The proposal adds the mechanism; it does **not** retro-move all 293 done proposals. The user can dry-run and pick a batch.
- **No DFA changes.** `closed` is **not** a status. `retired` remains the "stop working on this" status. `legacy/closed/` is a folder.
- **No cross-project generalization.** This is `@mcp-vertex/core`-specific. The plugin could later accept a `closed` folder via `proposalArchiveFolder` config, but that is a separate concern.

## Slices

- global_gate: validate

### S1 — `legacy/closed/` folder + registry scanner + index inclusion

- **Status**: done
- **Files**: `docs/mcp-vertex/proposals/legacy/closed/.gitkeep` (new — sentinel so the folder ships), `docs/mcp-vertex/proposals/legacy/closed/README.md` (new — explains the archive semantics, references f00076, lists the reaper command), `plugins/proposals/src/lib/proposals/sync-proposal-registry.ts` (add `legacy/closed/<kind>/` to `subtreeAbsolutes` so the index picks them up; tag the entry `archived: true` while keeping `status: done` in the frontmatter projection), `plugins/proposals/src/lib/contracts/constants/proposal-glossary.constant.ts` (export `PROPOSAL_ARCHIVE_FOLDER = 'legacy/closed'` and a new `IProposalEntry.archived?: boolean` field — or, if simpler, add the flag inline in the scan loop), `plugins/proposals/src/lib/contracts/schemas/proposal-entry.schema.ts` (or wherever `IProposalEntry` is defined — add `archived?: boolean` to the schema).
- **Gate**: type + verify
- **Acceptance**:
  - The folder `docs/mcp-vertex/proposals/legacy/closed/` exists with a `.gitkeep` and a `README.md` that documents the archive semantics.
  - Empty `legacy/closed/` does not break the registry: running `bun run sync-proposal-registry` produces a valid `index.json` with `count: 300` and zero entries under `legacy/closed/`.
  - A proposal manually moved to `legacy/closed/feats/f00001-...md` is picked up by the next registry sync: its index entry has `status: done`, `archived: true`, `file: 'legacy/closed/feats/f00001-...md'`, and the same `id` and `date` as the original.
  - The folder-drift lint (`proposal-folder-drift.script.ts`) does **not** flag `legacy/closed/` as drift — its `expectedFolder` resolver returns `legacy/closed` (or accepts the file as correctly placed) when the proposal's archive metadata says it is archived.
  - `IProposalEntry.archived?: boolean` is a backward-compatible addition: existing readers ignore the field, the new schema permits it.

### S2 — `reap-legacy-proposals.script.ts` (lint + `--apply` move)

- **Status**: done
- **Files**: `tools/scripts/lint/reap-legacy-proposals.script.ts` (new — the reaper), `tools/scripts/lint/reap-legacy-proposals.script.spec.ts` (new — dry-run, `--apply`, vintage filter, kind inference, missing-file safety), `tools/scripts/lint/lib/reap-legacy-proposals.lib.ts` (new — pure functions for vintage detection + move-plan construction, importable from both script and tests), `docs/mcp-vertex/proposals/legacy/closed/README.md` (extend — document the reaper invocation, default thresholds, `--apply` opt-in).
- **Gate**: type + verify
- **Acceptance**:
  - `bun run lint:reap-legacy-proposals` (or `bun tools/scripts/lint/reap-legacy-proposals.script.ts`) scans `docs/mcp-vertex/proposals/done/<kind>/`, identifies proposals whose `shipped-in:` frontmatter is older than `--older-than=30d` (default) or whose `date:` is older than `--older-than=60d` when `shipped-in:` is missing, and prints a one-line-per-proposal report: `<id>: <kind>=<done/<kind>/<file>> age=<N>d since=<shipped-in|date> → legacy/closed/<kind>/<file>`.
  - The reaper **excludes** proposals whose `archived-on:` frontmatter is set (already archived, would be a no-op) and proposals whose status is not `done` (defence in depth — `done/` should only contain `done`, but the reaper does not crash on a stray `ready/`-in-`done/` file, it just skips it).
  - Dry-run (`bun run lint:reap-legacy-proposals`) returns exit code 0 when proposals are found (it is informational, not a gate). With `--apply`, it performs `git mv` for each match and writes `archived-on: <today>` to the moved file's frontmatter. The order is lexicographic by id so two parallel reapers do not race.
  - The lib (`reap-legacy-proposals.lib.ts`) exports `detectVintageProposals(rootDir, thresholdDays, fallbackThresholdDays): ReadonlyArray<IVintageProposal>` and `planMove(vintage: IVintageProposal): IMovePlan` so unit tests can cover the pure-function half without touching the filesystem.
  - When `--older-than` is set to a non-numeric string (e.g. `foo`), the script exits 1 with a clear error; when no proposals are found, it prints `✓ reap-legacy-proposals: 0 proposals to archive` and exits 0.
  - The script's behaviour under `git mv` failure (e.g. dirty tree, mid-rebase) is to print the failed id and continue with the next one; the exit code is the count of failures.

### S3 — `closed-frozen-guard.script.ts` (CI lint that enforces the freeze)

- **Status**: done
- **Files**: `tools/scripts/lint/closed-frozen-guard.script.ts` (new — the freeze guard), `tools/scripts/lint/closed-frozen-guard.script.spec.ts` (new — covers: drift detection, mtime drift, status drift, slice drift, missing `archived-on:`), `tools/scripts/lint/lib/closed-frozen-guard.lib.ts` (new — pure `findFrozenDrift(rootDir): ReadonlyArray<IFrozenDrift>`), `plugins/proposals/src/lib/services/proposal-slice-completeness.ts` or the script that consumes it (extend to **skip** `legacy/closed/` — proposals there are frozen by definition, no slice-status or files-existence check applies).
- **Gate**: type + verify
- **Acceptance**:
  - `bun run lint:closed-frozen-guard` walks `docs/mcp-vertex/proposals/legacy/closed/<kind>/`, parses each file's frontmatter, and reports one of:
    - `[missing-archived-on]` — `archived-on:` not set (file moved manually without the field).
    - `[status-drift]` — `status:` is no longer `done` (someone edited the frontmatter).
    - `[mtime-drift]` — file mtime is newer than `archived-on:` + 1 minute (someone edited the body).
    - `[slice-drift]` — any `### S<n>` has a `**Status**:` that changed since archival (compare against the value recorded at `archived-on:` time, recorded in a sidecar `.archive-snapshot.json` next to the file).
  - The slice-completeness lint (a00074 / `proposal-slice-completeness.script.ts`) **skips** `legacy/closed/` proposals — they are exempt by location.
  - When zero drift is detected, the script prints `✓ closed-frozen-guard: 0 drift in legacy/closed/` and exits 0.
  - When drift is detected, each line prints the proposal id, the drift code, and a one-line fix instruction. The script exits 1.
  - The pure-function lib covers all four drift kinds with synthetic markdown inputs (no fs fixture needed) so the test suite runs in <100ms.

### S4 — Wiring: validate gates, registry sync, doc updates

- **Status**: done
- **Files**: `package.json` (`scripts` block — add `lint:reap-legacy-proposals`, `lint:closed-frozen-guard`, and wire both into the `validate` script), `package.json` (`scripts` block — also add `archive:proposals:reap` (alias for `--apply`) and `archive:proposals:status` (count of proposals in `legacy/closed/`)), `docs/mcp-vertex/proposals/legacy/closed/README.md` (final form — references the four slices, the reaper command, and the guard command), `docs/mcp-vertex/AGENT-BOOTSTRAP.md` (add a one-paragraph note in §proposals mentioning `legacy/closed/` and the archive reaper), `plugins/proposals/README.md` (add a short subsection under "Workflow" pointing at the archive folder), `plugins/proposals/src/lib/proposals/sync-proposal-registry.ts` (final form — the scanner block that adds `legacy/closed/<kind>/` is reviewed and idiomatic, the `archived: true` flag is plumbed all the way to the JSON output).
- **Gate**: type + verify + docs
- **Acceptance**:
  - `bun run validate` runs the two new lints in its script chain. Both pass on a clean tree. Manually introducing one drift (e.g. editing a file in `legacy/closed/`) makes `bun run validate` fail with a `[status-drift]` line.
  - `bun run archive:proposals:status` prints a count by kind: `legacy/closed/feats: 0, legacy/closed/audits: 0, …` so the operator can see archive size without opening folders.
  - `bun run archive:proposals:reap` (alias for `reap-legacy-proposals.script.ts --apply`) moves the same set the dry-run identified. After running, `git log --follow docs/mcp-vertex/proposals/legacy/closed/feats/f00001-...md` shows the move commit (because we used `git mv`, the history follows).
  - `AGENTS.md` and `plugins/proposals/README.md` mention the archive in one paragraph each — no full section, just enough that an agent landing cold knows the folder exists.
  - All slices from S1-S3 ship with tests green: 12 new tests for the reaper lib, 8 new tests for the frozen-guard lib, plus 4 new tests on the registry scanner's `archived: true` flag.

## Acceptance

All acceptance criteria are documented per-slice above (S1–S4). The proposal is accepted when `bun run validate` passes with zero errors from the new `lint:reap-legacy-proposals` and `lint:closed-frozen-guard` gates, and the registry includes `legacy/closed/` entries with `archived: true`.

## Notes

### Why a slice set of four

Each slice is a **vertically-shipping unit**:

- S1 makes the folder **legible** to the rest of the system (the registry scanner must see it, the index must include it).
- S2 makes reaping **possible** (the lint that decides who is eligible and the `--apply` move).
- S3 makes reaping **safe** (the freeze guard so a future agent cannot quietly mutate an archived proposal).
- S4 makes the whole thing **operable** (`bun run archive:...`, `bun run lint:...`, `bun run validate` all wired).

Splitting S4 from S1-S3 matters because **S4 touches only docs and `package.json`** — it can land in a separate PR if S1-S3 take longer than expected, and the mechanism is still useful in the interim via `bun tools/scripts/lint/reap-legacy-proposals.script.ts` direct invocation.

### Why not a `closed` DFA status (an explicit non-decision)

The obvious alternative — adding `closed` to `IProposalStatus` and a `closed` folder alongside `done/` — was considered and rejected for four reasons:

1. **DFA surface blow-up.** `proposal_transition`, `proposal_force_transition`, `proposal_review`, `auto_work`, `proposal_diagnose`, `state_repair`, `proposal_create` all branch on the status enum. Adding `closed` touches every one of them.
2. **Peer-review transitions for archive are meaningless.** An archive is "this proposal will not be reviewed again" — there is no review loop to model. Adding `closed → done` (un-archive) and `done → closed` (re-close) is a synthetic transition that no real workflow uses.
3. **Slice-status rules need redefinition.** Today every `### S<n>` must be `done` for a proposal to ship; an archived proposal's slices are not "done in the active sense", they are "done and frozen". Modeling that requires a new slice status (`archived`?) which cascades again.
4. **The user said "carpeta", not "estado".** "quizas deberiamos tener una carpeta closed en la carpeta legacy" — the user described a folder layout, not a status. Following the literal request keeps the change minimal.

`legacy/closed/` is a folder. `done/` stays the canonical home for active-done proposals. The reaper moves files between them under operator control.

### Files (consolidated for `proposal-completeness` gate)

S1: `docs/mcp-vertex/proposals/legacy/closed/.gitkeep` (new), `docs/mcp-vertex/proposals/legacy/closed/README.md` (new), `plugins/proposals/src/lib/proposals/sync-proposal-registry.ts` (modify scanner to include `legacy/closed/<kind>/` and tag entries `archived: true`), `plugins/proposals/src/lib/contracts/constants/proposal-glossary.constant.ts` (export `PROPOSAL_ARCHIVE_FOLDER`), `plugins/proposals/src/lib/contracts/schemas/proposal-entry.schema.ts` (add `archived?: boolean`).

S2: `tools/scripts/lint/reap-legacy-proposals.script.ts` (new), `tools/scripts/lint/reap-legacy-proposals.script.spec.ts` (new), `tools/scripts/lint/lib/reap-legacy-proposals.lib.ts` (new), `docs/mcp-vertex/proposals/legacy/closed/README.md` (extend).

S3: `tools/scripts/lint/closed-frozen-guard.script.ts` (new), `tools/scripts/lint/closed-frozen-guard.script.spec.ts` (new), `tools/scripts/lint/lib/closed-frozen-guard.lib.ts` (new), `tools/scripts/lint/proposal-slice-completeness.script.ts` (modify to skip `legacy/closed/`).

S4: `package.json` (add scripts + wire into `validate`), `docs/mcp-vertex/proposals/legacy/closed/README.md` (final), `docs/mcp-vertex/AGENT-BOOTSTRAP.md` (one-paragraph note), `plugins/proposals/README.md` (one-paragraph note), `plugins/proposals/src/lib/proposals/sync-proposal-registry.ts` (final review).