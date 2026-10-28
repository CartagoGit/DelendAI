---
id: x00990
title: "An agent's unit holds it to its proposal's slice, and names a model"
kind: fix
status: ready
type: proposal
track: a00095-consistency
date: 2026-10-28
---

# x00990 — An agent's unit holds it to its proposal's slice, and names a model

## goal

Whoever enters a unit — Claude, Codex, or a Copilot BYOK model — can only implement a slice that is still open, commits under a subject that says what changed, signs with an identity that names a model, and is told when another live unit is changing the same files.

## why

On 2026-10-28 the owner ran three Copilot BYOK agents on a MiniMax account beside this session. Their refs on the forge show:

- `minimax-m3.1-flash-preview` entered `implement/x00722-S1-g1` although x00722 is in `done/`, and committed there a change unrelated to x00722's slice: `packages/core/src/lib/development-policy/project-branches.ts` now reads the config with `parseJsonc`. Nothing refused a unit on a closed proposal, or a commit outside the slice's `Files`.
- That commit's subject is `feat(x00722): commit via slice S1`, written by the commit-policy engine (`composeMessage` in `plugins/commit-policy/src/lib/engine.ts`), which says nothing of the change.
- A second agent signed as `delendai-m3-docs-20261028`, the product's name, a task word and a date, and entered `create/f00794-all-g1`. The identity is only normalised (`normalizeWorkAgentId`), never checked against the models the catalogue knows, so it became a work ref.
- Three live units changed one concern at once: x00989 (the editor's MCP config read as JSONC), f00794 (seven readers of `delendai.config.json` still on `JSON.parse`, `project-branches.ts` among them) and the x00722 commit above, on that very file. No unit was told of the others.

## non-goals

- Judging the content of x00989 or f00794; they go through review as usual.
- The prose language of proposals (bilingual by design).

## slices

- global_gate: type

### S1 — A unit is entered only for an open slice, and stays inside it
- **Status**: pending
- **Files**: `packages/core/src/lib/work-units/work-unit-enter.service.ts`
- **Gate**: type
- acceptance:
  - "work enter --kind=implement on a proposal in done/ (or a slice whose status is done) is refused, naming the proposal's state and the command for a new fix proposal."
  - "A commit in an implement unit that touches a file outside the slice's Files is reported on the unit (work status), naming the file."

### S2 — A slice commit says what changed
- **Status**: pending
- **Files**: `plugins/commit-policy/src/lib/engine.ts`
- **Gate**: type
- acceptance:
  - "The slice event's subject is built from the slice's title (or the paths it staged), never the fixed text `commit via slice`."

### S3 — An identity that names no model is marked unverified
- **Status**: pending
- **Files**: `packages/core/src/lib/work-identity/resolve-work-agent.service.ts`
- **Gate**: type
- acceptance:
  - "An agent id that matches no model of the model catalogue, or carries a date or the product's name, is recorded with an unverified confidence and work status says so; the project's identity policy decides whether it may enter."

### S4 — Units changing the same files hear of each other
- **Status**: pending
- **Files**: `packages/core/src/lib/work-units/work-unit-enter-briefing.service.ts`
- **Gate**: type
- acceptance:
  - "Entering or committing in a unit whose changed files overlap another live unit's lists that unit, its agent and the shared files."

## acceptance

- work enter --kind=implement on a proposal in done/ (or a slice whose status is done) is refused, naming the proposal's state and the command for a new fix proposal.
- A commit in an implement unit that touches a file outside the slice's Files is reported on the unit (work status), naming the file.
- The slice event's subject is built from the slice's title (or the paths it staged), never the fixed text `commit via slice`.
- An agent id that matches no model of the model catalogue, or carries a date or the product's name, is recorded with an unverified confidence and work status says so; the project's identity policy decides whether it may enter.
- Entering or committing in a unit whose changed files overlap another live unit's lists that unit, its agent and the shared files.
