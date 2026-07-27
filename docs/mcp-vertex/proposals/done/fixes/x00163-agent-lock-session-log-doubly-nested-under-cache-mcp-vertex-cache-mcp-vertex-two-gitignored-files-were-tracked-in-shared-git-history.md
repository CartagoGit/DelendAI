---
id: x00163
title: "agent_lock session log doubly-nested under .cache/mcp-vertex/.cache/mcp-vertex + two gitignored files were tracked in shared git history"
kind: fix
status: done
type: proposal
track: plugins/proposals+repo-hygiene+self-hosting+git
date: 2026-07-27
---

# x00163 — agent_lock session log doubly-nested under .cache/mcp-vertex/.cache/mcp-vertex + two gitignored files were tracked in shared git history

## Goal

Fix a real path-resolution bug that made the agent_lock session-balance log write to a doubly-nested, self-referential path on every real (non-test-fixture) invocation, and untrack two files whose own `.gitignore` rules say they should never be shared (a `*.local.json` settings file and a one-shot metrics snapshot) but were committed across many commits anyway.

## why

Found 2026-07-28 while investigating a user report about inconsistent MCP tool-permission strings in `.claude/settings.local.json`. That file turned out to be TRACKED in git (many commits, e.g. "feat: agregar configuracion local de Claude con permisos y modo predeterminado") despite `.gitignore` explicitly listing `.claude/settings.local.json` — the file's own name says "local", and its repeated edits by different past sessions is exactly why the tool-permission strings had drifted inconsistent (different sessions saved their own auto-approved strings using whatever naming was current at the time). A repo-wide check (`git ls-files -i --exclude-standard -c`) found a second offender: `metrics-candidate.json`, a one-shot metrics snapshot from 2026-07-14 that its own `.gitignore` rule (`/metrics-candidate.json`) says should be regenerated locally, not committed. Investigating further surfaced a live, reproducible bug: `bun tools/scripts/lint/check-stray-cache-files.script.ts` flagged an `unknown-top-level-dir: .cache` finding under this repo's own `.cache/mcp-vertex/`, which turned out to be a doubly-nested `.cache/mcp-vertex/.cache/mcp-vertex/agents.lock.session.jsonl` — the agent_lock engine's session-balance telemetry writing to `<root>/.cache/mcp-vertex/.cache/mcp-vertex/...` instead of `<root>/.cache/mcp-vertex/...`. Root cause: `resolveSessionWorkspaceRoot` in `agent-lock-engine.ts` only stripped ONE path segment (checking if the lock path's immediate parent was literally named `.cache`), but the real, canonical lock path shape has an EXTRA `mcp-vertex` segment (`<root>/.cache/mcp-vertex/agents.lock.json`, from the plugin's own cache dir) that the function never accounted for. Every existing unit-test fixture for this code used a flatter, unrealistic path shape (`<workspace>/agents.lock.json` or `<workspace>/.cache/agents.lock.json`, never the real two-level `.cache/mcp-vertex/` shape), which is exactly why this shipped undetected.

## non-goals

- A full audit of every other module for the same one-level-vs-two-level cache-path assumption — this proposal fixes the one confirmed-broken, live-reproduced case (session-log path); a broader sweep is a natural follow-up, not blocking here.
- Deleting the local copies of the two untracked files — only `git rm --cached` (untrack, keep on disk) for settings.local.json since it is a real, currently-used local config; metrics-candidate.json is kept on disk too since a local tool (`diff-snapshots.script.ts`) reads it as a comparison baseline.
- Rewriting git history to purge the old committed content of these two files from past commits — out of scope; the fix stops future commits from re-adding them, it does not scrub history.

## Slices

- global_gate: type

### S1 — Fix resolveSessionWorkspaceRoot to correctly strip both .cache and mcp-vertex segments
- **Status**: done
- **Implementation**: `resolveSessionWorkspaceRoot` now walks UP from the lock path's directory looking for an ancestor literally named `.cache` and returns ITS parent, instead of checking only one level up. This is correct for both the real two-level shape (`.cache/mcp-vertex/agents.lock.json`) and the flatter shapes the existing test fixtures happened to use (which is exactly why the bug shipped undetected — no fixture used the real shape). Also removed two pre-existing, unrelated dead-code findings noticed while in the file: an unused `tableEntries` read (a redundant `readFileLockEntries` call whose result was never consulted — `findConflictingLocks` already re-derives the same data from `tablePath`) and an unused `readSessionBalanceSync` import.
- **Files**: `plugins/proposals/src/lib/locks/agent-lock-engine.ts`, `plugins/proposals/tests/src/lib/locks/agent-lock-engine.spec.ts`
- **Gate**: type
- acceptance:
  - "A lock path shaped <root>/.cache/mcp-vertex/agents.lock.json resolves the session log to <root>/.cache/mcp-vertex/agents.lock.session.jsonl, not a doubly-nested path."
  - "New regression test uses the REAL two-level shape (none of the existing fixtures did) and asserts the doubly-nested path does not exist."
  - "Existing tests using the flatter shapes (<workspace>/agents.lock.json, <workspace>/.cache/agents.lock.json) are unaffected."
  - "The stray .cache/mcp-vertex/.cache/ directory this bug produced in this repo's own working tree is removed; bun run lint:stray-cache-files reports 0 findings."

### S2 — Untrack .claude/settings.local.json and metrics-candidate.json; add an enforcement lint
- **Status**: done
- **Implementation**: `git rm --cached` on both files (kept on disk; `.claude/settings.local.json` was also cleaned up in place — consistent `mcp__mcp-vertex__mcp-vertex_<plugin>_<tool>` naming for every entry, the dangerous standing `Bash(rm -rf * .*)` approval removed, one-off `/tmp/mcpv-scratch-test` debugging entries removed). New `no-tracked-ignored-files.script.ts` wraps `git ls-files -i --exclude-standard -c` (git's own primitive for "tracked file that also matches an ignore rule") behind an injectable lister so the CLI shell is unit-testable without a live git repo; wired into `bun run validate`.
- **Files**: `tools/scripts/lint/no-tracked-ignored-files.script.ts`, `tools/scripts/lint/no-tracked-ignored-files.script.spec.ts`, `package.json`
- **Gate**: type
- acceptance:
  - "git ls-files -i --exclude-standard -c returns 0 entries after `git rm --cached` on both files (kept on disk)."
  - "A new lint:no-tracked-ignored-files script wraps that same git primitive and is wired into `bun run validate`, so this class of regression fails CI going forward instead of silently re-accumulating."
  - "New spec covers: clean repo (0 offenders), offenders reported+sorted, and a live acceptance check against this repo's own real git state."

## acceptance

- A lock path shaped <root>/.cache/mcp-vertex/agents.lock.json resolves the session log to <root>/.cache/mcp-vertex/agents.lock.session.jsonl, not a doubly-nested path.
- New regression test uses the REAL two-level shape (none of the existing fixtures did) and asserts the doubly-nested path does not exist.
- Existing tests using the flatter shapes (<workspace>/agents.lock.json, <workspace>/.cache/agents.lock.json) are unaffected.
- The stray .cache/mcp-vertex/.cache/ directory this bug produced in this repo's own working tree is removed; bun run lint:stray-cache-files reports 0 findings.
- git ls-files -i --exclude-standard -c returns 0 entries after `git rm --cached` on both files (kept on disk).
- A new lint:no-tracked-ignored-files script wraps that same git primitive and is wired into `bun run validate`, so this class of regression fails CI going forward instead of silently re-accumulating.
- New spec covers: clean repo (0 offenders), offenders reported+sorted, and a live acceptance check against this repo's own real git state.
