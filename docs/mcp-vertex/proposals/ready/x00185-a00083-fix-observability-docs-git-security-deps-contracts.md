---
id: x00185
title: "a00083 — observability body-read timeout, docs_read filter, git_changelog footer, security_deps containment"
kind: fix
status: ready
type: proposal
track: plugins+audit-followup
date: 2026-07-29
related:
    - a00083 # full-project audit
---

# x00185 — a00083 — observability body-read timeout, docs_read filter, git_changelog footer, security_deps containment

## Goal

Resolve findings F12, F13, F14, F15, F16 from a00083 (29-07-2026) — a cluster of plugin-side contract and timeout issues. Each is a single-file fix in a different plugin; the proposal groups them because they share the "tool surface widening" pattern (a tool either reads more than it should or fails to expose what it should).

- **F12** `plugins/observability/src/lib/errors/ierror-source.ts#L149` — the body-read loop after the initial `AbortSignal.timeout` has no timeout. A server that returns headers then leaves the stream open hangs the entire MCP turn.
- **F13** `plugins/observability/src/index.ts#L95` — the observability primitive (traces + release health) exists in `obs-health.tool.ts` but isn't registered. Host cannot call it.
- **F14** `plugins/docs/src/lib/services/engine.ts#L308` — `docs_read` doesn't enforce the `.md` / `.mdx` filter that `docs_list` honours; a caller who knows a relative path can read any workspace file.
- **F15** `plugins/git/src/lib/services/changelog.ts#L32` — `BREAKING CHANGE` footer is never seen by the parser because git is invoked with `--pretty=format:%h%x1f%s`. A real major commit gets classified as patch.
- **F16** `plugins/security/src/lib/tools/security-deps.tool.ts#L138` — `args.cwd` is forwarded to the audit runner with no `resolveWorkspaceContained` check.

## why

- **F12/F13 (observability)** — observability is the brief's "canonical observability primitive"; if it can hang or is unreachable, every other plugin's metrics are silently corrupt. x00157 S4 fixed the *initial* fetch timeout but missed the body-read.
- **F14 (docs_read)** — silently widens the plugin's surface from "read documentation" to "read any file the workspace can see", contradicting its own description.
- **F15 (git_changelog)** — wrong semver inference for any commit whose breaking change is in the body (a *very* common shape per Conventional Commits 1.0.0). The wrong semver propagates through `derive-version.ts` to the published version.
- **F16 (security_deps)** — a hostile host can run dependency audits on `/etc`, `/home`, etc.

## non-goals

- Reworking the `obs_errors` tool envelope. The x00155 convention is already in place; this fix only bounds the body read.
- Replacing the Conventional Commits parser. The fix only extends the git argv to include `%b` (body) for commits whose subject doesn't contain the breaking marker.

## slices

### s1 — observability timeout + health tools

- **File**: `plugins/observability/src/lib/errors/ierror-source.ts`.
- Wrap the `reader.read()` loop with an `AbortSignal.timeout` (reuse the existing `FETCH_TIMEOUT_MS`); on abort, throw a typed `BodyReadTimeoutError`.
- **File**: `plugins/observability/src/index.ts`.
- Register `obs_health` and `obs_trace` tools alongside `obs_errors` and `obs_correlate`.
- **Acceptance**: a new spec fires a slow-body response and asserts the timeout fires within `FETCH_TIMEOUT_MS` ± 10%; an `obs_health` smoke spec asserts the tool appears in the plugin's tool list.

### s2 — docs_read filter

- **File**: `plugins/docs/src/lib/services/engine.ts#L308`.
- After the containment check, assert `abs` ends in `.md` or `.mdx` (case-insensitive); otherwise `return miss()` with a structured reason `"not-a-markdown-file"`.
- **Acceptance**: `bun test plugins/docs/tests/src/lib/services/engine.spec.ts` (or the closest equivalent) — a new spec asserts `docs_read` rejects `package.json`.

### s3 — git_changelog footer parsing

- **File**: `plugins/git/src/lib/services/changelog.ts`.
- Extend the git argv to use `%h%x1f%s%x1f%b` (hash, subject, body) when the subject doesn't already match `!` or contain `BREAKING CHANGE`. The parser re-tests the combined string for the marker.
- Add a fixture-driven spec covering footer-only breaking changes.
- **Acceptance**: `bun test plugins/git/tests/src/lib/services/changelog.spec.ts` exits 0 with the new footer-only case.

### s4 — security_deps cwd containment

- **File**: `plugins/security/src/lib/tools/security-deps.tool.ts#L138`.
- Before invoking `listDeps(cwd)`, run `resolveWorkspaceContained(options.workspaceRootAbs, args.cwd ?? '.')`; on `contained.ok === false`, return `toolError(...)`.
- **Acceptance**: new spec — `args.cwd = '/etc'` is rejected with `workspace-escape`; `args.cwd = '.'` is allowed.

## related

- a00083 — full-project audit (source of these findings)
- x00157 S4 — predecessor fix that bounded the initial fetch but missed the body-read