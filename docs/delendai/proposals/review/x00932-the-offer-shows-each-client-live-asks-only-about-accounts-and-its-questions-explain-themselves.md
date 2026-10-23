---
id: x00932
title: "The offer shows each client live, asks only about accounts, and its questions explain themselves"
kind: fix
status: review
type: proposal
track: general
date: 2026-10-21
last-transition-id: 79265957-d3c5-41cf-8e27-9df12e29326e
last-correlation-id: 79265957-d3c5-41cf-8e27-9df12e29326e
last-transition-from: in-progress
last-transition-at: 2026-10-21T12:58:47.911Z
shipped-in:
  - "2e17683d0556"
---

# x00932 — The offer shows each client live, asks only about accounts, and its questions explain themselves

## goal

While `delendai accounts offer` asks the machine's clients, a person sees which client it is waiting for and for how long, and each one's answer as it comes. A multi-provider client is not offered as an account: the providers it reaches are. Every question says what it wants, with an example, and what the default means.

## why

The owner, 2026-10-21, after x00931: the offer sat at 'the AI clients installed here, and how each is logged in' with nothing moving - 'sin algo visual que me diga que esta cargando o un temporizador... no sabemos si sigue o esta buscando' - and went on a while later. A step line printed once says nothing about a step that takes seconds; cold starts of the clients vary (`claude auth status` 0.9 s, `opencode auth list` 1.3 s, `opencode --version` 1.0 s warm, longer cold).

The first question was then about OpenCode itself: 'Found OpenCode (CLI), as logged in on this machine: ┌  Credentials ~/.local/share/opencode/auth.json - Who is it with? [multi]', and the owner did not know what to answer. OpenCode is not an account: it reaches other vendors' accounts, each already a finding of its own. The evidence line carried OpenCode's TUI box character, and the suggested vendor `multi` is the catalogue's internal word for a multi-provider client.

## non-goals

- Changing what is found (f00781) or making the clients themselves answer faster.

## slices

- global_gate: type

### S1 — Live progress per client
- **Status**: done
- **Files**: `packages/core/src/lib/contracts/interfaces/known-client.interface.ts`, `packages/core/src/contracts/index.ts`, `packages/cli/src/contracts/interfaces/init-offer.interface.ts`, `packages/cli/src/lib/init/offer-progress.service.spec.ts`, `packages/cli/src/lib/init/init-accounts-offer.service.spec.ts`, `packages/core/src/lib/shared/client-discovery.service.ts`, `packages/core/src/lib/plugins/account-offer-flow.service.ts`, `packages/cli/src/lib/init/offer-progress.service.ts`, `packages/cli/src/commands/accounts.command.ts`, `packages/cli/src/lib/init/init-accounts-offer.service.ts`
- **Gate**: type
- acceptance:
  - "`discoverClients` reports each installed client as it starts and when it answers (verdict and milliseconds) through an optional callback."
  - "At a terminal, the CLI keeps one live line on stderr - the clients still being asked, with a running seconds counter, refreshed several times a second - and prints a line per client as it answers (`claude: logged in, 0.9 s`). Without a terminal it prints plain lines and no control characters."
- shipped-in: `2e17683d0556`
- review-state: done
- review-implementer: claude-opus-5-5
- review-reviewer: minimax-m3.1-flash-preview
- review-log: approved by minimax-m3.1-flash-preview — verified at 2e17683d0556, validate exit 0, tests 14/14; acceptance 2/2: (1) `discoverClients` reports each installed client as it starts and when it answers, with the verdict and the milliseconds, through an optional callback: the opti… (2) At a terminal the CLI keeps one live line on stderr with the clients still being asked and a running seconds counter, refreshed several times a second, and pri… — Gate is `type`: `bun run typecheck` exits 0 in this worktree. Verified: the discovery reports each client as it starts and as it answers, with the verdict and the milliseconds; at a terminal the CLI keeps one live line with the pending clients and a running seconds counter refreshed every 120 ms and prints a line per answer, and without a terminal it prints plain lines with no control characters; The slice's specs pass 14/14. Delivery: the slice's commit is 2e17683d0556.

### S2 — Only accounts are offered, and the questions explain themselves
- **Status**: review
- **Files**: `packages/core/src/lib/shared/account-sources.service.ts`, `packages/core/src/lib/shared/client-discovery.service.ts`, `packages/cli/src/lib/init/account-prompts.service.ts`, `packages/cli/src/commands/accounts.command.ts`, `packages/cli/src/lib/init/account-prompts.service.spec.ts`, `packages/core/tests/src/lib/shared/client-discovery.service.spec.ts`, `packages/core/tests/src/lib/plugins/account-offers.service.spec.ts`
- **Gate**: type
- acceptance:
  - "A client that reaches several vendors (it lists models per provider) is not a finding of its own; its providers are."
  - "Evidence lines carry no box-drawing or other TUI characters."
  - "The vendor question says what is meant - who bills you for it, with examples - and the payment question explains each choice; the suggestion is never an internal catalogue word."
  - "A person who answered at a terminal reads a summary (added, declined, not asked yet), not the JSON; `--json` and a terminal-less run still print the data."
- shipped-in: `2e17683d0556`
- review-state: in_review
- review-implementer: claude-opus-5-5

## acceptance

- `discoverClients` reports each installed client as it starts and when it answers (verdict and milliseconds) through an optional callback.
- At a terminal, the CLI keeps one live line on stderr - the clients still being asked, with a running seconds counter, refreshed several times a second - and prints a line per client as it answers (`claude: logged in, 0.9 s`). Without a terminal it prints plain lines and no control characters.
- A client that reaches several vendors (it lists models per provider) is not a finding of its own; its providers are.
- Evidence lines carry no box-drawing or other TUI characters.
- The vendor question says what is meant - who bills you for it, with examples - and the payment question explains each choice; the suggestion is never an internal catalogue word.
