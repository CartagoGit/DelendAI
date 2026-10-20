---
id: f00779
title: "One command sets up a person's accounts, with nothing edited by hand"
kind: feat
status: in-progress
type: proposal
track: architecture
date: 2026-10-20
related:
  - f00775
  - q00034
---

# f00779 — One command sets up a person's accounts, with nothing edited by hand

## goal

Anyone using the project on their own machine reaches working accounts with one command and plain yes/no answers.

`delendai accounts offer` asks, for each account it adds, whether unattended work may use it. `delendai accounts automation <id> on|off` changes that later. No step asks the person to find a file and edit JSON.

## why

The owner, 2026-10-20, about the step f00775 left: "así complicado que sea de uso fácil para cualquier persona que quiera usar el proyecto en otros ordenadores que no sea yo mismo".

f00775 wrote every offered account with `permittedAutomation: false`. Turning it on meant locating `<user configuration root>/delendai/projects/<key>.json` and editing it. Only someone who already knew the layout could do that.

## non-goals

- Turning automation on without the person's answer. `--yes` adds accounts but keeps automation off unless `--allow-automation` is also given, for scripted setups that mean it.
- Changing a shared account. One the project declares is the team's, in `delendai.config.json`.

## slices

- global_gate: type

### S1 — Ask, and change later by id

- **Status**: in-progress
- **Files**: `packages/core/src/lib/plugins/account-offer-flow.service.ts`, `packages/core/src/lib/plugins/personal-layer-writer.service.ts`, `packages/core/src/cli.ts`, `packages/cli/src/commands/accounts.command.ts`, `packages/cli/src/commands/registry.ts`, `packages/cli/src/lib/init/init-accounts-offer.service.ts`, `docs/delendai/batuta/guide.md`, `packages/core/tests/src/lib/plugins/account-offers.service.spec.ts`, `packages/cli/src/commands/accounts.command.spec.ts`, `packages/cli/src/commands/registry.spec.ts`, `packages/cli/src/lib/init/init-accounts-offer.service.spec.ts`
- **Gate**: type
- acceptance:
  - "`offerFoundAccounts` takes `askAutomation`. An added account is written with `permittedAutomation` true only on that yes; when nothing asks, it stays off."
  - "`setAccountAutomation` turns an account of the person's file on or off, under the file's mutex. It reports whether anything changed, and refuses an account the file does not hold, naming the command that adds it."
  - "`delendai accounts offer` asks both questions at a terminal, and `init` does the same. `--yes` adds accounts with automation off; `--yes --allow-automation` adds them with automation on."
  - "`delendai accounts automation <id> on|off` exits 2 on bad usage and 3 for an account the file does not hold."
  - "The Batuta guide opens its accounts section with these two commands."

## acceptance

- The specs of S1 pass.
