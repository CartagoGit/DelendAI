---
id: x01065
title: "The first-call cold import and the per-test git init leave the CLI entry spec, and the real host boot is named an e2e spec"
kind: fix
status: ready
type: proposal
track: general
date: 2026-11-13
---

# x01065 — The first-call cold import and the per-test git init leave the CLI entry spec, and the real host boot is named an e2e spec

## goal

packages/cli/src/index.spec.ts pays a 4.8 s cold command import inside its first test and runs git init per case; host-boot-journal boots the real host and belongs to the e2e tier.

## why

TODO: why this work matters now.

## non-goals

- TODO: what this proposal deliberately skips.

## slices

- global_gate: none

### S1 — TODO
- **Status**: pending
- **Files**: `TODO`
- **Gate**: none

## acceptance

- TODO: observable acceptance criteria.
