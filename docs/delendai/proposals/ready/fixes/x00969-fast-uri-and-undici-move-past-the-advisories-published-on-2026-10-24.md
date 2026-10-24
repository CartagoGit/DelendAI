---
id: x00969
title: "fast-uri and undici move past the advisories published on 2026-10-24"
kind: fix
status: ready
type: proposal
track: dependencies
date: 2026-10-23
---

# x00969 — fast-uri and undici move past the advisories published on 2026-10-24

## goal

The root overrides pin fast-uri 3.1.9, which clears GHSA-w74x-v6f9-j3xg, GHSA-xhq7-xmqj-769h and GHSA-wjr9-j795-jxcr, and undici 7.30.1, which clears GHSA-4qv8-2p9j-2685 and GHSA-f72v-6w45-q472, so lint:dependency-advisories passes again.

## why

Three fast-uri advisories (scheme spoofing via percent-encoded scheme decoding, moderate; improper path equivalence in relative reference normalization, low; host confusion via unchecked WHATWG host canonicalization, moderate) clear at 3.1.9 on the 3.x line. The root overrides pin fast-uri 3.1.8 (reached through ajv), and the 0.2.4 release PR (#1451) failed lint-security on them, as does every pull request. Two undici advisories (denial of service via unbounded memory, moderate; Subresource Integrity bypass via non-lowercase algorithm names, moderate) clear at 7.30.1, and the overrides pin 7.30.0.

## non-goals

- Upgrading ajv.

## slices

- global_gate: type

### S1 — Override and lock
- **Status**: pending
- **Files**: `package.json`, `bun.lock`
- **Gate**: type
- acceptance:
  - "The root overrides pin fast-uri 3.1.9 and undici 7.30.1 and the lock resolves them with no other package changed; `bun install --frozen-lockfile` reports no changes and lint:dependency-advisories passes."
  - "The core and tools suites pass."

## acceptance

- The root overrides pin fast-uri 3.1.9 and undici 7.30.1 and the lock resolves them with no other package changed; `bun install --frozen-lockfile` reports no changes and lint:dependency-advisories passes.
- The core and tools suites pass.
