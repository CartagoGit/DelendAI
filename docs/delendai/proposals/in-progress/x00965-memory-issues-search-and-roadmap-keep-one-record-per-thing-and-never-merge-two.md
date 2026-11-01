---
id: x00965
title: "Memory, issues, search and roadmap keep one record per thing and never merge two"
kind: fix
status: in-progress
type: proposal
track: a00095-consistency
date: 2026-10-23
last-transition-id: 7ca3925d-5e4e-435a-9f66-b0a5bf398836
last-correlation-id: 7ca3925d-5e4e-435a-9f66-b0a5bf398836
last-transition-from: review
last-transition-at: 2026-11-01T17:25:57.357Z
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
- **Status**: review
- **Files**: `plugins/memory/src/lib/services/store-records.ts`, `plugins/memory/src/lib/services/checkpoint-freshness.ts`, `plugins/memory/src/lib/services/store-portable.ts`, `plugins/memory/src/lib/tools/checkpoint-packet.tool.ts`, `plugins/memory/src/lib/tools/tools.ts`, `plugins/memory/tests/src/lib/one-record-per-note.spec.ts`
- **Gate**: type
- acceptance:
  - "Notes whose titles share a slug get distinct ids, and an id on disk is never rewritten, so no migration is needed (G118, G61-MEM01)."
  - "An updated checkpoint is fresh (G61-MEM02); imports refuse invalid timestamps and tags (D88)."
- shipped-in: `992b77931962`
- review-state: in_review
- review-implementer: claude-sonnet-5-5

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
