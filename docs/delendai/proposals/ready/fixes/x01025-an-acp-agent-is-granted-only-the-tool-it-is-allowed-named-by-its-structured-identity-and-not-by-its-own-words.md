---
id: x01025
title: "An ACP agent is granted only the tool it is allowed, named by its structured identity and not by its own words"
kind: fix
status: ready
type: proposal
track: general
date: 2026-11-04
---

# x01025 — An ACP agent is granted only the tool it is allowed, named by its structured identity and not by its own words

## goal

A permission request from an ACP agent is allowed only when the structured identity of the operation (tool kind or id) is on the delegated task allow-list; the free-text title is never evidence. An agent package that is not installed is started only after the project has said it may be, with the version the registry pins.

## why

External review in a ChatGPT conversation about develop (the reviewer looked at the repository from 2026-10-20 to 2026-10-29). Remark of 2026-10-23: permittedBy() in acp-invoker.service.ts grants a permission when the allowed tool name appears as a word in the request title, and that title comes from the agent (request.toolCall.title), so a request titled 'Bash: run something after Read' is granted by an allow-list of ['Read']. The remark was repeated on 2026-10-25, 2026-10-27 and 2026-10-29 as unchanged P1. Remark of 2026-10-23: acpLaunchOf() starts a registry agent through 'npx -y <package>', so asking for an agent that is not installed downloads and runs foreign code with no stated trust decision. Verified in the code on develop (3188f9414, 2026-11-04): permittedBy still tests the title with a word-boundary regex (plugins/orchestrator-runner/src/lib/invoke/acp-invoker.service.ts, lines 25-34) and acpLaunchOf still builds ['-y', package] (packages/core/src/lib/shared/acp-client.service.ts, lines 56-60). No proposal covers either; f00783 only extends which clients are found. Product principles (AGENT-BOOTSTRAP section 0): bounded, a refusal the agent cannot talk past; robust.

## non-goals

- Changing the ACP transport or the cancellation design.

## slices

- global_gate: type

### S1 — Permission is decided by the structured operation
- **Status**: pending
- **Files**: `plugins/orchestrator-runner/src/lib/invoke/acp-invoker.service.ts`, `plugins/orchestrator-runner/tests/src/lib/invoke/acp-invoker.service.spec.ts`
- **Gate**: type
- acceptance:
  - "A request whose title names an allowed tool but whose structured operation is another tool is refused."
  - "A request with no structured identity is refused and the refusal says why (deny by default)."
  - "A spec pins a title that holds both an allowed and a forbidden tool name."

### S2 — Starting a package that is not installed needs the project to allow it
- **Status**: pending
- **Files**: `packages/core/src/lib/shared/acp-client.service.ts`, `packages/core/tests/src/lib/shared/acp-client.service.spec.ts`
- **Gate**: type
- acceptance:
  - "An agent that needs npx or uvx to fetch its package starts only when the project allows fetching it; otherwise the refusal names the setting that allows it."
  - "The version run is the one the registry pins, and the run says it came from the network."

## acceptance

- A request whose title names an allowed tool but whose structured operation is another tool is refused.
- A request with no structured identity is refused and the refusal says why (deny by default).
- A spec pins a title that holds both an allowed and a forbidden tool name.
- An agent that needs npx or uvx to fetch its package starts only when the project allows fetching it; otherwise the refusal names the setting that allows it.
- The version run is the one the registry pins, and the run says it came from the network.
