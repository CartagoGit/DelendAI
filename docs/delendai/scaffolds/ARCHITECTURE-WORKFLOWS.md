---
applies-to: .github/workflows/*.yml
---

# Architecture: workflows

## Purpose

Workflow files define CI and release behaviour. They must be predictable,
minimal, and auditable.

## Required Shape

- Use explicit permissions.
- Pin risky third-party actions or justify floating versions.
- Keep release side effects in dedicated jobs.
- Prefer repository scripts (`bun run validate`, `bun run build`) over inline
  shell logic.

## Context hygiene for read-only work

- A read-only investigation slice is done once it leaves: distilled findings,
  the smallest supporting evidence set, and any follow-up decision.
- Do not preserve raw exploration by default; compact or drop transient context
  when the slice closes or the task changes.
- If a fact is durable enough to reuse across slices, move it into durable
  memory; otherwise leave it in session-only context.

## Validation

`bun run validate` is the expected local mirror for CI gates.

