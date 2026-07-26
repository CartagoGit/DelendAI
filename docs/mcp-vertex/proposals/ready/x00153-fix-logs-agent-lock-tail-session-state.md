---
id: x00153
kind: fix
title: Fix logs tail/readRange O(n) reads, session.imbalance persistence, corrupt-line timestamp, and proposal-cites-nonexistent-commit drift
status: ready
date: 2026-07-26T14:00:00Z
track: logs+proposals
date_iso: 2026-07-26
projects: []
shipped-in: []
---

# x00153 — Fix logs/agent-lock/tail/session-state drift

## goal

Six bugs in the logs plugin (`tail`/`readRange` cost; corrupt-line timestamp) and the proposals lock engine (process-local `session.imbalance`, cross-process release), plus a missing lint that audits commits cited by `done/` proposals, all discovered during a 2026-07-26 afternoon session that scanned `.cache/mcp-vertex/results/logs/*.jsonl` while diagnosing why the user's plugins were not behaving like their own docs describe.

Two typecheck regressions already fixed in the same session (see `notes`).

## why

The user's message — "los plugins y el mcpvertex funcione como deberia si las instrucciones del plugin dice que no hay worktrees porque se hacen? algo no funciona ahi como deberia, analiza los logs de mcp-vertex para encontrar bugs" — asks for a log-driven audit and a fix plan. The bugs found:

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

`plugins/logs/src/lib/services/log-store.ts:90`:

```ts
events.push({
  ts: new Date().toISOString(),  // <-- not the line's ts
  ...
  summary: 'Skipped corrupt log line',
});
```

When a line is unparseable (truncated write, race, etc.) the placeholder uses "now", which:
- pushes the placeholder to the present in any time-ordered query
- destroys the actual position of the corruption in the timeline
- makes the placeholder indistinguishable from a fresh event of the same shape

The corrupt-line file should carry `ts` from the filename (the day it belongs to) plus an offset marker, or simply the day boundary.

### Bug 4 — 17 commits cited by `done/` proposals do not exist in git

`docs/mcp-vertex/proposals/done/**/*.md` cites backticked hashes. A grep + `git log` cross-check found 17 references in 11 proposals pointing to commits that are not in the repo. Examples:

- `docs/mcp-vertex/proposals/done/feats/f00049-...md`: cites `3fbb19bd`, `ac33a462`, `be6a505c`, `f14456a8` — none exist
- `docs/mcp-vertex/proposals/done/audits/a00074-...md` claims S2 commit `a6c2b80d` and S4 work; the work is on disk but neither commit exists
- `docs/mcp-vertex/proposals/done/audits/a00069-...md`: cites `546a89a4`, `8199bd1d`
- `docs/mcp-vertex/proposals/done/audits/a00070-...md`, `a00071-...md`: cite `048f88a7` (which IS the `main` HEAD, not the cited branch), `4710d2a4...`

The `proposal-files-exist` lint only validates file paths, never the cited commit hashes. The `a00074 S1` shipped-in: gate (commit `285e544b`) prevented this for *future* proposals, but the historical back-citations were never audited.

### Bug 5 — `agent_lock release` returns `"released": false` after a session restart

The lock file is durable but the `in_flight` entries have no caller-host check beyond `(agent, task_id)`. After a host restart, the new PID's `vscode-copilot-m3` agent tries to release a claim owned by a dead process's `vscode-copilot-m3` agent — the lock file matches by name, but `removeClaim` skips because `ownershipCount` is wrong. The `release` call returns `removed: 0, released: false` and silently drops. The `notification plugin`'s `await_lock` then hangs.

## non-goals

- **Backfilling missing commits for the 17 historical orphan hashes** — that is a separate per-proposal amend slice that requires a human to decide each one (some orphans were real work that was rebased away; some are typos; some are references to private forks). This proposal only surfaces them.
- **`mcp-vertex.config.json#agentWorktree` enforcement in `git checkout -b`** — the gate is documented as MCP-only; protecting against shell `git checkout -b agent/...` requires a server-side pre-receive hook or a wrapper, which is a bigger lift and belongs in its own proposal.
- **Re-running the 30+ peer-review entries from 2026-07-26T02:29-02:49 that share host+pid** — those were the events a00074 S2 is designed to prevent. S2 is referenced from this proposal as already-shipped (in the same release); no need to redo the historical rejections.
- **Moving the in-progress a00074 S2/S3/S4 work** — those files (`review.tool.ts`, `auto-transition.ts`, `proposal-folder-drift.script.ts`, `mass-content-removal.script.ts`) belong to a00074, not x00153. They are dirty on disk and their fate is the user's call.

## slices

### S1 — Persistent session.imbalance (claims/releases) across MCP-server restarts

