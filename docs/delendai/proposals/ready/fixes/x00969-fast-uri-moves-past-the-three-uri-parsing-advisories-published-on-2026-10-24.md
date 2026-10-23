---
id: x00969
title: "fast-uri moves past the three URI-parsing advisories published on 2026-10-24"
kind: fix
status: ready
type: proposal
track: dependencies
date: 2026-10-23
---

# x00969 — fast-uri moves past the three URI-parsing advisories published on 2026-10-24

## goal

The root override pins fast-uri 3.1.9, which clears GHSA-w74x-v6f9-j3xg, GHSA-xhq7-xmqj-769h and GHSA-wjr9-j795-jxcr, so lint:dependency-advisories passes again.

## why

Three fast-uri advisories (scheme spoofing via percent-encoded scheme decoding, moderate; improper path equivalence in relative reference normalization, low; host confusion via unchecked WHATWG host canonicalization, moderate) clear at 3.1.9 on the 3.x line. The root overrides pin fast-uri 3.1.8 (reached through ajv), and the 0.2.4 release PR (#1451) failed lint-security on them, as does every pull request.

## non-goals

- Upgrading ajv.

## slices

- global_gate: type

### S1 — Override and lock
- **Status**: pending
- **Files**: `package.json`, `bun.lock`
- **Gate**: type
- acceptance:
  - "The root overrides pin fast-uri 3.1.9 and the lock resolves it with no other package changed; `bun install --frozen-lockfile` reports no changes and lint:dependency-advisories passes."
  - "The core and tools suites pass."

## acceptance

- The root overrides pin fast-uri 3.1.9 and the lock resolves it with no other package changed; `bun install --frozen-lockfile` reports no changes and lint:dependency-advisories passes.
- The core and tools suites pass.
