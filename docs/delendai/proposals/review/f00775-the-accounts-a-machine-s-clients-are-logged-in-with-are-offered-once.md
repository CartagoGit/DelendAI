---
id: f00775
title: "The accounts a machine's clients are logged in with are offered once"
kind: feat
status: review
type: proposal
track: architecture
date: 2026-10-20
related:
  - q00034
  - f00765
  - f00766
last-transition-id: fc0324ef-bd20-4dba-93b8-c5bdf90d0af0
last-correlation-id: fc0324ef-bd20-4dba-93b8-c5bdf90d0af0
last-transition-from: in-progress
last-transition-at: 2026-10-20T09:02:01.793Z
---

# f00775 — The accounts a machine's clients are logged in with are offered once

## goal

This is q00034 S6. `init` and `delendai accounts offer` offer the person the accounts their logged-in clients suggest, one by one:

- a yes goes to their own project file (f00765), never the committed configuration, with unattended work off;
- a no is remembered, so that account is not asked again;
- nothing is written without an answer.

## why

The owner, 2026-10-19: "use my accounts on my computer… add configuration to delendai config, and give that option in init or the migrations", with each person keeping their own configuration.

f00766 already knows which clients are installed and logged in. Nothing turned that into an account, so the runner had none to route to (q00034 S7 waits on this).

An account needs a credential mode and a billing mode. A guessed billing mode is how a paid key gets spent as if it were a subscription. Each client's own status answer says which mode it is in. These are the answers given on 2026-10-20 on the owner's machine:

| Command | Answer | Read as |
|---|---|---|
| `claude auth status` | `"authMethod": "claude.ai"` | a subscription login |
| `codex login status` | `Logged in using ChatGPT` | a subscription login |
| `opencode auth list` | lists API credentials per provider | does not say how they bill |

A client whose answer says neither is not offered.

## non-goals

- Turning automation on. That is the person's step, per account.
- An offer at MCP server start-up. A server has no terminal, and an elicitation on every start would ask strangers' sessions. `delendai accounts offer` is the way back to it.
- Accounts of tools that are not coding clients (mmx). They are declared by hand; f00773 reads their quota.

## slices

- global_gate: type

### S1 — What a login says, and the offers it makes

- **Status**: review
- **Files**: `packages/core/src/lib/contracts/interfaces/known-client.interface.ts`, `packages/core/src/lib/contracts/constants/known-clients.constant.ts`, `packages/core/src/lib/shared/client-discovery.service.ts`, `packages/core/src/lib/plugins/account-offers.service.ts`, `packages/core/tests/src/lib/shared/client-discovery.service.spec.ts`, `packages/core/tests/src/lib/plugins/account-offers.service.spec.ts`
- **Gate**: type
- acceptance:
  - "`IKnownClient.loginKinds` maps a status answer to a credential and billing mode (Claude Code: `authMethod` `claude.ai` or console/API key; Codex: ChatGPT or an API key). `discoverClients` reports `login` for a usable client whose answer matches."
  - "`accountOffers` offers one account per usable client with a `login`: id `<vendor>-<command>`, its own quota group, `permittedAutomation: false`. It skips an id or a vendor + credential mode already declared, and an id the person declined."
- shipped-in: `0f7057e778d9`
- review-state: in_review
- review-implementer: claude-opus-5-5

### S2 — One writer of the personal file, and the flow

- **Status**: review
- **Files**: `packages/core/src/lib/contracts/interfaces/personal-addition.interface.ts`, `packages/core/src/lib/contracts/interfaces/account-offer.interface.ts`, `packages/core/src/lib/contracts/constants/personal-layer-schema.constant.ts`, `packages/core/src/lib/plugins/personal-layer-writer.service.ts`, `packages/core/src/lib/plugins/account-offer-flow.service.ts`, `packages/core/src/lib/workspace-migration/migrators/personal-accounts.migrator.ts`, `packages/core/src/lib/shared/client-command-runner.service.ts`, `packages/core/src/runtime/index.ts`, `packages/core/src/cli.ts`, `plugins/auto-agent-selector/src/lib/discovery/real-deps.ts`, `packages/core/tests/src/lib/plugins/personal-layer-writer.service.spec.ts`
- **Gate**: type
- acceptance:
  - "`addToPersonalLayer` (and `mergeIntoPersonalLayer`, for a caller holding the mutex) is the only writer of the personal file. It adds only what is new, keeps what the person declared, writes `0600` in a `0700` folder, refuses a file that does not parse, and refuses (writing nothing) a result the schema would not read back. The personal-accounts migration writes through it."
  - "The personal file may hold `declinedOffers`."
  - "`offerFoundAccounts` discovers (with the person's consent: they started it), offers, and writes yeses and noes in one write. An unanswered offer is only listed."
  - "The catalogue command runner moves from the selector into core (`runClientCommand`); the selector and the offer both use it."
- shipped-in: `0f7057e778d9`
- review-state: in_review
- review-implementer: claude-opus-5-5

### S3 — The command and init

- **Status**: review
- **Files**: `packages/cli/src/commands/accounts.command.ts`, `packages/cli/src/commands/registry.ts`, `packages/cli/src/commands/registry.spec.ts`, `packages/cli/src/contracts/constants/help-translation.constant.ts`, `packages/cli/src/contracts/interfaces/init-offer.interface.ts`, `packages/cli/src/lib/init/init-prompts.service.ts`, `packages/cli/src/lib/init/init-accounts-offer.service.ts`, `packages/cli/src/commands/init/init.command.ts`, `packages/cli/src/commands/accounts.command.spec.ts`, `packages/cli/src/lib/init/init-accounts-offer.service.spec.ts`, `packages/cli/src/lib/init/init-prompts.service.spec.ts`, `tools/scripts/lint/cli-ui-parity.map.json`
- **Gate**: type
- acceptance:
  - "`delendai accounts offer [--yes]` asks per account in a terminal (`--yes` answers yes to all). Without either, it lists and writes nothing."
  - "A successful interactive `init` ends with the same offer. A terminal-less init offers nothing."
- shipped-in: `0f7057e778d9`
- review-state: in_review
- review-implementer: claude-opus-5-5

## acceptance

- The specs of S1–S3 pass.
- `delendai accounts offer` on the owner's machine without a terminal listed `anthropic-claude` and `openai-codex` (both subscription logins) and wrote nothing. Done 2026-10-20.
