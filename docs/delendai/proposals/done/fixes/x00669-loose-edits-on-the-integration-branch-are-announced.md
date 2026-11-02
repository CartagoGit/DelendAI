---
id: x00669
title: "Loose edits on the integration branch are announced"
kind: fix
status: done
type: proposal
track: trust
date: 2026-09-26
priority: P1
related: [x00653, x00645]
last-transition-id: c8201e9f-438b-4649-828d-0db4e7952e3c
last-correlation-id: c8201e9f-438b-4649-828d-0db4e7952e3c
last-transition-from: review
shipped-in:
  - "d0a3607ed5f8a1089391b0d64bc55afd1972c0f0"
---

# x00669 — Loose edits on the integration branch are announced

## goal

While the shared checkout sits on the integration branch under a
work-ref policy and has uncommitted changes, every tool result says so.
It names the changes, why they are at risk, and what to do.

## why

x00653's guard stops delendai's own tools from writing into that
checkout, but an agent's shell is outside it. On 2026-09-26 a reviewer
(GLM) moved proposal files there with shell commands. Nothing it called
afterwards mentioned it, and the changes would have been committed by
nobody. x00645 reports such paths, but only to an agent that runs
`work status` itself, and the agent that made them never does.

## why this design

- **The checkpoint-advisory channel.** Plugins already attach
  advisories to tool results through `_meta`, which MCP clients do not
  validate against a tool's output schema. Core adds its own provider
  next to the plugins' providers, so every agent calling any tool sees
  the advisory, whoever made the change.
- **The guard's own condition.** The advisory speaks only where
  `integrationCheckoutRefusal` would refuse a write: the shared
  checkout, on the integration branch, under a policy with work refs,
  and not a CI runner's copy. Anywhere else, editing is the project's
  model and nothing is said.
- **Tool calls never wait on git.** The provider answers from the last
  reading and starts a new one in the background at most every 30 s.
  The advisory's dedupe key is the set of changed paths, so it repeats
  only when that set changes.
- **It says what to do, not who did it.** The advisory cannot know
  which agent made a change. Its next action is to redo your own changes
  in your unit, and to leave anyone else's alone and tell their owner.

## non-goals

- Refusing or reverting the changes: they may be another agent's only
  copy.
- Attributing them to an agent.

## architecture

- `packages/core/src/lib/development-policy/loose-edits-advisory.ts`
  (+ `.interface.ts`)
- `packages/core/src/lib/cli/assemble.ts`: joins the provider to the
  plugins' providers.

## Slices

- global_gate: none

### S1 — Core announces loose edits on every tool result

- **Status**: done
- **Gate**: `npx vitest run packages/core/tests/src/lib/development-policy/loose-edits-advisory.spec.ts`
- **Files**:
  - `packages/core/src/lib/development-policy/loose-edits-advisory.ts`
  - `packages/core/src/lib/development-policy/loose-edits-advisory.interface.ts`
  - `packages/core/src/lib/cli/assemble.ts`
  - `packages/core/tests/src/lib/development-policy/loose-edits-advisory.spec.ts`
- review-state: done
- review-implementer: claude-opus-5-5
- review-reviewer: glm-5.3-max
- review-log: approved by glm-5.3-max — Revisé la entrega real d0a3607ed. Los edits sueltos sobre la integración SE ANUNCIAN: en el shared checkout sobre la integración bajo política work-ref, un tracked file cambiado produce el advisory LOOSE_EDITS_ON_INTEGRATION nombrándolo; fuera de ese checkout o con el árbol limpio no se dice nada; una tool call nunca espera a git (la lectura tiene como mucho un intervalo de antigüedad — muestreo en background). loose-edits-advisory 123 líneas + spec 140; assemble cableado. Acceptance cubierta; gate 22/22 en lote. Sin cambios fuera de alcance.
## dependency graph

None.

## acceptance

- In the shared checkout on the integration branch under a work-ref
  policy, a changed tracked file produces a `LOOSE_EDITS_ON_INTEGRATION`
  advisory naming it.
- Outside that checkout, or when it is clean, nothing is said.
- A tool call never waits on git, and a reading is at most one interval
  old.
