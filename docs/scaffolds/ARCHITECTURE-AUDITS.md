---
applies-to: docs/proposals/**/a*.md
---

# Architecture: audits

## Purpose

Audits are a special kind of proposal (prefix `a`, kind `audit`) designed to evaluate a scope of the codebase, document findings, and specify the resolution tracks for those findings. By modeling audits as proposals, we track their execution, review, and validation through the standard proposal lifecycle.

## Filename Convention

Every audit must follow the exact filename structure:
`{numAuditoria}-{DD}-{MM}-{YYYY}-{controladorModelo}-{modelo}-{queSeHaAuditado}.md`

Where:
- `numAuditoria` is the chronological identifier (e.g., `a021`).
- `DD`, `MM`, `YYYY` is the day, month, and 4-digit year (e.g., `21-06-2026`).
- `controladorModelo` is the client/runner driving the model (e.g., `antigravity`, `claude-code`, `codex`, `copilot`).
- `modelo` is the AI model used (e.g., `deepmind`, `gpt-5-5`, `opus-4-8`).
- `queSeHaAuditado` describes the audited scope (e.g., `repositorio`, `plugins`, `apps`, `web`, `extensionvscode`).

## Required Shape

An audit proposal must be structured with the following metadata and sections:

### 1. Frontmatter
Must include standard proposal frontmatter with `kind: audit`, `id: aNNN`, and the appropriate status/track:
```yaml
---
id: a021
kind: audit
title: "Auditoría Independiente — [Revisor] ([Modelo])"
status: ready # or in-progress, review, done
date: YYYY-MM-DD
track: archive # or the specific component track being audited
ownership:
  - { agent: implementation_runner, task: 's1: Execute audit and document findings' }
acceptance:
  - { command: bun run validate, expect: exit0 }
---
```

### 2. Required Sections (in canonical order)

- **`## Goal`**: Contains the scope of the audit, date of execution, audited HEAD commit hash, and the revisor/model.
- **`## Why`**: Contains the audit verdict (estimated score, overall health evaluation in one phrase/paragraph).
- **`## Non-goals`**: Explicitly states what is out of scope for the audit.
- **`## Slices`**: The slices of work that can be resolved *within the audit itself* (e.g. S1 for audit execution, S2..SN for immediate fixes/cleanups done during the audit).
- **`## Acceptance`**: Standard acceptance criteria for closing the audit.
- **`## Verified State`**: Quantitative facts about the codebase state during validation (LOC, test count, coverage, Biome warnings, build commands, etc.).
- **`## Findings`**: A prioritized list/table of findings with severity, description, file references, and **Resolution Track** (separating what is resolved in the audit's own slices from what is deferred to individual proposals).
- **`## Scoreboard`**: A tabular evaluation of different dimensions (e.g. Core, Plugins, Concurrency, Security) with a score out of 10 and detailed comments.

### 3. Optional Sections
- **`## Notes`**: Any additional context or remarks.

---

## Separation of Resolutions (Slices vs. Proposals)

Every finding in `## Findings` must declare a **Resolution Track**:
1. **Resolved in Audit Slices**: If the fix is minor, trivial, or directly manageable during the audit, it should be mapped to a slice (e.g., `S2 — fix Biome deprecation warning`) and resolved before the audit is closed.
2. **Deferred to Individual Proposals**: If the fix is a larger feature, significant refactoring, or a complex bug, it must be split into a separate, new proposal (e.g., `f00120`, `x00122`) and linked as a follow-up.

### Lifecycle & Status Rules

- **Pending Tasks**: If the audit has tasks or slices to be executed within its own scope, the proposal must be created under `docs/proposals/ready/` with `status: ready` and all slices set to `pending`.
- **No Internal Tasks**: If the audit has no internal tasks (e.g., all findings are deferred to separate proposals, or there are no findings), the audit should be created directly under `docs/proposals/done/audits/` with `status: done` and reference/link the deferred proposals.

---

## Template

Use the following template to create new audit proposals:

```markdown
---
id: aNNN
kind: audit
title: "Auditoría — [Revisor/Model]"
status: ready
date: YYYY-MM-DD
track: archive
ownership:
  - { agent: implementation_runner, task: 's1: Execute audit and document findings' }
acceptance:
  - { command: bun run validate, expect: exit0 }
---

# aNNN — Auditoría — [Revisor/Model]

## Goal

- **Audited Scope**: [e.g. packages/core and plugins/proposals]
- **Audited HEAD**: [e.g. `0f54f33`]
- **Revisor / Model**: [e.g. Gemini 3.5 Flash]
- **Date**: YYYY-MM-DD

## Why

[Write the Verdict in a single sentence/paragraph, highlighting the overall status and quality score, e.g. 9.2/10.]

## Non-goals

- [Describe what is NOT covered by this audit]

## Slices

- global_gate: lint

### s1 — Execute audit and document findings
- files: docs/proposals/in-progress/aNNN-auditoria-[slug].md
- gate: lint
- status: pending

### s2 — [Immediate Fix Description]
- files: [files to modify]
- gate: lint
- status: pending

## Acceptance

- `bun run validate` is green (exit code 0).
- All immediate fixes (S2..) are implemented and verified.
- The audit report is fully documented and synchronized.

## Verified State

| Aspect | Metric / Command | Result / Count |
|---|---|---|
| LOC | count LOC | ~20,000 LOC |
| Test suite | `bun run test` | 441 tests passed |
| Biome lint | `biome ci` | 0 errors, 1 warning |

## Findings

| ID | Severity | Description | Files | Resolution Track |
|---|---|---|---|---|
| H1 | P0 | [Description of severe issue] | [file link](file:///...) | Resolved in slice `s2` |
| H2 | P1 | [Description of medium issue] | [file link](file:///...) | Deferred to Proposal `xNNN` |

## Scoreboard

| Dimension | Score | Comments |
|---|---:|---|
| Core Packages | 9.5 | Excellent design |
| Plugins | 8.8 | Some minor síncrono I/O |
| Security | 7.0 | Lacks some controls |
| **Total (Average)** | **8.4** | **Solid foundation** |
```

## Validation

Run `bun run lint:proposals` to ensure the audit proposal conforms to the sections, frontmatter, and canonical order.
Run `bun run lint:scaffolds` to ensure this scaffold stays discoverable and well-formed.
