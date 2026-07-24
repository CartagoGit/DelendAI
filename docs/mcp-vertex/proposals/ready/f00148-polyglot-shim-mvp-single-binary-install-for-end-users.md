---
id: f00148
title: "polyglot shim MVP — single-binary install for end-users"
kind: feat
status: ready
type: proposal
track: infra+distribution+economics
date: 2026-07-24
---

# f00148 — polyglot shim MVP — single-binary install for end-users

## Goal

Ship a small Go (or Rust) binary that wraps the existing `bun packages/cli/src/index.ts` over stdio JSON-RPC, so a new user can `curl -sSL install.sh | sh && mcp-vertex` without first installing Node/Bun/npm. Source code, install script, and one smoke test.

## why

The mcp-vertex distribution surface is the only axis where a language change delivers measurable value (DC7 of a00067). The polyglot shim captures the win without migrating 140k LOC of core code. Verified user-decisive: install goes from 4-5 steps to ~2.

## non-goals

- Rewrite the core runtime in Go/Rust — explicitly rejected by a00067.
- Plugin runtime in the shim — plugins stay in TS, loaded by the existing `bun` invocation under the shim.
- Windows MSI / Linux rpm / Mac brew — initial release is `curl|sh` + standalone binary.

## Slices

- global_gate: e2e

### S1 — Go shim scaffold + stdio JSON-RPC bridge
- **Status**: pending
- **Files**: `bin/mcp-vertex-shim/main.go`, `bin/mcp-vertex-shim/go.mod`
- **Gate**: e2e
- acceptance:
  - "`go build -o dist/mcp-vertex-shim ./bin/mcp-vertex-shim` produces a single ~8-12 MB binary."
  - "Binary reads JSON-RPC on stdin, forwards to `bun packages/cli/src/index.ts` as subprocess, writes the response to stdout."
  - "`./mcp-vertex-shim < tools-list-request.json` returns the live tool catalog without errors."
  - "Exit code propagates from the child."

### S2 — Install script (`curl | sh` path)
- **Status**: pending
- **Files**: `scripts/install.sh`
- **Gate**: e2e
- acceptance:
  - "`curl -sSL https://get.mcp-vertex.dev | sh` (or local stub) downloads the binary for the user's OS+arch and installs it under `~/.local/bin/`."
  - "After install, `mcp-vertex --help` exits 0."
  - "Idempotent: re-running the script does not duplicate."

### S3 — E2E smoke: end-to-end invocation without node/bun
- **Status**: pending
- **Files**: `packages/cli/tests/src/shim-invocation.e2e.spec.ts`
- **Gate**: e2e
- acceptance:
  - "Test path: a CI box without `node`/`bun` on PATH runs the binary, invokes the `overview` tool, and asserts the response contains the expected compact-summary projection."
  - "Existing `bun run validate` is unchanged (the shim is additive, not a replacement)."
  - "Cross-platform matrix: linux/amd64 + darwin/arm64 pass."

## acceptance

- `go build -o dist/mcp-vertex-shim ./bin/mcp-vertex-shim` produces a single ~8-12 MB binary.
- Binary reads JSON-RPC on stdin, forwards to `bun packages/cli/src/index.ts` as subprocess, writes the response to stdout.
- `./mcp-vertex-shim < tools-list-request.json` returns the live tool catalog without errors.
- Exit code propagates from the child.
- `curl -sSL https://get.mcp-vertex.dev | sh` (or local stub) downloads the binary for the user's OS+arch and installs it under `~/.local/bin/`.
- After install, `mcp-vertex --help` exits 0.
- Idempotent: re-running the script does not duplicate.
- Test path: a CI box without `node`/`bun` on PATH runs the binary, invokes the `overview` tool, and asserts the response contains the expected compact-summary projection.
- Existing `bun run validate` is unchanged (the shim is additive, not a replacement).
- Cross-platform matrix: linux/amd64 + darwin/arm64 pass.
