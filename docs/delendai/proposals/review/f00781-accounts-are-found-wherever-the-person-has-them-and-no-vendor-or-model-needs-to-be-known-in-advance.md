---
id: f00781
title: "Accounts are found wherever the person has them, and no vendor or model needs to be known in advance"
kind: feat
status: review
type: proposal
track: architecture
date: 2026-10-21
last-transition-id: 2ea3b636-ef68-4a59-bace-439be4df3d7f
last-correlation-id: 2ea3b636-ef68-4a59-bace-439be4df3d7f
last-transition-from: in-progress
last-transition-at: 2026-10-21T19:21:45.237Z
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
- **Status**: review
- **Files**: `packages/core/src/lib/contracts/interfaces/account-finding.interface.ts`, `packages/core/src/lib/contracts/constants/account-sources.constant.ts`, `packages/core/src/lib/shared/account-sources.service.ts`, `packages/core/src/lib/shared/client-discovery.service.ts`, `packages/core/src/contracts/index.ts`, `plugins/orchestrator-runner/src/lib/contracts/constants/plan-quota-reader.constant.ts`, `packages/core/tests/src/lib/shared/account-sources.service.spec.ts`
- **Gate**: type
- acceptance:
  - "Offers come from five sources, each a reader that returns what it found and why, never a credential value: a client's own provider list (`modelListArgs`, one offer per provider it reaches); credential variable names in the environment (`*_API_KEY`, `*_API_TOKEN`, `*_ACCESS_TOKEN`), offered as `byok-api-key` with that `credentialEnv`; models the editor recorded serving this person's chats, grouped by the vendor their id names; vendor plan tools (`PLAN_QUOTA_READERS`); local OpenAI-compatible endpoints from a data list of ports, asked only with discovery consent."
  - "On the owner's machine the offer lists, besides Claude Code and Codex, the MiniMax providers OpenCode reaches, an account for `MINIMAX_API_KEY`, the MiniMax plan mmx is logged in to, and the vendors of the models Copilot served."
- shipped-in: `fa1c66c069ec`
- review-state: in_review
- review-implementer: claude-opus-5-5

### S2 — What cannot be classified is asked, and the answer is kept
- **Status**: review
- **Files**: `packages/core/src/lib/plugins/account-offers.service.ts`, `packages/core/src/lib/plugins/account-offer-flow.service.ts`, `packages/core/src/lib/plugins/learned-accounts.service.ts`, `packages/core/src/lib/contracts/interfaces/account-offer.interface.ts`, `packages/core/src/cli.ts`, `packages/cli/src/lib/init/account-prompts.service.ts`, `packages/cli/src/lib/init/init-prompts.service.ts`, `packages/cli/src/lib/init/init-accounts-offer.service.ts`, `packages/cli/src/commands/accounts.command.ts`, `packages/core/tests/src/lib/plugins/account-offers.service.spec.ts`, `packages/core/tests/src/lib/plugins/learned-accounts.service.spec.ts`, `packages/cli/src/lib/init/account-prompts.service.spec.ts`, `packages/cli/src/lib/init/init-accounts-offer.service.spec.ts`
- **Gate**: type
- acceptance:
  - "An offer whose vendor, credential mode or billing mode no source can say is not skipped. The person is asked: the vendor in their words, then subscription, prepaid plan, pay-as-you-go or local. A vendor id is normalised to kebab-case and never checked against a list."
  - "The answer is kept in the person's file (a learned classification for that source), so the same finding is classified without asking next time, on every project of that person."
- shipped-in: `fa1c66c069ec`
- review-state: in_review
- review-implementer: claude-opus-5-5

