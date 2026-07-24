---
id: f00122
kind: feat
title: security plugin — secrets, dependency CVEs and SAST scanning with normalized findings and an opt-in gate
status: ready
date: 2026-07-23
track: plugin+security+quality
---

# f00122 — security plugin

## goal

A `security` plugin that scans a project for (1) **leaked secrets** (promoting
mcp-vertex's internal `no-cleartext-secrets` rule library to an adopter-facing
scanner, gitleaks-compatible), (2) **dependency CVEs** (bun/npm audit + an
optional OSV lookup), and (3) **SAST** issues (semgrep / ast-grep rule packs),
reporting every result as a normalized `IFinding` (r00012) with severity,
location and a fix hint. It ships an **opt-in gate** (`verify:security`, fail on
new criticals) and is **auto-configured** per stack via the `security-hardened`
pack (r00011) — zero setup for the common case.

## why

Supply-chain and secret security is the hottest 2026 developer concern, and
SonarCloud-style security scanning is a top market server. mcp-vertex already
has an internal secret-detection lint and a `deps` plugin — this promotes and
unifies them into one project-aware, gated surface. Dogfooding: this repo
cares about secret hygiene and dependency CVEs, and a gate that fails on new
criticals raises its own reliability bar.

## why this design

Compose r00012 for the runner, tool-presence probe + install hints, and the
uniform finding shape, so `security` is thin adapters over tools the user
likely already has (`bun audit`/`npm audit`) with graceful fallback and
one-command install hints for the rest (gitleaks, semgrep, osv-scanner,
trivy). **Rules are data** — per-stack rule packs, not code — so coverage
grows by editing a constant. The internal secret regex library is reused
directly. No scanner binaries are bundled; nothing leaves the machine except
an **opt-in, allow-listed** OSV lookup via web-fetch.

## non-goals

- No bundled scanner binaries and no silent installs — missing tool → hint.
- No auto-remediation that rewrites code without an explicit, reviewed diff.
- No shipping code or dependency lists to a network service — local scanners
  only; OSV is opt-in and allow-listed; secrets are redacted from all output.
- Not a replacement for `deps` — it consumes/extends it for the CVE surface.

## slices

### S1 — secrets scan

- **Status**: done (2026-07-24)
- **Files**: `plugins/security/src/lib/secrets/`, `plugins/security/src/lib/tools/security-secrets.tool.ts`
- **Gate**: bun run validate

Promote the internal secret-rule library to `security_secrets` (scan changed
files or whole tree) → `IFinding[]`, with matches redacted. Pure detector over
injected file contents; unit-tested on seeded fixtures.

S1 deliverable: `security_secrets` MCP tool with `scope: 'changed' | 'tracked'`
and `includeTests: boolean` inputs. Reads + applies the existing
`SECRET_RULES` (private keys, AWS/GitHub/Google/Slack/OpenAI tokens) and
returns normalized findings — severity (critical/high/medium/low/info),
rule id, file:line, redacted match. Online-only: the detector never
spawns network commands. 9 positive tests across 3 files pass.

### S2 — dependency CVEs

- **Status**: pending
- **Files**: `plugins/security/src/lib/deps/`, `plugins/security/src/lib/tools/security-deps.tool.ts`
- **Gate**: bun run validate

`security_deps` via `bun audit`/`npm audit` (r00012 runner + probe) with an
optional OSV lookup (allow-listed web-fetch), severity-normalized into shared
findings. Reuses the `deps` manifest parsing.

### S3 — SAST rule packs

- **Status**: pending
- **Files**: `plugins/security/src/lib/sast/`, `plugins/security/src/lib/tools/security-sast.tool.ts`
- **Gate**: bun run validate

`security_sast` via semgrep / ast-grep rule packs selected by detected stack
(r00011). Presence-probed with install hint; rules are data. Pure result
mapper over injected exec.

### S4 — gate, pack membership, catalog

- **Status**: pending
- **Files**: `tools/scripts/verify/security.script.ts`, `packages/core/src/lib/plugins/preset-catalog.ts`, `plugins/security/README.md`
- **Gate**: bun run validate

Opt-in `verify:security` (fail on new criticals vs a baseline), the
`security-hardened` pack, README/wiki/catalog wiring. Baseline model mirrors
the existing dangling-refs/finding baselines so pre-existing issues don't block.

## acceptance

- `bun run validate` → exit 0 (incl. `verify:tools`, `types-in-contracts`).
- On this repo, `security_secrets` finds a seeded test secret and
  `security_deps` a known-vuln fixture; a missing scanner yields an install
  hint, never a crash.
- All three surfaces emit uniform `IFinding`s that render identically in CLI +
  extension; secrets are redacted everywhere.
- `verify:security` fails on a newly-introduced critical and passes a clean
  tree against its baseline.

## notes

Reuses r00012 (runner/probe/finding), the internal secret-rule library, the
`deps` manifest layer, and web-fetch (opt-in OSV). Prior art: SonarCloud,
Semgrep, Snyk, Trivy, gitleaks, OSV — unified here behind one gated,
project-aware, auto-configured surface.
