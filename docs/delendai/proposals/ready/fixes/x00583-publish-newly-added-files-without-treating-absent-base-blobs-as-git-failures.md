---
id: x00583
title: "Publish newly added files without treating absent base blobs as Git failures"
kind: fix
status: ready
type: proposal
track: batuta
date: 2026-09-21
---

# x00583 — Publish newly added files without treating absent base blobs as Git failures

## Goal

Use a missing-path-aware Git tree lookup for publication stale detection. Preserve errors for invalid refs and reject overwrites of independently changed existing files. Verify against a real temporary Git repository without moving the shared checkout.

## why

Batuta registration exposed a publication failure: rev-parse throws when a new file does not exist in the integration tree. Fix the publication prerequisite without bypassing stale-content guards.

## non-goals

- TODO: what this proposal deliberately skips.

## Slices

- global_gate: type

### S1 — Distinguish new paths from Git lookup errors
- **Status**: pending
- **Files**: `tools/scripts/forge/publish-candidate.script.ts`, `tools/scripts/forge/publish-candidate.script.spec.ts`
- **Gate**: type
- acceptance:
  - "An added path absent from HEAD and integration is accepted by stale detection."
  - "Existing blobs are compared accurately, including paths with spaces; invalid revisions still fail."
  - "Existing publication invariants and focused tests pass; no branch switch or gate bypass."

## acceptance

- An added path absent from HEAD and integration is accepted by stale detection.
- Existing blobs are compared accurately, including paths with spaces; invalid revisions still fail.
- Existing publication invariants and focused tests pass; no branch switch or gate bypass.
