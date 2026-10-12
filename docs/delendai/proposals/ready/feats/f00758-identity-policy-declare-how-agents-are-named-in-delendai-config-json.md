---
id: f00758
title: "Identity policy: declare how agents are named in delendai.config.json"
kind: feat
status: ready
type: proposal
track: general
date: 2026-10-12
---

# f00758 — Identity policy: declare how agents are named in delendai.config.json

## goal

Let a project declare its identity model in development.identity instead of inheriting the hardcoded chain: refuse or rename identities that are not a declared/recognised model id, and opt out of provider-bridge naming.

## why

PR #1037 added the provider bridge as an identity source, but whether a bridge-observed name counts is not a project decision: a project that wants only declared model ids, or that wants identities nothing named a model mapped to one default, has no way to say so. Identity is load-bearing — it names work refs, commit authors and review attribution — so its rules belong in the policy the project declares, next to guard.unknownActor.

## non-goals

- Changing what a project that declares nothing gets: the chain model -> environment -> provider -> client stays the default.
- Validating model ids against a vendor registry — 'unrecognised' here means 'not a declared model identity', not 'not a model this vendor sells'.
- Touching the roster (coordination.roster), which already decides WHO may work; this axis decides HOW a name counts.

## slices

- global_gate: none

### S1 — TODO
- **Status**: pending
- **Files**: `TODO`
- **Gate**: none

## acceptance

- TODO: observable acceptance criteria.
