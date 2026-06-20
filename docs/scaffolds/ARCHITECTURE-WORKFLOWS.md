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

## Validation

`bun run validate` is the expected local mirror for CI gates.

