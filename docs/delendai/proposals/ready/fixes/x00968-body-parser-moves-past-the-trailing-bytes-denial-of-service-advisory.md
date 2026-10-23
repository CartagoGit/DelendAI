---
id: x00968
title: "body-parser moves past the trailing-bytes denial-of-service advisory"
kind: fix
status: ready
type: proposal
track: dependencies
date: 2026-10-23
---

# x00968 — body-parser moves past the trailing-bytes denial-of-service advisory

## goal

The lockfile resolves body-parser 2.4.0 or later through a root override, so GHSA-27r3-jxmh-p828 no longer fails lint:dependency-advisories.

## why

GHSA-27r3-jxmh-p828 (high): body-parser is vulnerable to denial of service via trailing bytes after a compressed request body; it clears at 2.4.0 (and 1.20.9 on the 1.x line). The lock resolves 2.3.0, reached transitively through express and @modelcontextprotocol/sdk, and the 0.2.4 release PR (#1451) failed lint-security on it, as does every pull request.

## non-goals

- Upgrading express or the SDK.

## slices

- global_gate: type

### S1 — Override and lock
- **Status**: pending
- **Files**: `package.json`, `bun.lock`
- **Gate**: type
- acceptance:
  - "The root overrides pin body-parser 2.4.0, the lock resolves it with only its own dependency subtree changed, `bun install --frozen-lockfile` reports no changes, and lint:dependency-advisories passes."
  - "The core, tools and plugin suites pass."

## acceptance

- The root overrides pin body-parser 2.4.0, the lock resolves it with only its own dependency subtree changed, `bun install --frozen-lockfile` reports no changes, and lint:dependency-advisories passes.
- The core, tools and plugin suites pass.
