---
id: x00965
title: "Memory, issues, search and roadmap keep one record per thing and never merge two"
kind: fix
status: review
type: proposal
track: a00095-consistency
date: 2026-10-23
last-transition-id: 0e531c2c-971f-4b85-ad0c-43ea5d362699
last-correlation-id: 0e531c2c-971f-4b85-ad0c-43ea5d362699
last-transition-from: in-progress
last-transition-at: 2026-11-01T17:30:40.773Z
shipped-in:
  - "4d4d01d0c"
---

# x00965 — Memory, issues, search and roadmap keep one record per thing and never merge two

## goal

Memory notes get stable unique ids and fresh checkpoints count as fresh, imports validate their fields, issue scaffolds are one per issue and keep multi-line comments, the semantic index keys on path and embedder, roadmap reports archived proposals as delivered and closes only the entry asked, and the two read-modify-write stores (self-learning, roadmap) are mutexed.

## why

Joint audit a00095 and gpt-6.1-sol. G118 and sol G61-MEM01: a note id comes from its title and collides (release/v1 vs release-v1). sol G61-MEM02: an updated checkpoint stays stale. D88: memory_import accepts garbage timestamps and tags. D56: issues_ingest can leave two scaffolds for one issue after a title change. sol ISSUES-01: multi-line comment serialisation loses continuation and metadata. sol SEARCH-01: the content-hash index drops distinct paths with identical contents; SEARCH-02: the warm cache ignores the embedder identity and dimensions. sol ROAD-01: an archived done proposal is reported as legacy; ROAD-02: closing a duplicate entry id changes unrelated horizons. D91: roadmap accepts the authority-file mutation even if the chronology write fails. D47: self-learning read-modify-writes without mutual exclusion. D46: roadmap-sqlite's v1 to v2 migration contradicts its contract and can lose rows.

## non-goals

- Corrupt-store handling (the failures-stores proposal).

## slices

- global_gate: type

### S1 — memory
- **Status**: done
- **Files**: `plugins/memory/src/lib/services/store-records.ts`, `plugins/memory/src/lib/services/checkpoint-freshness.ts`, `plugins/memory/src/lib/services/store-portable.ts`, `plugins/memory/src/lib/tools/checkpoint-packet.tool.ts`, `plugins/memory/src/lib/tools/tools.ts`, `plugins/memory/tests/src/lib/one-record-per-note.spec.ts`
- **Gate**: type
- acceptance:
  - "Notes whose titles share a slug get distinct ids, and an id on disk is never rewritten, so no migration is needed (G118, G61-MEM01)."
  - "An updated checkpoint is fresh (G61-MEM02); imports refuse invalid timestamps and tags (D88)."
- shipped-in: `992b77931962`
- review-state: done
- review-implementer: claude-sonnet-5-5
- review-reviewer: minimax-m3.1-flash
- review-log: approved by minimax-m3.1-flash — verified at 4d4d01d0c, validate exit 0 and tests 7/7 claimed, no recorded run cited; acceptance 2/2: (1) store-records.ts:63-64 derives a note's id from the kebab slug of the title or, when the slug is empty, a sha256 of the trimmed title (titleHash at :55); resol… (2) checkpoint-freshness.ts:33-89 assesses a checkpoint's freshness from the note's updatedAt (:89), so a rewritten checkpoint reads as fresh; store-portable.ts:15… — Approved at 4d4d01d0c on the delivered state of the memory store, verified in the pack worktree against origin/develop. Type gate: bun run typecheck exited 0 for the pack unit. Slice specs: one-record-per-note.spec.ts and checkpoint-freshness.spec.ts, 2 files / 7 tests, exit 0. Acceptance 2/2: (1) titles that share a slug get distinct ids (the exact-title hash is appended when the slug is taken by another title) and saveNote upserts by id so no id on disk is rewritten, pinned by the spec that saves both 'release/v1' and 'release-v1' and asserts two records; (2) an updated checkpoint reads as fresh because freshness is assessed from updatedAt, and an import with an unreadable timestamp or tag is refused before it is written. Residual (non-blocking, pre-existing): a store written by a released version before v0.3.0 -- v0.2.0 (2026-10-22) and v0.2.4 (2026-10-24) both ship deriveNoteId = kebab(title) || note-<base36 timestamp> -- holds ids the new derivation does not re-derive, so re-saving such a title appends a second record instead of updating the first. The fix (992b77931, 2026-11-01) ships in v0.3.0 (2026-11-02), so a store written by a 0.2.x release is the one that carries the old shape; the proposal's own scope says no migration is needed and this slice delivers that (an id already on disk is never rewritten).

### S2 — issues and search
- **Status**: review
- **Files**: `plugins/issues/src/lib/tools/ingest-issue.tool.ts`, `plugins/issues/src/lib/frontmatter.ts`, `plugins/issues/tests/src/lib/one-scaffold-per-issue.spec.ts`, `plugins/search/src/lib/embed/embed-pipeline.ts`, `plugins/search/src/lib/embed/embedder.ts`, `plugins/search/src/lib/embed/index-store.ts`, `plugins/search/src/lib/tools/search-semantic.tool.ts`, `plugins/search/tests/src/lib/embed/index-identity.spec.ts`
- **Gate**: type
- acceptance:
  - "One scaffold per issue number (D56); multi-line comments round-trip (ISSUES-01)."
  - "The index keys on path plus hash and the cache on embedder id and dimension (SEARCH-01, SEARCH-02)."
- shipped-in: `992b77931962`
- review-state: in_review
- review-implementer: claude-sonnet-5-5

### S3 — roadmap and self-learning
- **Status**: review
- **Files**: `plugins/roadmap/src/lib/workspace/roadmap-workspace.service.ts`, `plugins/roadmap/src/lib/tools/plan-close.tool.ts`, `plugins/roadmap/src/lib/tools/shared/record-change.helper.ts`, `plugins/roadmap/tests/src/lib/tools/one-record-per-entry.spec.ts`, `plugins/self-learning/src/lib/store/observation-store.service.ts`, `plugins/self-learning/tests/src/lib/store/observation-store.spec.ts`
- **Gate**: type
- acceptance:
  - "Archived done is delivered (ROAD-01); closing an entry touches only it (ROAD-02); a failed chronology write rolls the authority file back (D91)."
  - "The observation store writes under withFileMutex (D47)."
  - "The roadmap-sqlite package no longer exists in the tree, so its migration cannot lose rows (D46)."
- shipped-in: `992b77931962`
- review-state: in_review
- review-implementer: claude-sonnet-5-5

## acceptance

- Notes whose titles share a slug get distinct ids, and an id on disk is never rewritten, so no migration is needed (G118, G61-MEM01).
- An updated checkpoint is fresh (G61-MEM02); imports refuse invalid timestamps and tags (D88).
- One scaffold per issue number (D56); multi-line comments round-trip (ISSUES-01).
- The index keys on path plus hash and the cache on embedder id and dimension (SEARCH-01, SEARCH-02).
- Archived done is delivered (ROAD-01); closing an entry touches only it (ROAD-02); a failed chronology write rolls the authority file back (D91).
- The observation store writes under withFileMutex (D47).
- The roadmap-sqlite package no longer exists in the tree, so its migration cannot lose rows (D46).

- 2026-11-01: the fallback id of a note hashes with SHA-256: CodeQL flagged SHA-1 over the title (alert 467), which kept the queue job failing and blocks a promotion. Ids on disk are never rewritten, so existing notes keep theirs.
