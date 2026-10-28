---
id: x00988
title: "Batuta can delegate on a fresh machine: consent, roster and costs are told apart"
kind: fix
status: ready
type: proposal
track: general
date: 2026-10-28
---

# x00988 — Batuta can delegate on a fresh machine: consent, roster and costs are told apart

## goal

An orchestrator that has never used Batuta on this machine finds the right tool by its summary, gets the person's consent through whatever channel the host has, and receives a roster whose providers differ by what they cost and which model they serve, so the first `invoke` delegates instead of answering `no-providers`.

## why

Dogfooding on 2026-10-28 (Claude Code in VS Code, develop at b8e13bb8d), trying to hand light work to a cheaper model:

- `tool_search` for the orchestrator-runner plugin listed thirteen tools, each with the summary "Orchestrator-runner runtime utilities.": a lazy plugin's tools carry the plugin's summary (`assemble-plugins.ts`), so no search finds `invoke` by what it does, and the same holds for every lazy plugin.
- `discover_providers` answered `declined` at once, twice, without anything being shown: the host advertises elicitation and returns a decline it never displayed. The person, asked in the chat, said yes, and nothing in the product could record that answer.
- With consent, the proposals all carried `costTier: 3`, OpenCode's free models included; the MiniMax entries named `MiniMax-M2.1` (the catalogue's first model) while OpenCode reported `MiniMax-M3` and `MiniMax-M3.1-Flash` from the same account; every `authTier` was null.
- `get_quota` describes its snapshot as written "by the bootstrap/quota layer in a later slice", though f00767 and f00773 shipped that observation, and `accounts` returned an empty list: what an account has left is never reached when no account is declared.

f00793 makes the roster detected at server start; this proposal makes what is detected usable for choosing, and the way to it findable.

## non-goals

- Detecting the roster at start-up (f00793).
- Installing a missing client.

## slices

- global_gate: type

### S1 — A lazy tool is listed with its own summary
- **Status**: pending
- **Files**: `packages/core/src/lib/cli/assemble-plugins.ts`
- **Gate**: type
- acceptance:
  - "tool_search over an inactive plugin shows each tool's own one-line summary, generated from its registered description, and no two tools of orchestrator-runner share one."

### S2 — Consent that the host cannot ask is asked another way
- **Status**: pending
- **Files**: `plugins/orchestrator-runner/src/lib/services/discovery-consent.service.ts`
- **Gate**: type
- acceptance:
  - "An elicitation the host declines without showing (no response content, immediate) is reported as `unavailable`, not `declined`."
  - "`delendai providers consent --yes|--no` records the person's answer in the same record the elicitation writes."

### S3 — Proposals differ by cost and serve the models the client lists
- **Status**: pending
- **Files**: `plugins/orchestrator-runner/src/lib/services/acp-roster.service.ts`, `plugins/orchestrator-runner/src/lib/tools/discover.tool.ts`
- **Gate**: type
- acceptance:
  - "A model a client lists as free is proposed with the lowest cost tier; a provider's proposed model is one its own client lists, when it lists any."
  - "get_quota's description and note name the observation that fills it, and say what to declare when it is empty."

## acceptance

- tool_search over an inactive plugin shows each tool's own one-line summary, generated from its registered description, and no two tools of orchestrator-runner share one.
- An elicitation the host declines without showing (no response content, immediate) is reported as `unavailable`, not `declined`.
- `delendai providers consent --yes|--no` records the person's answer in the same record the elicitation writes.
- A model a client lists as free is proposed with the lowest cost tier; a provider's proposed model is one its own client lists, when it lists any.
- get_quota's description and note name the observation that fills it, and say what to declare when it is empty.
