---
id: x01023
title: "A republished pull request is retitled and re-summarised by what it ships now"
kind: fix
status: ready
type: proposal
track: trust
date: 2026-11-04
---

# x01023 — A republished pull request is retitled and re-summarised by what it ships now

## goal

On every republish, work publish sets the pull request title and summary to match the final diff and the slices it ships.

## why

External audit (ChatGPT, 2026-11-04, against develop f7f53bf8d), finding 4. Claim: #1735's title still promised what S5 retired. Verified against the forge: #1735 is titled `feat(init): one MCP entry per host, and a migration that removes the duplicate (+3 more)` and its body lists the commits of an earlier push. I read `publication-pull-request.service.ts`: the text is built once, when the pull request is opened (`--title`); x00830 chose the title then. Nothing updates it on a later publish, so a pull request whose scope changed keeps the first promise. Note `gh pr edit` fails here (projects-classic deprecation), so the update goes through the REST API.

## non-goals

- Renaming pull requests no one republished.
- Changing how the first title is chosen (x00830).

## slices

- global_gate: none

### S1 — Publish updates the text of an open pull request
- **Status**: pending
- **Files**: `packages/core/src/lib/work-units/publication-pull-request.service.ts`
- **Gate**: type
- acceptance:
  - "When the publication's pull request is already open, work publish rewrites its title and summary from the final diff and the slices the unit now ships, through the REST API, and reports the change; a spec covers a unit whose scope shrank between two publishes."

## acceptance

- When the publication's pull request is already open, work publish rewrites its title and summary from the final diff and the slices the unit now ships, through the REST API, and reports the change; a spec covers a unit whose scope shrank between two publishes.
