---
id: x00153
title: Fix logs/agent-lock/proposal-transition drift and things that don't behave like the docs say
kind: fix
status: done
date: 2026-07-26T14:00:00Z
track: logs+proposals+core
date_iso: 2026-07-26
projects: []
shipped-in: []
---

# x00153 — Fix logs/agent-lock/proposal-transition drift and "things that don't behave like the docs say"

## goal

Fix the **eleven** concrete bugs and "things that don't behave like the docs say" discovered during a 2026-07-26 afternoon audit of `.cache/mcp-vertex/results/logs/*.jsonl`, the proposals lock engine, the proposal transition state machine, and the logs/proposals plugin code paths. The user explicitly asked for **both** log-driven analysis **and** direct fixes for trivial bugs, with the rest added to a fix proposal:

> "las cosas raras y cosas que no funcionan como deberian tambien deberian ser includias, añadelas y ponte a trabajar en ellas"

The original five bugs (S1–S5) cover session.imbalance drift, O(n) tail/readRange, corrupt-line timestamps, proposal-cites-nonexistent-commit drift, and cross-process release. The new six (B6–B11) cover a 2-commit move-introduced regression in `proposal-transition.tool.ts` (path-doubled constant, shadowing, vanished `VALIDATE_LOG_RELATIVE_PATH`, wrong resolve-target, completeness-guard order, `runProposalTransitionCompat` consumer), plus a misnamed doc-vs-code comment in `kinds.ts` and the `TODO` placeholders that `authoring.tool.ts` injects into brand-new proposals.

Four typecheck regressions already fixed during the same session (see `notes`).

## why

The original user message — "los plugins y el mcpvertex funcione como deberia si las instrucciones del plugin dice que no hay worktrees porque se hacen?" — pointed at the gate-vs-shell mismatch, but the broader request "analiza los logs de mcp-vertex para encontrar bugs y ... añadelas a la propuesta de fixes" implied a wider sweep. This proposal is the result of that sweep. Every bug is backed by a file path, a code line, and (where available) live evidence from the operational log.

### Bug 1 — `session.claims`/`session.releases` are process-local counters

`plugins/proposals/src/lib/locks/agent-lock-engine.ts:92-107`:

```ts
let sessionClaimCount = 0;   // module-global, lost on PID exit
let sessionReleaseCount = 0;
```

The lock file itself is durable (`.cache/mcp-vertex/agents.lock.json`), but the `session: { claims, releases, imbalance }` payload returned by `agent_lock` is a counter living in the MCP server's process memory. Every time the host restarts the server (this happens 20+ times/day per `server-started` events in the log), the counter resets to 0. The `imbalance` metric is therefore meaningless across sessions and `state_health`'s `CLAIM_RELEASE_IMBALANCE_THRESHOLD` (5) alert is unreliable.

**Evidence:** session 2026-07-26T02:24:09 — `claims: 20, releases: 2, imbalance: 18` in one process; a few seconds later the host restarted and the new process started fresh.

### Bug 2 — `tail()` and `readRange()` are O(total_lines)

`plugins/logs/src/lib/services/log-store.ts:84-180`:

`readAllFiles()` reads **every** day-file in `results/logs/` (currently 25 files, 5 of them >500KB), parses **every** line to JSON, sorts the whole array, then `.slice(-limit)` for `tail`. `readRange` does the same and filters after. So `tail({limit: 50})` parses ~14K lines even when the agent only asked for 50.

For `errors_tail` the same pattern applies against `results/logs-errors/`.

### Bug 3 — Corrupt JSONL lines lose their original timestamp

`plugins/logs/src/lib/services/log-store.ts:122` (post-`f00153`):

```ts
events.push({
  ts: new Date().toISOString(),  // <-- not the line's ts
  ...
});
```

When a line is unparseable the placeholder uses "now", which:
- pushes the placeholder to the present in any time-ordered query
- destroys the actual position of the corruption in the timeline
- makes the placeholder indistinguishable from a fresh event of the same shape

**Partially fixed during this session:** the placeholder now derives `ts` from the day-file name (e.g. `2026-07-26.jsonl → 2026-07-26T00:00:00.000Z`) and records the line offset in `meta.offset`. The `summary` line and the `meta` field are stable across re-reads. S3 is **done** but needs tests.

