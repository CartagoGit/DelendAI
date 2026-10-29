---
id: x00996
title: "A file a proposal shipped still names what it shipped after a later change deletes it"
kind: fix
status: ready
type: proposal
track: ci
date: 2026-10-29
---

# x00996 — A file a proposal shipped still names what it shipped after a later change deletes it

## goal

`lint:proposals` accepts a `Files` entry of a finished slice that no longer exists on disk when one of the proposal's `shipped-in` commits holds it, so deleting code a proposal once shipped does not turn its record red.

## why

On 2026-10-29 #1538 (c00534, which removes the unused `roadmap-sqlite` package) failed `lint-governance` on every run: `proposal-files-exist` read x00987, in review, which lists `packages/roadmap-sqlite/src/lib/sqlite-timeline.store.ts` because x00987 edited that file, and the file no longer existed on the merge. `Files` names what shipped; what shipped existed in the shipping commit. The lint's baseline held 421 such dangling references; 54 of them were files their own `shipped-in` commits contain.

## non-goals

- Accepting a path no shipped commit ever held.

## slices

- global_gate: type

### S1 — Files are judged at the commit that shipped them
- **Status**: pending
- **Files**: `tools/scripts/lint/proposal-files-exist.script.ts`, `tools/scripts/lint/proposal-files-exist.script.spec.ts`, `tools/scripts/lint/proposal-files-exist.baseline.json`
- **Gate**: type
- acceptance:
  - "A missing `Files` path passes when `git cat-file -e <sha>:<path>` succeeds for one of the proposal's `shipped-in` commits (frontmatter or slice lines); a path no shipped commit held still fails (proposal-files-exist.script.spec.ts); the baseline shrinks from 421 to 367."

## acceptance

- A missing `Files` path passes when `git cat-file -e <sha>:<path>` succeeds for one of the proposal's `shipped-in` commits (frontmatter or slice lines); a path no shipped commit held still fails (proposal-files-exist.script.spec.ts); the baseline shrinks from 421 to 367.
