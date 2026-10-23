---
id: x00968
title: "body-parser moves past the trailing-bytes denial-of-service advisory"
kind: fix
status: review
type: proposal
track: dependencies
date: 2026-10-23
last-transition-id: 830aa6e8-fac5-4581-bb60-0e6a2acb48b8
last-correlation-id: 830aa6e8-fac5-4581-bb60-0e6a2acb48b8
last-transition-from: in-progress
last-transition-at: 2026-10-23T23:21:01.700Z
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
- **Status**: review
- **Files**: `package.json`, `bun.lock`
- **Gate**: type
- acceptance:
  - "The root overrides pin body-parser 2.4.0, the lock resolves it with only its own dependency subtree changed, `bun install --frozen-lockfile` reports no changes, and lint:dependency-advisories passes."
  - "The core, tools and plugin suites pass."
- shipped-in: `5d48c0387b9f`
- review-state: in_review
- review-implementer: claude-opus-5-5

## acceptance

- The root overrides pin body-parser 2.4.0, the lock resolves it with only its own dependency subtree changed, `bun install --frozen-lockfile` reports no changes, and lint:dependency-advisories passes.
- The core, tools and plugin suites pass.
