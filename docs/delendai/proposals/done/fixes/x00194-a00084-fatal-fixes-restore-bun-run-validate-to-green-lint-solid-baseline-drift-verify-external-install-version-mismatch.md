---
id: x00194
title: "a00084 FATAL fixes — restore bun run validate to green (lint:solid baseline drift + verify:external-install version mismatch)"
kind: fix
status: done
type: proposal
track: a00084-audit-followup
date: 2026-07-30
shipped-in:
    - 6039321a # fix(x00194): a00084 FATAL #2 — verify:external-install ERESOLVE (core version lockstep bump)
    - e7fc2c9a # fix(x00194): a00084 FATAL #1 — regenerate lint:solid baseline
---

# x00194 — a00084 FATAL fixes — restore bun run validate to green (lint:solid baseline drift + verify:external-install version mismatch)

## Goal

Fix the 2 FATAL findings from a00084 (concurrent-agent audit, 2026-07-30, "seguimiento de a00083") that leave `bun run validate` red on `develop`:

- **#1** `tools/scripts/lint/solid-compliance.baseline.json` — x00168's real containment fix shifted line numbers in 5 files by +6/+21 lines; the baseline still pins the OLD line numbers for pre-existing duplicated-block findings in those files, so solid-compliance reports "95 new findings" that are actually the same old duplication at new locations. Fix: regenerate the baseline.
- **#2** `packages/core/package.json` — every plugin declares `@mcp-vertex/core: ^0.1.0` as a peer dependency; core itself was pinned at exact `0.1.0`. A clean `npm install` against `file:` tarballs (the real consumer install path `verify:external-install-smoke` exercises) rejects this under npm's file:-install semver rules. Fix: lockstep version bump to `0.1.1` via the release script.

## why

Both are required steps in `bun run validate`, the canonical close-time gate for every proposal in this repo — with them red, no proposal (including this session's own 13 open PRs) can honestly claim a green validate run. a00084's own audit itself cannot close until these ship (it says so explicitly in its acceptance checklist).

## non-goals

- Extracting the underlying duplicated blocks into packages/core/src/public/ (a00084's suggested deeper fix for #1) - real refactor opportunity, tracked separately, not required to make the gate green
- Auditing every OTHER package for the same class of version-pin mismatch - only the core/peer relationship was proven broken and fixed here

## Slices

- global_gate: none

### S1 — Regenerate solid-compliance baseline
- **Status**: done
- **Files**: `tools/scripts/lint/solid-compliance.baseline.json`
- **Gate**: lint
- acceptance:
  - "bun run lint:solid exits 0 with 0 new findings (7676 total, matching every other proposal branch shipped this session)"

### S2 — Lockstep version bump to fix verify:external-install
- **Status**: done
- **Files**: `packages/core/package.json`, `packages/client/package.json`, `packages/cli/package.json`, `bun.lock`, `docs/mcp-vertex/api/stable.json`
- **Gate**: e2e
- acceptance:
  - "bun tools/scripts/verify/external-install-smoke.script.ts exits 0 (44 tarballs installed, real MCP handshake) - verified empirically with real Node/npm access via fnm, not just Bun"
  - "Full bun run test suite re-verified: 6238/6239 (1 pre-existing unrelated timing flake, confirmed passing 5/5 in isolation)"

## acceptance

- bun run lint:solid exits 0 with 0 new findings (7676 total, matching every other proposal branch shipped this session)
- bun tools/scripts/verify/external-install-smoke.script.ts exits 0 (44 tarballs installed, real MCP handshake) - verified empirically with real Node/npm access via fnm, not just Bun
- Full bun run test suite re-verified: 6238/6239 (1 pre-existing unrelated timing flake, confirmed passing 5/5 in isolation)