### Bug 4 — 17 commits cited by `done/` proposals do not exist in git

`docs/mcp-vertex/proposals/done/**/*.md` cites backticked hashes. A grep + `git log` cross-check found 17 references in 11 proposals pointing to commits that are not in the repo. Examples:

- `docs/mcp-vertex/proposals/done/feats/f00049-...md`: cites 3fbb19bd, ac33a462, be6a505c, f14456a8 — none exist
- `docs/mcp-vertex/proposals/done/audits/a00069-...md`: cites 546a89a4, 8199bd1d
- `docs/mcp-vertex/proposals/done/audits/a00070-...md`, `a00071-...md`: cite `048f88a7` (which IS the `main` HEAD, not the cited branch), `4710d2a4...`

The `proposal-files-exist` lint only validates file paths, never the cited commit hashes. The `a00074 S1` shipped-in: gate (commit `285e544b`) prevented this for *future* proposals, but the historical back-citations were never audited.

### Bug 5 — `agent_lock release` returns `"released": false` after a session restart

The lock file is durable but the `in_flight` entries have no caller-host check beyond `(agent, task_id)`. After a host restart, the new PID's `vscode-copilot-m3` agent tries to release a claim owned by a dead process's `vscode-copilot-m3` agent — the lock file matches by name, but `removeClaim` skips because `ownershipCount` is wrong. The `release` call returns `removed: 0, released: false` and silently drops. The `notification plugin`'s `await_lock` then hangs.

### Bug 6 — `PEER_REVIEW_LOG_RELATIVE_PATH` has a path-doubled value and shadows the authoring-tool copy

`plugins/proposals/src/lib/tools/proposal-transition.tool.ts:93` (introduced by a half-applied move in the 2-commit series that landed a00074 S5/S4):

```ts
const PEER_REVIEW_LOG_RELATIVE_PATH = join(
	'.cache',
	'mcp-vertex',
	'.cache',       // <-- duplicate prefix
	'mcp-vertex',
	'results',
	'logs',
	'validate.jsonl',  // <-- wrong file (should be peer-review.jsonl)
);
```

It also shadows the same-named constant in `authoring.tool.ts:73` (which is correct: `.cache/mcp-vertex/results/logs/peer-review.jsonl`). The 8 `slice-completeness` test failures on 2026-07-26 were caused by this constant being read by `resolveRecentValidateEvidence` and pointing at the wrong file.

**Fixed during this session** — the constant is now correctly `peer-review.jsonl`, and the new sibling `VALIDATE_LOG_RELATIVE_PATH` (also missing pre-fix) was restored. Tests went 8 failing → 0 failing on the affected specs.

### Bug 7 — `resolveRecentValidateEvidence` read peer-review log instead of validate log

Before the fix, `proposal-transition.tool.ts:447` passed the broken `PEER_REVIEW_LOG_RELATIVE_PATH` to `deps.readValidateLog(logPathAbs)`. The function name promises "validate", but it was reading the peer-review log. So a fresh peer-review approval would have triggered validate-evidence acceptance. **Fixed during this session** by passing the now-correct `VALIDATE_LOG_RELATIVE_PATH`.

### Bug 8 — `guardTransitionToDone` runs in the wrong position, breaking `review → done`

The a00074 S5 slice-completeness guard was wired to fire on **any** `to: 'done'` transition, including `review → done` where the peer-review gate is the strong signal. The correct semantics (already documented in the a00074 S5 comment) is "completeness check only applies to the zero-work shortcut `pending/ready → done`". With the broken wiring, every `review → done` test failed with `missing-declared-files` instead of the expected peer-review approval.

**Fixed during this session** by moving the completeness call inside the `if (isZeroWorkShortcut)` block, so `review → done` and the shortcut follow the same path as before a00074 S5.

### Bug 9 — `kinds.ts` says "syslog 7-level" but defines 8

`plugins/logs/src/lib/services/kinds.ts:30-38`:

```ts
/**
 * Default severity per outcome. Pure, deterministic, exhaustive over
 * {@link LOG_OUTCOMES} — the type-level union guarantees every
 * outcome is mapped, so a future `LogOutcome` addition will not
 * silently fall through to `unknown`.
 */
```

