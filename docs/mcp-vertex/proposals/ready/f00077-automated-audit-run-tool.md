---
id: f00077
status: ready
type: proposal
track: plugins/audit+ci+docs
date: 2026-06-28
kind: feat
title: Automated audit run tool (Alcance B) — implement audit_run with LLM fan-out, auto-consolidation, and automatic proposal scaffolding
runner: unknown
model: unknown
scope: audit-automation
shipped-in: []
related:
    - f00006 # multi-model audit plugin (Alcance A predecessor)
    - x00076 # quick wins from 2026-06-28 audit
acceptance:
    - { command: bun run validate, expect: exit0 }
    - { command: bun run lint:proposals, expect: exit0 }
---

# f00077 — Automated audit run tool (Alcance B)

## goal

Implement the **Alcance B** (automation layer) of the `@mcp-vertex/audit` plugin. This introduces a new tool, `audit_run`, which automatically dispatches the audit brief to multiple configured LLM providers in parallel, saves their markdown reports, consolidates the findings, and automatically scaffolds corresponding proposal files in `proposals/ready/` for any open findings.

## why

Currently, the audit plugin implements Alcance A (read-only plan and consolidation). Running audits requires manual copy-pasting of briefs to different models, saving their reports, and manually designing/writing the resulting proposals in the backlog. This creates operational friction, leaks token usage if not optimized, and leads to human errors (like ghost proposal references or missing proposal files). 

Automating this flow via `audit_run` allows:
1. One-command audits across different models (Gemini, Claude, GPT-4) using direct API keys or OpenRouter.
2. Low token overhead by scoping briefs and leveraging lightweight JSON schemas.
3. Closed-loop remediation where the audit immediately populates the project backlog with properly scaffolded proposal files.

## non-goals

- No change to the existing `audit_plan` or `audit_consolidate` core logic.
- No direct implementation of fixing code; this tool only creates the proposals in the backlog, leaving the actual code modifications to implementation agents.

## slices

### S1 — Tool Registration and Input Schema

Register `${prefix}_audit_run` in `plugins/audit/src/lib/tools/audit-run.tool.ts`. Design the input schema to accept a list of model identifiers, a target scope (default: `full`), optional API keys, and configurations for proposal scaffolding.

- **Status**: pending
- **Files**:
    - `plugins/audit/src/index.ts`
    - `plugins/audit/src/lib/tools/audit-run.tool.ts` [NEW]
- **Gate**: bun run validate

### S2 — API Client and Parallel Fan-out

Implement stateless HTTP clients for OpenRouter, Anthropic, Google, and OpenAI. The tool dispatches the plan brief to the selected models concurrently, awaits their markdown responses with a timeout, and writes them with conventional filenames under `docs/mcp-vertex/proposals/done/audits/`.

- **Status**: pending
- **Files**:
    - `plugins/audit/src/lib/services/llm-client.service.ts` [NEW]
    - `plugins/audit/src/lib/tools/audit-run.tool.ts`
- **Gate**: bun run validate

### S3 — Proposal Scaffolder & Writer

Extend the service layer to automatically map deduplicated findings (from the consolidation step) into ready-to-run proposal templates. For each finding of severity `FATAL`, `MUY_MAL`, or `MEJORABLE`, the system writes a new proposal file in `docs/mcp-vertex/proposals/ready/` with:
- An allocated proposal ID (using the registry's next available prefix).
- Pre-filled frontmatter (`status: ready`, `kind: fix`, `related: [aNNNNN]`).
- Scaffolded slices based on the finding's file references.

- **Status**: pending
- **Files**:
    - `plugins/audit/src/lib/services/proposal-scaffolder.service.ts` [NEW]
    - `plugins/audit/src/lib/tools/audit-run.tool.ts`
- **Gate**: bun run validate

### S4 — E2E Spec Coverage

Write tests using mocked HTTP endpoints for the LLM providers to verify the complete loop: invoking `audit_run` dispatches mock prompts, parses their mock responses, updates the master consolidated report, and successfully writes proposal files to a temporary sandbox directory.

- **Status**: pending
- **Files**:
    - `plugins/audit/tests/src/lib/tools/audit-run.tool.spec.ts` [NEW]
- **Gate**: bun run test

## acceptance

- `bun run validate` passes successfully.
- `bun run lint:proposals` returns 0 fatal errors.
