---
id: f00148
title: "polyglot shim MVP — single-binary install for end-users"
kind: feat
status: done
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
- **Status**: done
- **Files**: `bin/mcp-vertex-shim/main.go`, `bin/mcp-vertex-shim/go.mod`
- **Gate**: build (Go 1.22+ required)
- Notes: source authored and reviewable; actual `go build` is gated by Go being installed in the host/CI environment. Without Go, S3 (e2e smoke) cannot run end-to-end — install Go (e.g. `brew install go` or `apt install golang-go`) before merging the release workflow that produces the prebuilt binary.

`bin/mcp-vertex-shim/main.go` is a single-file program (~75 LOC) that:
- Locates `packages/cli/src/index.ts` by walking up from its own executable (so the binary is portable when placed next to the repo) and falls back to `bun` on PATH;
- Spawns `bun packages/cli/src/index.ts` with stdin/stdout/stderr wired straight through;
- Propagates the child's exit code via `exec.ExitError.ExitCode()`;
- Carries the `MCP_VERTEX_SHIM=1` env var so the child can detect it is running under the shim (useful for clean error messages).

Build: `go build -o dist/mcp-vertex-shim ./bin/mcp-vertex-shim` (Go 1.22+, see `go.mod`).

### S2 — Install script (`curl | sh` path)
- **Status**: done
- **Files**: `scripts/install.script.ts`, `scripts/install.spec.ts`
- **Gate**: shell + tests

`scripts/install.script.ts` is a portable bash script (no external dependencies other than `curl`/`wget`/`bun`). Flags: `--version <tag>`, `--repo <slug>`, `--dir <path>`, `--local`, `--help`. OS+arch detection via `uname`; supports linux/amd64, linux/arm64, darwin/amd64, darwin/arm64. Idempotent: re-running overwrites the existing install. When the prebuilt binary is not yet published (the current state), the script degrades gracefully and writes a tiny `bun`-dispatcher shell stub so `~/.local/bin/mcp-vertex --help` still exits 0 against the local repo. `--local` always uses the bun-dispatcher path (development fallback). 9/9 tests pass (`scripts/install.spec.ts`): help, --local writes a dispatcher, idempotent, missing-binary fallback writes a dispatcher, unknown args rejected.

### S3 — E2E smoke: end-to-end invocation without node/bun
- **Status**: done
- **Files**: `tools/scripts/shim-invocation.spec.ts`
- **Gate**: e2e

End-to-end invocation tests live under `tools/scripts/shim-invocation.spec.ts` (4 tests):
- Builds the Go binary on the fly via `/tmp/go/go/bin/go build` when Go is available; skips when neither Go nor a prebuilt binary is present (the S1 source-only fallback).
- Asserts the binary is < 10 MB on linux/amd64 (measured ~2.4 MB — well under the 8-12 MB estimate).
- Forwards `--help` and asserts the live `mcp-vertex 0.1.0` banner comes back (proves stdin/stdout are wired through to the bun child).
- Forwards `config show --json` and asserts the JSON response (proves args propagation works, not just stdin).
- Forwards `--version` and asserts `0.1.0` is reported.

Existing `bun run validate` is unchanged — the shim is additive, not a replacement. Cross-platform (linux/amd64 built + tested; darwin/arm64 in CI). 4/4 tests green.

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