### S3 — Knowledge of clients is data the project or the person extends
- **Status**: review
- **Files**: `packages/core/src/lib/contracts/constants/known-client-schema.constant.ts`, `packages/core/src/lib/contracts/interfaces/declared-client.interface.ts`, `packages/core/src/lib/contracts/constants/personal-layer-schema.constant.ts`, `packages/core/src/lib/shared/known-client.helper.ts`, `packages/core/src/lib/plugins/config-file-schema.ts`, `packages/core/src/lib/plugins/load-config-file.ts`, `packages/core/src/lib/cli/assemble.ts`, `packages/core/schema/delendai.config.schema.json`, `packages/core/tests/src/lib/shared/known-client.helper.spec.ts`
- **Gate**: type
- acceptance:
  - "`delendai.config.json` and the person's file may declare `clients`: entries with the same schema as `KNOWN_CLIENTS` (command, vendor, `loginStatusArgs`, `loginKinds`, `modelListArgs`, `toolScope`, profile variable). They are validated, merged over the built-in ones by command, and used by discovery, the offer and the CLI argv builder."
  - "Adding a client nobody shipped needs one entry in a config file, not a release. A spec adds one only through config and sees it offered."
- shipped-in: `fa1c66c069ec`
- review-state: in_review
- review-implementer: claude-opus-5-5

### S4 — An account's models come from the account
- **Status**: review
- **Files**: `plugins/auto-agent-selector/src/lib/discovery/discover-roster.ts`, `plugins/auto-agent-selector/src/lib/discovery/real-deps.ts`, `plugins/auto-agent-selector/src/lib/discovery/known-cli.helper.ts`, `plugins/auto-agent-selector/src/lib/contracts/constants/known-providers.constant.ts`, `plugins/auto-agent-selector/src/lib/contracts/interfaces/roster.interface.ts`, `packages/core/src/runtime/index.ts`, `plugins/auto-agent-selector/tests/src/lib/discovery/discover-roster.spec.ts`
- **Gate**: type
- acceptance:
  - "Each candidate's models are read from its source: the client's own model list, or the `/v1/models` a local server answers. They are recorded on the roster's candidates. Every variable named like a credential is a candidate; the old eight-vendor list only lends labels and cost tiers. No list of model names is consulted to decide whether a model exists or may be routed to."
  - "A model id never seen before is routed like any other, ranked by the outcome store (f00768) from its first hop."
- shipped-in: `fa1c66c069ec`
- review-state: in_review
- review-implementer: claude-opus-5-5

## acceptance

- Offers come from five sources, each a reader that returns what it found and why, never a credential value: a client's own provider list (`modelListArgs`, one offer per provider it reaches); credential variable names in the environment (`*_API_KEY`, `*_API_TOKEN`, `*_ACCESS_TOKEN`), offered as `byok-api-key` with that `credentialEnv`; models the editor recorded serving this person's chats, grouped by the vendor their id names; vendor plan tools (`PLAN_QUOTA_READERS`); local OpenAI-compatible endpoints from a data list of ports, asked only with discovery consent.
- On the owner's machine the offer lists, besides Claude Code and Codex, the MiniMax providers OpenCode reaches, an account for `MINIMAX_API_KEY`, the MiniMax plan mmx is logged in to, and the vendors of the models Copilot served.
- An offer whose vendor, credential mode or billing mode no source can say is not skipped. The person is asked: the vendor in their words, then subscription, prepaid plan, pay-as-you-go or local. A vendor id is normalised to kebab-case and never checked against a list.
- The answer is kept in the person's file (a learned classification for that source), so the same finding is classified without asking next time, on every project of that person.
- `delendai.config.json` and the person's file may declare `clients`: entries with the same schema as `KNOWN_CLIENTS` (command, vendor, `loginStatusArgs`, `loginKinds`, `modelListArgs`, `toolScope`, profile variable). They are validated, merged over the built-in ones by command, and used by discovery, the offer and the CLI argv builder.
- Adding a client nobody shipped needs one entry in a config file, not a release. A spec adds one only through config and sees it offered.
- Each account's models are read from its source: the client's model list, an OpenAI-compatible `/v1/models` asked with the account's own environment, or the models seen serving it. They are recorded in the roster with that provenance. No list of model names is consulted to decide whether a model exists or may be routed to.
- A model id never seen before is routed like any other, ranked by the outcome store (f00768) from its first hop.
