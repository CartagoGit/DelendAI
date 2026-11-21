---
id: x00701
title: "A server behind the checkout says so"
kind: fix
status: done
type: proposal
track: trust
date: 2026-09-27
priority: P1
related: [x00669]
last-transition-id: 329d387a-f8c0-480c-a88f-dc62aa49460d
last-correlation-id: 329d387a-f8c0-480c-a88f-dc62aa49460d
last-transition-from: review
shipped-in:
  - "01ae65ef3"
---

# x00701 — A server behind the checkout says so

## goal

An agent whose delendai server runs older code than the checkout is
told, on every tool result, and told how to apply the current rules.

## why

The host loads delendai's code once, when an agent's session starts.
On 2026-09-27 a swarm of five reviewers kept doing things that had
already been fixed on the integration branch:

- opening pull requests from work refs;
- pushing back finished work refs;
- working without the guards that recognise them.

Each agent's server still ran the code it had booted with, while the
checkout had moved on by dozens of merges. Nothing told the agents; the
owner found out from the branch graph.

## why this design

- **Compare the boot commit with the checkout.** The server records the
  checkout's commit when it starts. A background reading, at most once a
  minute, compares it with the current one. When a source file the
  server runs changed in between (`packages/*/src`, `plugins/*/src`,
  `tools/scripts/host`), the advisory says so. Specs and documents do not
  count.
- **The channel every tool result already carries.** It rides on the
  checkpoint-advisory channel beside the loose-edits advisory (x00669).
  Every agent sees it whatever it calls, deduplicated per checkout
  commit, and its next action names the restart.

## non-goals

- Restarting the server itself. The client owns that process.

## architecture

- `packages/core/src/lib/development-policy/stale-runtime-advisory.ts`
  and its interface.
- `packages/core/src/lib/cli/assemble.ts`: joined to the advisories.

## Slices

- global_gate: none

### S1 — A stale server announces itself

- **Status**: done
- **Gate**: `npx vitest run packages/core/tests/src/lib/development-policy/stale-runtime-advisory.spec.ts`
- **Files**:
  - `packages/core/src/lib/development-policy/stale-runtime-advisory.ts`
  - `packages/core/src/lib/development-policy/stale-runtime-advisory.interface.ts`
  - `packages/core/src/lib/cli/assemble.ts`
  - `packages/core/tests/src/lib/development-policy/stale-runtime-advisory.spec.ts`
- review-state: done
- review-implementer: claude-opus-5-5
- review-reviewer: glm-5.3-max
- review-log: approved by glm-5.3-max — Diff 01ae65ef3 verificado: createStaleRuntimeAdvisory en el canal checkpoint-advisory (assemble.ts); boot head se registra una vez, lectura en background cada 60s max (inFlight evita solape, fallo deja la lectura previa); RUNTIME_PATHS solo fuentes (packages|plugins src, tools/scripts/host) - specs y docs no cuentan; advisory SERVER_BEHIND_CHECKOUT severity strong con dedupeKey por head y nextAction que nombra el reinicio. Acceptance cubierto por 3 specs: cambio fuente -> advisory; solo specs/docs -> silencio; intervalo -> compara checkout. Gate 4/4 verde (0.7s). Sin cambios fuera de los 4 ficheros declarados; no reinicia el server (non-goal respetado).
## dependency graph

None.

## acceptance

- A checkout that moved past the boot commit with a changed runtime
  source yields `SERVER_BEHIND_CHECKOUT` naming the restart. Changes only
  to specs or documents, or no move at all, yield nothing.
