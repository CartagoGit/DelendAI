---
id: x00969
title: "fast-uri and undici move past the advisories published on 2026-10-24"
kind: fix
status: review
type: proposal
track: dependencies
date: 2026-10-23
last-transition-id: f500f9c6-4db1-4b33-84ad-943a776b9106
last-correlation-id: f500f9c6-4db1-4b33-84ad-943a776b9106
last-transition-from: in-progress
last-transition-at: 2026-10-24T01:03:45.922Z
---

# x00969 — fast-uri and undici move past the advisories published on 2026-10-24

## goal

The root overrides pin fast-uri 3.1.9, which clears GHSA-w74x-v6f9-j3xg, GHSA-xhq7-xmqj-769h and GHSA-wjr9-j795-jxcr, and undici 7.30.1, which clears GHSA-4qv8-2p9j-2685 and GHSA-f72v-6w45-q472, so lint:dependency-advisories passes again.

## why

Three fast-uri advisories (scheme spoofing via percent-encoded scheme decoding, moderate; improper path equivalence in relative reference normalization, low; host confusion via unchecked WHATWG host canonicalization, moderate) clear at 3.1.9 on the 3.x line. The root overrides pin fast-uri 3.1.8 (reached through ajv), and the 0.2.4 release PR (#1451) failed lint-security on them, as does every pull request. @azure/msal-node 5.6.0 (through @azure/identity, used only by @vscode/vsce) has GHSA-xcx6-jx8p-x3h5, which clears at 7.1.0; identity declares ^6 but loads on 7.1.0, so a root override pins it. Two undici advisories (denial of service via unbounded memory, moderate; Subresource Integrity bypass via non-lowercase algorithm names, moderate) clear at 7.30.1, and the overrides pin 7.30.0.

## non-goals

- Upgrading ajv.

## slices

- global_gate: type

### S1 — Override and lock
- **Status**: review
- **Files**: `package.json`, `bun.lock`
- **Gate**: type
- acceptance:
  - "The root overrides pin fast-uri 3.1.9, undici 7.30.1 and @azure/msal-node 7.1.0 and the lock resolves them with no other package changed; `bun install --frozen-lockfile` reports no changes and lint:dependency-advisories passes."
  - "The core and tools suites pass."
- shipped-in: `c78471d226af`
- review-state: in_review
- review-implementer: claude-opus-5-5

## acceptance

- The root overrides pin fast-uri 3.1.9 and undici 7.30.1 and the lock resolves them with no other package changed; `bun install --frozen-lockfile` reports no changes and lint:dependency-advisories passes.
- The core and tools suites pass.