- **Status**: done
- **Files**: `plugins/proposals/src/lib/locks/agent-lock-engine.ts`, `plugins/proposals/src/lib/locks/agent-lock-session-store.ts` (new), `plugins/proposals/src/lib/tools/state-tools.tool.ts`, `plugins/proposals/tests/src/lib/locks/agent-lock-session-store.spec.ts` (new), `plugins/proposals/tests/src/lib/locks/agent-lock-engine.spec.ts` (additions)
- **Gate**: type + bun run validate
- **Implementation**: successful claim/release calls now append durable JSONL entries under `.cache/mcp-vertex/agents.lock.session.jsonl`, and both `agent_lock` payloads and `state_health` derive the session balance from that persisted history. The new store ignores corrupt lines, tolerates missing files, and serializes concurrent writers through `withFileMutex`.
- **acceptance**:
  - "agent_lock session.balance is read from .cache/mcp-vertex/agents.lock.session.jsonl on every call so the counter survives MCP-server restarts"
  - "session.jsonl line shape: `{ ts, agent, action: 'claim'|'release', ok: boolean }`; one append per lock call"
  - "state_health.sessionImbalance aggregates the whole session.jsonl, not just process-local"
  - "Tests: 4 (append on claim/release; survive restart; imbalance reflects full history; concurrent writers serialised via withFileMutex)"

### S2 — Logs tail/readRange: read newest-N first instead of all-N

- **Status**: pending
- **Files**: `plugins/logs/src/lib/services/log-store.ts`, `plugins/logs/tests/log-store.spec.ts` (additions)
- **Gate**: type + bun run validate
- **acceptance**:
  - "readRange with `since` filter only opens day-files at or after `since`'s day boundary (skip earlier files by name, not by line scan)"
  - "tail with `limit: N` reads only the active day-file + at most one previous day-file when N exceeds the active file's line count, never all retained files"
  - "When outcomeFilter / kindFilter / since are present, candidate files are pre-filtered by day-boundary before opening"
  - "Tests: 5 (limit-only uses one file; since crosses day boundary; outcome filter skips empty-day files; kind filter; empty-store no-op)"

### S3 — Corrupt-line placeholder carries the day it belongs to, not `now`

- **Status**: pending
- **Files**: `plugins/logs/src/lib/services/log-store.ts`, `plugins/logs/tests/log-store.spec.ts` (additions)
- **Gate**: type + bun run validate
- **acceptance**:
  - "When a line in `<day>.jsonl` is unparseable, the placeholder event uses `ts: <day>T00:00:00.000Z` plus a `summary: 'Skipped corrupt line in <day>.jsonl (offset N)'` so the day position is preserved"
  - "The placeholder's `meta.file` and `meta.offset` are stable across re-reads (no `Date.now()` drift)"
  - "Tests: 2 (placeholder ts is the day boundary, not now; meta includes line offset)"

### S4 — Lint that audits commits cited by `done/*` proposals

- **Status**: pending
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

## risks and mitigations

- **S1 storage growth**: `agents.lock.session.jsonl` is append-only. Today the file is regenerated each restart, so worst-case 20 lines/day/process. Adding a 30-day retention hook on the cache-eviction registry keeps it bounded.
- **S2 read direction**: pre-filtering by day-name requires sorted filenames. The current `readdir().sort()` already produces lexical sort which equals date sort for `YYYY-MM-DD.jsonl`. Verified.
- **S4 baseline drift**: anyone can update the baseline. The lint records orphans but does not auto-amend. This is by design — orphan resolution is a per-proposal decision.

## acceptance

- `bun run typecheck` is green.
- `bun run test` is green for `plugins/proposals` and `plugins/logs`.
- `bun tools/scripts/lint/proposal-cited-commits.script.ts` produces no FATAL output against the current baseline.
- `bun run validate` passes.

## notes

### Already-fixed-during-this-session (t0)

While investigating I found two typecheck regressions caused by in-progress a00074 S1/S2/S3/S4 changes that had been left dirty on disk (see `git status -s` for the uncommitted a00074 work):

1. `plugins/proposals/src/lib/tools/proposal-transition.tool.ts` had a duplicated `export interface IValidateEvidence` and was missing the `import type IValidateEvidence` from `'../services/transition-evidence'`. **Fixed by deleting the duplicate + adding the import** (`bun run typecheck` now green for `plugins/proposals`).
2. `tools/scripts/lint/mass-content-removal.script.ts:117` had `threshold: input.threshold` failing `exactOptionalPropertyTypes`. **Fixed with conditional spread** (`...(input.threshold !== undefined ? { threshold: input.threshold } : {})`).

1028/1028 proposal tests still pass; global typecheck still green.

### Slice status table

| Slice | Status | Notes |
|---|---|---|
| t0 — typecheck fixes (already applied) | done | `proposal-transition.tool.ts` + `mass-content-removal.script.ts` |
| S1 — persistent session.imbalance | pending | |
| S2 — tail/readRange day-file pre-filter | pending | |
| S3 — corrupt-line day-boundary ts | pending | |
| S4 — proposal-cited-commits lint | pending | baseline needed before validating |
| S5 — agent_lock cross-process release | pending | depends on a00074 S2 (host+pid in entry) already shipped |