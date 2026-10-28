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
- **Files**: `packages/core/src/lib/cli/assemble-plugins.ts`, `tools/scripts/generate/managed-lazy-catalog.script.ts`, `packages/core/src/lib/plugins/managed-lazy-catalog.generated.ts`, `packages/core/tests/src/lib/plugins/managed-lazy-catalog-lookup.spec.ts`
- **Gate**: type
- acceptance:
  - "tool_search over an inactive plugin shows each tool's own one-line summary, generated from its registered description, and no two tools of orchestrator-runner share one."

### S2 — Consent that the host cannot ask is asked another way
- **Status**: pending
- **Files**: `plugins/orchestrator-runner/src/lib/services/discovery-consent.service.ts`, `plugins/orchestrator-runner/tests/src/lib/services/discovery-consent.service.spec.ts`, `packages/core/src/lib/contracts/constants/discovery-consent.constant.ts`, `packages/core/src/lib/contracts/interfaces/discovery-consent-answer.interface.ts`, `packages/core/src/lib/shared/discovery-consent-record.service.ts`, `packages/core/src/runtime/index.ts`, `packages/core/src/cli.ts`, `packages/core/src/contracts/index.ts`, `packages/cli/src/commands/accounts.command.ts`, `packages/cli/src/commands/accounts.command.spec.ts`
- **Gate**: type
- acceptance:
  - "A decline from the host, or a host that cannot ask, names `delendai accounts consent --yes|--no` as the way to answer, and a recorded answer of either kind is used without asking again (a host that declines on its own cannot be told from a person who said no)."
  - "`delendai accounts consent --yes|--no` records the person's answer in the same record the elicitation writes."

### S3 — Proposals differ by cost and serve the models the client lists
- **Status**: pending
- **Files**: `plugins/orchestrator-runner/src/lib/services/acp-roster.service.ts`, `plugins/orchestrator-runner/src/lib/contracts/interfaces/acp-roster.interface.ts`, `plugins/orchestrator-runner/src/lib/contracts/constants/cost-tier.constant.ts`, `plugins/orchestrator-runner/src/lib/tools/discover.tool.ts`, `plugins/orchestrator-runner/tests/src/lib/services/acp-roster.service.spec.ts`, `plugins/orchestrator-runner/src/lib/tools/get-quota.tool.ts`, `apps/web/src/i18n/tools/orchestrator-runner/delendai_orchestrator-runner_get_quota.ts`, `packages/core/src/lib/contracts/interfaces/account-finding.interface.ts`, `packages/core/src/lib/shared/model-catalogue.service.ts`, `packages/core/tests/src/lib/shared/model-catalogue.service.spec.ts`, `packages/core/src/lib/contracts/constants/public-catalogues.constant.ts`, `packages/core/data/model-catalogue.snapshot.json`
- **Gate**: type
- acceptance:
  - "A model the catalogue prices at nothing is proposed in the lowest cost tier and a priced one by its price (the catalogue keeps each model's price, format 4); a provider's proposed model is the first its own client lists that the catalogue knows."
  - "get_quota's description and note name the observation that fills it, and say what to declare when it is empty."

## acceptance

- tool_search over an inactive plugin shows each tool's own one-line summary, generated from its registered description, and no two tools of orchestrator-runner share one.
- A decline from the host, or a host that cannot ask, names `delendai accounts consent --yes|--no` as the way to answer, and a recorded answer of either kind is used without asking again (a host that declines on its own cannot be told from a person who said no).
- `delendai accounts consent --yes|--no` records the person's answer in the same record the elicitation writes.
- A model the catalogue prices at nothing is proposed in the lowest cost tier and a priced one by its price (the catalogue keeps each model's price, format 4); a provider's proposed model is the first its own client lists that the catalogue knows.
- get_quota's description and note name the observation that fills it, and say what to declare when it is empty.
