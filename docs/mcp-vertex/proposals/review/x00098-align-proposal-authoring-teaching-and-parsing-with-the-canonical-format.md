---
id: x00098
title: "Align proposal authoring, teaching and parsing with the canonical format"
kind: fix
status: review
type: proposal
track: general
date: 2026-07-12
---

# x00098 — Align proposal authoring, teaching and parsing with the canonical format

## Goal

Make the three proposal surfaces agree on the one canonical format the repo
linter enforces: `parseProposalSlicePlan` must parse canonical `**Files**`
lists, `create_proposal` must emit lint-canonical documents into the right
status folder, and `get_proposal_workflow` must teach the real format.

## why

- `parseProposalSlicePlan` captures a single `\S+` token per `**Files**`
  line, so the canonical comma/backtick/bracket lists used by every real
  proposal parse as ONE mangled path — disjointness checks, lock derivation
  and slice statuses all see wrong file sets.
- `create_proposal` output fails `lint:proposals` (no frontmatter `title`,
  `in_progress` underscore status, missing `## why`/`## non-goals`/
  `## acceptance`, non-canonical slice bullets, file written to the
  proposals root instead of the status folder) — f00109 and f00111 had to
  be hand-rewritten. The board tool's actionable filter also compares
  against underscore statuses, so `in-progress` proposals drop out.
- `get_proposal_workflow` teaches a fossilized template (`status: todo`,
  `budget: 1`, `p<n>` ids) — the direct cause of a consumer-project agent
  hand-inventing its own proposal scheme instead of using the tools.

## non-goals

- Changing the repo lint script (`tools/scripts/lint/proposals.script.ts`)
  — it stays the validator; the plugin converges on it.
- Migrating existing proposal documents.
- Changing the slice state machine or review flow.

## Slices

- global_gate: e2e

### S1 — Parser: canonical **Files** lists (brackets, commas, backticks)
- **Status**: in-progress
- **Files**: `plugins/proposals/src/lib/swarm/proposal-slice-plan.ts`, `plugins/proposals/tests/src/lib/swarm/proposal-slice-plan.spec.ts`
- **Gate**: bun run validate
- status: done
### S2 — Generator: lint-canonical documents, hyphen statuses, status folder, board filter
- **Status**: pending
- **DependsOn**: S1
- **Files**: `plugins/proposals/src/lib/tools/authoring.tool.ts`, `plugins/proposals/tests/src/lib/authoring.spec.ts`
- **Gate**: bun run validate
- status: done
### S3 — Teacher: get_proposal_workflow returns the real canonical template and rules
- **Status**: pending
- **DependsOn**: S2
- **Files**: `plugins/proposals/src/lib/knowledge/proposal-workflow.ts`, `plugins/proposals/tests/src/lib/knowledge/proposal-workflow.spec.ts`
- **Gate**: bun run validate
- status: done
## acceptance

- `parseProposalSlicePlan` splits `- **Files**: `a`, `b`` and
  `- **Files**: [a, b]` into individual trimmed paths; repeated
  `- files: <path>` lines keep working byte-identically.
- `create_proposal` output passes `tools/scripts/lint/proposals.script.ts`
  as written: frontmatter `title`, hyphenated status, `## why` /
  `## non-goals` / `## acceptance` sections, canonical slice bullets, file
  created under the status folder (`ready/`, `in-progress/`, …).
- The board actionable filter matches hyphenated statuses.
- `get_proposal_workflow` template/naming/rules mirror the canonical format
  (zero-padded ids, real statuses, status folders, `**Status**` flips).
- `bun run validate` green.