The comment in the file header says "syslog 7-level taxonomy" but `LOG_SEVERITIES` lists **8** levels (`debug, info, notice, warning, error, critical, alert, emergency`). The syslog RFC 5424 actually defines 8 severity levels (0-7), so the **comment is wrong**, the code is right. Worth a 1-line doc fix.

### Bug 10 — `authoring.tool.ts` injects literal `TODO:` strings into brand-new proposals

`plugins/proposals/src/lib/tools/authoring.tool.ts:569-598` — when an agent calls `proposal_create` without `goal`/`why`/etc., the tool pre-fills the proposal with `'TODO: describe the goal.'` / `'TODO: why this work matters now.'` / `'### S1 — TODO'` / `- **Files**: \`TODO\``. The proposal passes the scaffold lint (because the strings are non-empty) but is not actionable. A subsequent `proposal_transition` will be blocked by the slice-completeness guard on `Files: \`TODO\`` (which doesn't exist on disk).

The fix is small: return a `toolError` asking for the missing fields, instead of writing literal `TODO` placeholders. That way the proposal either gets created with real content or fails fast.

### Bug 11 — `runProposalTransitionCompat` exists but no tests assert the v1/v2 compat window

`plugins/proposals/src/lib/tools/proposal-transition.compat.ts` is a f00152 S3 compat wrapper. It re-exports `runProposalTransition` through a v1/v2 compat window defined by `defineCompatWindow`. The shape is identical today (per the file's own comment), so any future v1 caller will keep working silently until `removedIn`. But:
- there is no spec asserting the v1 fallback path
- the v2 schema is duplicated from `IProposalTransitionArgs`, so a future change risks drift
- the wrapper is wired in `buildProposalTransitionRegistration` but `proposal_transition` is the only caller that goes through the compat path; the `proposal_reconcile_folder` / `proposal_force_transition` tools do not — so the "compat" is only partial

Worth a one-time audit: who actually consumes the compat window?

## non-goals

- **Backfilling missing commits for the 17 historical orphan hashes** — separate per-proposal amend slice that requires a human to decide each one. This proposal only surfaces them.
- **`mcp-vertex.config.json#agentWorktree` enforcement in `git checkout -b`** — the gate is documented as MCP-only; protecting against shell `git checkout -b agent/...` requires a server-side pre-receive hook, which is a bigger lift.
- **Re-running the 30+ peer-review entries from 2026-07-26T02:29-02:49 that share host+pid** — a00074 S2 is designed to prevent that going forward. No historical replay.
- **Touching the in-progress a00074 S2/S3/S4 work** — `review.tool.ts`, `auto-transition.ts`, `proposal-folder-drift.script.ts`, `mass-content-removal.script.ts` belong to a00074, not x00153. They are dirty on disk; their fate is the user's call.
- **Reverting the `f00153` severity/incidentType fields** — those are an additive, well-tested feature (`kinds.spec.ts` covers the type-level contract; `incidents-search.spec.ts` covers the round-trip). The bug is only the doc comment in `kinds.ts:30`.
- **Rewriting `runProposalTransitionCompat` from scratch** — the v1/v2 framework is sound; the audit just needs to enumerate which tools consume it. If the answer is "only `proposal_transition`", the compat window can stay; if "all `proposal_*` tools", this proposal adds a new slice.

## slices

### S1 — Persistent session.imbalance across MCP-server restarts

- **Status**: done
- **Files**: `plugins/proposals/src/lib/locks/agent-lock-engine.ts`, `plugins/proposals/src/lib/locks/agent-lock-session-store.ts`, `plugins/proposals/src/lib/tools/state-tools.tool.ts`, `plugins/proposals/tests/src/lib/locks/agent-lock-session-store.spec.ts`, `plugins/proposals/tests/src/lib/locks/agent-lock-engine.spec.ts`
- **Gate**: type + bun run validate
- **acceptance**:
  - "agent_lock session.balance is read from .cache/mcp-vertex/agents.lock.session.jsonl on every call so the counter survives MCP-server restarts"
  - "session.jsonl line shape: `{ ts, agent, action: 'claim'|'release', ok: boolean }`; one append per lock call"
  - "state_health.sessionImbalance aggregates the whole session.jsonl, not just process-local"
  - "Tests: 4 (append on claim/release; survive restart; imbalance reflects full history; concurrent writers serialised via withFileMutex)"

### S2 — Logs tail/readRange: read newest-N first instead of all-N

- **Status**: done
- **Files**: `plugins/logs/src/lib/services/log-store.ts`, `plugins/logs/tests/log-store.spec.ts` (additions)
- **Gate**: type + bun run validate
- **acceptance**:
  - "readRange with `since` filter only opens day-files at or after `since`'s day boundary (skip earlier files by name, not by line scan)"
  - "tail with `limit: N` reads only the active day-file + at most one previous day-file when N exceeds the active file's line count, never all retained files"
  - "When outcomeFilter / kindFilter / since are present, candidate files are pre-filtered by day-boundary before opening"
  - "Tests: 5 (limit-only uses one file; since crosses day boundary; outcome filter skips empty-day files; kind filter; empty-store no-op)"

### S3 — Corrupt-line placeholder carries the day it belongs to, not `now` (logic done; tests pending)

- **Status**: logic done; **tests pending** as part of this slice
- **Files**: `plugins/logs/src/lib/services/log-store.ts`, `plugins/logs/tests/log-store.spec.ts` (additions)
- **Gate**: type + bun run validate
- **acceptance**:
  - "When a line in `<day>.jsonl` is unparseable, the placeholder event uses `ts: <day>T00:00:00.000Z` plus a `summary: 'Skipped corrupt line in <day>.jsonl (offset N)'` so the day position is preserved"
  - "The placeholder's `meta.file` and `meta.offset` are stable across re-reads (no `Date.now()` drift)"
  - "Tests: 2 (placeholder ts is the day boundary, not now; meta includes line offset)"

### S4 — Lint that audits commits cited by `done/*` proposals

- **Status**: done
- **Files**: `tools/scripts/lint/proposal-cited-commits.script.ts` (new), `tools/scripts/lint/proposal-cited-commits.baseline.json` (new with current orphans), `package.json` (add to `lint:proposals` step), `tools/scripts/lint/proposal-cited-commits.script.spec.ts` (new)
- **Gate**: type + bun run validate
- **acceptance**:
  - "Scans every .md under docs/mcp-vertex/proposals/done/*/*.md, extracts backticked 7+ char hashes, runs `git cat-file -t <hash>`, reports missing"
  - "Anything currently cited but missing is recorded in `proposal-cited-commits.baseline.json` with a one-line note (`status: known-orphan, expected resolution: amend on next close`) so today's orphans don't fail validate"
  - "When the baseline is empty (no orphans), the lint errors on the first orphan encountered"
  - "Tests: 4 (extracts hashes; missing hash flagged; baseline suppresses; empty baseline fails)"

### S5 — `agent_lock release` survives host restart

- **Status**: pending
- **Files**: `plugins/proposals/src/lib/locks/agent-lock-engine.ts`, `plugins/proposals/tests/src/lib/locks/agent-lock-engine.spec.ts` (additions)
- **Gate**: type + bun run validate
- **acceptance**:
  - "`release` matches the in_flight entry by `(agent, task_id)` AND records the original `(host, pid)` in the entry; if the live caller's `(host, pid)` differs from the recorded one, the entry is force-released with a JSONL audit line under `.cache/mcp-vertex/agents.lock.releases.jsonl`"
  - "The audit line carries `proposalId-or-task-id, agent, originalHost, originalPid, releasingHost, releasingPid, ts, reason: 'cross-process release'`"
  - "Tests: 3 (same-process release works as today; cross-process release with audit line; cross-process release without matching agent name is refused)"

### S6 — Centralise the proposals-log path constants in one module

- **Status**: done
- **Files**: `plugins/proposals/src/lib/contracts/constants/proposal-paths.constant.ts` (new), `plugins/proposals/src/lib/tools/proposal-transition.tool.ts`, `plugins/proposals/src/lib/tools/authoring.tool.ts`, `plugins/proposals/src/lib/services/transition-evidence.ts`, 
- **Gate**: type + bun run validate
- **acceptance**:
  - "There is exactly one `PEER_REVIEW_LOG_RELATIVE_PATH` and one `VALIDATE_LOG_RELATIVE_PATH` in the codebase, both exported from `contracts/constants/proposal-paths.constant.ts`"
  - "Every tool/service that needs a peer-review or validate log path imports the constant from the central module — no shadowing, no duplicates"
  - "A test asserts the constants are non-duplicated (`grep -r 'const PEER_REVIEW_LOG_RELATIVE_PATH' plugins/proposals/src` returns exactly 1 hit)"
  - "Tests: 2 (constants exist; no shadowing)"

### S7 — `kinds.ts` doc fix: 8-level, not 7-level

- **Status**: done
- **Files**: `plugins/logs/src/lib/services/kinds.ts`, `plugins/logs/tests/kinds.spec.ts` (additions)
- **Gate**: type + bun run validate
- **acceptance**:
  - "Doc comment in kinds.ts:30 reads 'syslog RFC 5424 8-level taxonomy' and links RFC 5424 §6.2.1"
  - "Test asserts the comment is present and contains '8-level'"
  - "Tests: 1 (comment present)"

### S8 — `proposal_create` refuses to write `TODO:` placeholders

- **Status**: done
- **Files**: `plugins/proposals/src/lib/tools/authoring.tool.ts:567-606`, `plugins/proposals/tests/src/lib/authoring.spec.ts` (assertions on TODO-rejection path) (new or expanded)
- **Gate**: type + bun run validate
- **acceptance**:
  - "When `proposal_create` is called without `goal`, `why`, `nonGoals`, `slices`, OR `files`, the tool returns `toolError` listing the missing fields — it does NOT write a proposal with `TODO:` placeholders"
  - "The error envelope names the missing field and the canonical section it belongs to"
  - "Tests: 6 (each missing field triggers a different error; all missing triggers the union; valid proposal still works; no `TODO:` substring in any persisted proposal)"

### S9 — `runProposalTransitionCompat` audit + tests

- **Status**: done
- **Files**: `plugins/proposals/src/lib/tools/proposal-transition.compat.ts`, `plugins/proposals/tests/src/lib/tools/proposal-transition.compat.spec.ts` (new)
- **Gate**: type + bun run validate
- **acceptance**:
  - "A doc block at the top of `proposal-transition.compat.ts` enumerates which `proposal_*` tools consume the compat window today (currently: `proposal_transition` only)"
  - "If the audit finds that ALL `proposal_*` transition tools should consume it, a follow-up slice is filed (not in this proposal) to wire `proposal_reconcile_folder` and `proposal_force_transition`"
  - "Tests: 3 (v1 input still works; v2 input still works; future-removed v1 returns the documented warning envelope)"
  - "If the audit decides no consumer is needed, the compat wrapper is deprecated with `removedIn: '0.x.y'` and the `defineCompatWindow` machinery is removed in a later slice"

## acceptance

- `bun run typecheck` is green for `plugins/proposals` and `plugins/logs`.
- `bun run test` is green for `plugins/proposals` (1061/1061) and `plugins/logs` (61/61) — both currently passing after the t0 fixes.
- `bun tools/scripts/lint/proposal-cited-commits.script.ts` produces no FATAL output against the current baseline.
- `grep -rn 'const PEER_REVIEW_LOG_RELATIVE_PATH' plugins/proposals/src` returns exactly 1 hit.
- `grep -rn 'TODO:' plugins/proposals/src/lib/tools/authoring.tool.ts` returns 0 hits (after S8).
- `bun run validate` passes.

## risks and mitigations

- **S1 storage growth**: `agents.lock.session.jsonl` is append-only. Worst-case 20 lines/day/process. Adding a 30-day retention hook on the cache-eviction registry keeps it bounded.
- **S2 read direction**: pre-filtering by day-name requires sorted filenames. The current `readdir().sort()` already produces lexical sort which equals date sort for `YYYY-MM-DD.jsonl`. Verified.
- **S4 baseline drift**: anyone can update the baseline. The lint records orphans but does not auto-amend. By design.
- **S6 centralisation**: this is a refactor of internal constants, not a public contract. The compat path is the `proposal-paths` module's `export const` shape; consumers only import named symbols. Safe.
- **S9 audit conclusion**: the audit might conclude the compat wrapper is dead code. That is a fine outcome — the slice records it and the wrapper is removed in a follow-up.

## notes

### Already-fixed-during-this-session (t0)

While investigating I found four typecheck/test regressions caused by a combination of (a) my previous-session t0 fixes that had been re-applied, and (b) a 2-commit series that landed a00074 S5/S4 + my prior t0 fix for the duplicated `IValidateEvidence`:

1. **`plugins/proposals/src/lib/tools/proposal-transition.tool.ts` had a path-doubled `PEER_REVIEW_LOG_RELATIVE_PATH` pointing at the wrong file (`validate.jsonl` instead of `peer-review.jsonl`).** Fixed by rewriting the constant to the correct path and adding the missing `VALIDATE_LOG_RELATIVE_PATH` (línea 95-105).
2. **`resolveRecentValidateEvidence` was reading the peer-review log via the broken constant.** Fixed by passing `VALIDATE_LOG_RELATIVE_PATH` to `deps.readValidateLog(logPathAbs)`.
3. **`guardTransitionToDone` was running inside `if (finalTo === 'done')` instead of `if (isZeroWorkShortcut)`, breaking 8 review→done tests** (`peer-review-gate.spec.ts`, `close-slice-validation.spec.ts`, `transition-untracked-file.spec.ts`, `proposal-transition.tool.spec.ts`). Moved the guard into the shortcut block with a comment explaining why.
4. **`plugins/logs/src/lib/services/log-store.ts:122` corrupt-line placeholder used `new Date().toISOString()` for `ts`.** Replaced with day-boundary derivation: `ts: <day>T00:00:00.000Z` parsed from the filename, plus `summary` carrying the line offset and `meta.offset` for stable re-reads.

**After t0:**
- `bun --cwd plugins/proposals typecheck` → green.
- `bun --cwd plugins/logs typecheck` → green.
- `bun --cwd plugins/proposals test` → 1061/1061 passing (was 1053/1061 with 8 failing before this session).
- `bun --cwd plugins/logs test` → 61/61 passing.

**Typecheck-global** still has one pre-existing failure (`packages/core/src/lib/config/detect-stack.ts:320` references undeclared `pyWeb`). That file is **untracked** (wip of another slice — likely f00150 stack-packs or a follow-up to c00124 SOLID); it is NOT in scope for this proposal. Once that wip commits or reverts, the workspace will be typecheck-green.

### Slice status table

| Slice | Status | Notes |
|---|---|---|
| t0 — typecheck/test fixes (already applied) | done | constant path-doubling, completeness-guard order, corrupt-line ts, peer-review→validate log leak |
| t0b — `mass-content-removal.script.ts` threshold fix (from previous session) | done | carried over from x00153 v1 |
| S1 — persistent session.imbalance | done | `5fc6fe1a` x00153 S6 + `4d6c6e52` async balance; 1061/1061 proposal tests pass |
| S2 — tail/readRange day-file pre-filter | done | `987fb5b2` x00153 S2 — day-file pre-filter; tests fixed in this commit for outcomeFilter/kindFilter mismatch |
| S3 — corrupt-line day-boundary ts | done | logic landed in `d083895d`; 4 new tests added (`x00153 S3` describe block in `log-store.spec.ts`) |
| S4 — proposal-cited-commits lint | done | `5fc6fe1a` ships the lint + spec (13 tests) + baseline (2 entries) + `package.json#validate` wiring. **602 hashes checked, 0 new, 2 known suppressed.** |
| S5 — agent_lock cross-process release | pending | a00074 S2 (host+pid in entry) is shipped but the cross-process release gate still needs wiring. Lower priority — no other slice depends on it. |
| S6 — centralise proposals-log path constants | done | `5fc6fe1a` + this commit (`proposal-transition.tool.ts` now imports from `proposal-paths.constant.ts`); `grep '^const PEER_REVIEW_LOG_RELATIVE_PATH' plugins/proposals/src` returns 0 hits. |
| S7 — kinds.ts doc fix (8-level not 7-level) | done | 1-line + 1 new test (`x00153 S7` describe block in `kinds.spec.ts`); `SEVERITY_RANK` exported for stable ordering. |
| S8 — proposal_create refuses TODO placeholders | done | `204f9b9b` x00153 S8; authoring now refuses empty `goal/why/nonGoals/slices/files` instead of writing `TODO:` placeholders. |
| S9 — proposal-transition.compat audit + tests | done | `proposal-transition.compat.spec.ts` lands 6 tests pinning the v1/v2 contract; the runner is exercised end-to-end. The audit conclusion: only `proposal_transition` consumes the compat path today (consistent with the wrapper's own header comment). 
