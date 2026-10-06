# AGENT.md — plugin `plugins/skills-pack`

> Below the `<!-- delendai:begin agent-md -->
## Purpose

- Curated skill pack (debugging, perf, pr-review, security, incident, migration).

## Public API

- DEBUGGING_PLAYBOOK_SKILL
- INCIDENT_RESPONSE_SKILL
- MIGRATE_FROM_X_SKILL
- PERFORMANCE_OPTIMIZATION_SKILL
- PR_REVIEW_CHECKLIST_SKILL
- SECURITY_HARDENING_CHECKLIST_SKILL
- SKILLS_PACK_SKILLS
- default

## Depends on

- zod
- @delendai/core

## Writes

- <host workspace>/.delendai/cache/skills-pack/

## Entry points

- ./dist/index.js
- src/index.ts (default export → IMcpPlugin)

## Tests

- plugins/skills-pack/src/skills/skills.spec.ts

## Do not

- An agent does not run `git stash`: git refuses it for agents (`delendai guard`, reference-transaction), because every worktree shares one stash and stashed work is invisible to the work model. Commit, or checkpoint to your work ref, instead.
- Do not hand-edit content between `<!-- delendai:begin -->`/`<!-- delendai:end -->` markers; regenerate via the owning `gen:*` script instead.
- Do not import `@delendai/core/lib/...`; use `@delendai/core/public`.
- Do not run user-facing shell or destructive tools without `dryRunSupported: true`.
- Do not surface absolute host paths; use `workspaceRoot`-relative paths only.

## Token hotspots

_(none)_

<!-- delendai:end agent-md -->

