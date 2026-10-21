---
id: f00781
title: "Accounts are found wherever the person has them, and no vendor or model needs to be known in advance"
kind: feat
status: ready
type: proposal
track: architecture
date: 2026-10-21
---

# f00781 — Accounts are found wherever the person has them, and no vendor or model needs to be known in advance

## goal

The offer of accounts (f00775, f00779) finds every account a person has on the machine, whatever its vendor, client or model: providers a multi-provider client reaches (OpenCode, Continue, Aider), credential variables in the environment (named, never read), models the editor has seen serve the person's chats (Copilot with BYOK qwen, glm, MiniMax, mimo, Meta or Microsoft models), vendor plan tools (mmx) and local OpenAI-compatible endpoints. What delendai cannot classify is asked, never dropped, and the answer is kept for next time. Knowledge of clients becomes data the project or the person can extend without a release, so a model or client nobody has heard of works the day it appears.

## why

The owner, 2026-10-21: the offer assumes Claude Code and Codex, but there could be many more models, or many more per client - qwen, mimo, glm, minimax, Meta's, Microsoft's, and others nobody knows yet.

On the owner's machine on 2026-10-21 `delendai accounts offer` listed only anthropic-claude and openai-codex. At the same time:
- `opencode models` reached five MiniMax providers (minimax, minimax-cn, minimax-coding-plan, minimax-cn-coding-plan, minimaxm3), two of them coding plans;
- the environment held `MINIMAX_API_KEY` (name only, value never read);
- mmx was logged in to the MiniMax plan;
- Copilot served qwen, glm and MiniMax through BYOK. Copilot keeps BYOK models in its secret storage (`chatLanguageModels.json` is empty), but the editor records which model served each chat request, and delendai already reads that record for identity (`hostChatModel`).

None of these became an offer. The cause is structural, not a missing entry: `accountOffers` only knows clients in `KNOWN_CLIENTS`, and only those whose status answer matches a hand-written `loginKinds` pattern. Anything else is skipped silently. Every new vendor or client would need a code change and a release - the catalogue pattern f00777 removes for identity.

## non-goals

- Reading a credential's value. Sources report names, providers and models only; a credential stays where it is and is referenced by its variable or client profile.
- Probing anything outside the machine, or anything at all without the discovery consent the person already gives.
- Choosing the model for a task. That is the router (f00768), which reads what this proposal records.

## slices

- global_gate: type

### S1 — Every source of accounts is read, none by vendor
- **Status**: pending
- **Files**: `packages/core/src/lib/shared/client-discovery.service.ts`, `packages/core/src/lib/plugins/account-offers.service.ts`, `packages/core/src/lib/work-identity/host-chat-model.helper.ts`, `plugins/orchestrator-runner/src/lib/contracts/constants/plan-quota-reader.constant.ts`
- **Gate**: type
- acceptance:
  - "Offers come from five sources, each a reader that returns what it found and why, never a credential value: a client's own provider list (`modelListArgs`, one offer per provider it reaches); credential variable names in the environment (`*_API_KEY`, `*_API_TOKEN`, `*_ACCESS_TOKEN`), offered as `byok-api-key` with that `credentialEnv`; models the editor recorded serving this person's chats, grouped by the vendor their id names; vendor plan tools (`PLAN_QUOTA_READERS`); local OpenAI-compatible endpoints from a data list of ports, asked only with discovery consent."
  - "On the owner's machine the offer lists, besides Claude Code and Codex, the MiniMax providers OpenCode reaches, an account for `MINIMAX_API_KEY`, the MiniMax plan mmx is logged in to, and the vendors of the models Copilot served."

### S2 — What cannot be classified is asked, and the answer is kept
- **Status**: pending
- **Files**: `packages/core/src/lib/plugins/account-offer-flow.service.ts`, `packages/core/src/lib/contracts/constants/personal-layer-schema.constant.ts`, `packages/cli/src/commands/accounts.command.ts`
- **Gate**: type
- acceptance:
  - "An offer whose vendor, credential mode or billing mode no source can say is not skipped. The person is asked: the vendor in their words, then subscription, prepaid plan, pay-as-you-go or local. A vendor id is normalised to kebab-case and never checked against a list."
  - "The answer is kept in the person's file (a learned classification for that source), so the same finding is classified without asking next time, on every project of that person."

### S3 — Knowledge of clients is data the project or the person extends
- **Status**: pending
- **Files**: `packages/core/src/lib/contracts/constants/known-clients.constant.ts`, `packages/core/src/lib/contracts/constants/provider-entry-schema.constant.ts`, `packages/core/src/lib/shared/known-client.helper.ts`
- **Gate**: type
- acceptance:
  - "`delendai.config.json` and the person's file may declare `clients`: entries with the same schema as `KNOWN_CLIENTS` (command, vendor, `loginStatusArgs`, `loginKinds`, `modelListArgs`, `toolScope`, profile variable). They are validated, merged over the built-in ones by command, and used by discovery, the offer and the CLI argv builder."
  - "Adding a client nobody shipped needs one entry in a config file, not a release. A spec adds one only through config and sees it offered."

### S4 — An account's models come from the account
- **Status**: pending
- **Files**: `plugins/auto-agent-selector/src/lib/discovery/discover-roster.ts`, `plugins/orchestrator-runner/src/lib/services/account-status.service.ts`
- **Gate**: type
- acceptance:
  - "Each account's models are read from its source: the client's model list, an OpenAI-compatible `/v1/models` asked with the account's own environment, or the models seen serving it. They are recorded in the roster with that provenance. No list of model names is consulted to decide whether a model exists or may be routed to."
  - "A model id never seen before is routed like any other, ranked by the outcome store (f00768) from its first hop."

## acceptance

- Offers come from five sources, each a reader that returns what it found and why, never a credential value: a client's own provider list (`modelListArgs`, one offer per provider it reaches); credential variable names in the environment (`*_API_KEY`, `*_API_TOKEN`, `*_ACCESS_TOKEN`), offered as `byok-api-key` with that `credentialEnv`; models the editor recorded serving this person's chats, grouped by the vendor their id names; vendor plan tools (`PLAN_QUOTA_READERS`); local OpenAI-compatible endpoints from a data list of ports, asked only with discovery consent.
- On the owner's machine the offer lists, besides Claude Code and Codex, the MiniMax providers OpenCode reaches, an account for `MINIMAX_API_KEY`, the MiniMax plan mmx is logged in to, and the vendors of the models Copilot served.
- An offer whose vendor, credential mode or billing mode no source can say is not skipped. The person is asked: the vendor in their words, then subscription, prepaid plan, pay-as-you-go or local. A vendor id is normalised to kebab-case and never checked against a list.
- The answer is kept in the person's file (a learned classification for that source), so the same finding is classified without asking next time, on every project of that person.
- `delendai.config.json` and the person's file may declare `clients`: entries with the same schema as `KNOWN_CLIENTS` (command, vendor, `loginStatusArgs`, `loginKinds`, `modelListArgs`, `toolScope`, profile variable). They are validated, merged over the built-in ones by command, and used by discovery, the offer and the CLI argv builder.
- Adding a client nobody shipped needs one entry in a config file, not a release. A spec adds one only through config and sees it offered.
- Each account's models are read from its source: the client's model list, an OpenAI-compatible `/v1/models` asked with the account's own environment, or the models seen serving it. They are recorded in the roster with that provenance. No list of model names is consulted to decide whether a model exists or may be routed to.
- A model id never seen before is routed like any other, ranked by the outcome store (f00768) from its first hop.
