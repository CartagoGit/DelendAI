---
id: x00185
title: "a00083 — observability body-read timeout, docs_read filter, git_changelog footer, security_deps containment"
kind: fix
status: done
type: proposal
track: plugins+audit-followup
date: 2026-07-29
related:
    - a00083 # full-project audit
shipped-in:
    - f1ede5e0 # fix(x00185): observability body-read timeout, docs_read filter, git_changelog footer, security_deps containment
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

### S1 — observability timeout + health tools
- **Status**: done
- **Files**: `plugins/observability/src/lib/errors/ierror-source.ts`, `plugins/observability/src/lib/errors/ierror-source.spec.ts`, `plugins/observability/src/index.ts`, `plugins/observability/src/index.spec.ts`
- **Gate**: test
- acceptance:
  - "The reader.read() body loop races each read against its own AbortSignal.timeout(FETCH_TIMEOUT_MS); on expiry the reader is cancelled and a typed BodyReadTimeoutError is thrown instead of hanging forever"
  - "obs_health (which itself registers both obs_trace and obs_release_health) is imported and wired into the plugin's tools array — previously fully implemented and tested in isolation but completely unreachable"
  - "New tests: a stalled-body-after-headers spec proving the new timeout fires, plus a new index.spec.ts (this plugin had zero registration-level test coverage before, which is exactly how F13 went unnoticed) proving all 3 tool ids register and obs_health exposes both sub-tools"

### S2 — docs_read filter
- **Status**: done
- **Files**: `plugins/docs/src/lib/services/engine.ts`, `plugins/docs/src/lib/tools/tools.ts`, `plugins/docs/tests/src/lib/docs.spec.ts`
- **Gate**: test
- acceptance:
  - "readDoc rejects any path whose extension isn't .md/.mdx (reusing the same extOf/DEFAULT_EXTENSIONS listDocs already uses), returning a structured reason: 'not-a-markdown-file'"
  - "IDocContent gained an optional reason field (also distinguishes an out-of-workspace miss via contained.reason) and docs_read's outputSchema was updated to match"
  - "New test proves both a non-markdown text file and a .ts source file are rejected even though they exist and are contained"

### S3 — git_changelog footer parsing
- **Status**: done
- **Files**: `plugins/git/src/lib/services/changelog.ts`, `plugins/git/tests/src/lib/changelog.spec.ts`
- **Gate**: test
- acceptance:
  - "git argv extended to %h%x1f%s%x1f%b%x1e (hash/subject/body, %x1e-terminated per record instead of newline-terminated, since %b itself can contain newlines that would otherwise split one commit into several bogus records — verified against this repo's own real git log output before trusting the parser)"
  - "parseConventionalCommits tests the breaking marker against subject+body combined, not subject alone"
  - "New fixture-driven test proves a footer-only BREAKING CHANGE (body, not subject) is classified major; existing fixture updated to the new %x1e-terminated format"

### S4 — security_deps cwd containment
- **Status**: done
- **Files**: `plugins/security/src/lib/tools/security-deps.tool.ts`, `plugins/security/src/lib/tools/security-deps.tool.spec.ts`
- **Gate**: test
- acceptance:
  - "args.cwd now goes through resolveWorkspaceContained(options.workspaceRootAbs, cwd) before reaching listDeps/runAuditCommand, matching the exact pattern already shipped for security-sast.tool.ts in x00168 (this exact file was deliberately left untouched then, to avoid duplicating this proposal's in-flight ownership)"
  - "New test proves a cwd that escapes the workspace (../../../../etc) is rejected with a structured error"

## Notes

- a00083 — full-project audit (source of these findings)
- x00157 S4 — predecessor fix that bounded the initial fetch but missed the body-read
- x00168 — shipped the identical containment pattern for security-sast.tool.ts, deliberately leaving security-deps.tool.ts (F16) for this proposal

## acceptance

- The observability body-read loop times out instead of hanging forever; obs_health/obs_trace/obs_release_health are now reachable
- docs_read refuses any non-.md/.mdx file even when contained and existing
- git_changelog correctly classifies a footer-only BREAKING CHANGE as a major bump
- security_deps's cwd is contained to the workspace before any audit runs
