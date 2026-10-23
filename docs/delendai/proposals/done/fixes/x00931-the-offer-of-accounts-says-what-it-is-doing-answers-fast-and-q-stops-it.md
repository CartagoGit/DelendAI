---
id: x00931
title: "The offer of accounts says what it is doing, answers fast, and q stops it"
kind: fix
status: done
type: proposal
track: general
date: 2026-10-21
last-transition-id: 750053ef-3488-4ad2-9d04-704c02d1cc6c
last-correlation-id: 750053ef-3488-4ad2-9d04-704c02d1cc6c
last-transition-from: review
last-transition-at: 2026-10-23T16:34:57.325Z
shipped-in:
  - "ea7d45b1ba61"
---

# x00931 — The offer of accounts says what it is doing, answers fast, and q stops it

## goal

`delendai accounts offer` (and the offer at the end of init) prints what it is looking at from its first moment, reads its sources in parallel so the first question comes within a few seconds, and treats `q` as an answer: it stops asking, and keeps what was answered.

## why

The owner, 2026-10-21: `delendai accounts offer` 'se queda bloqueado y solo puedo salir con la q', then Ctrl-C.

Measured under a pty the same day: the first output came after 8.6 s. Each probe was fast (`claude auth status` 0.37 s, `opencode models` 1.8 s, `mmx auth status` 0.17 s, every `command -v` about 50 ms), but the plan tools, the providers of each client and the two local ports (1.5 s timeout each) were read one after another, and nothing was printed meanwhile. It was not stuck; it looked stuck. Most of those seconds were not the offer at all: every CLI command except `init`, `guard` and `migrate` starts a full MCP server before it runs (`delendai accounts nope` took 5.4 s, `--version` 0.4 s), and `accounts` never talks to it. Once a question was on screen, `q` was not an answer: `askConfirm` asked again, so the person's way out was Ctrl-C, which threw away every answer given.

## non-goals

- Changing what is found or how it is classified (f00781).

## slices

- global_gate: type

### S1 — Progress, parallel sources, and q
- **Status**: done
- **Files**: `packages/cli/src/contracts/interfaces/cli-command.interface.ts`, `packages/cli/src/index.ts`, `packages/cli/src/commands/registry.ts`, `packages/cli/src/lib/init/init-prompts.service.ts`, `packages/cli/src/lib/init/account-prompts.service.spec.ts`, `packages/core/src/lib/shared/account-sources.service.ts`, `packages/core/src/lib/plugins/account-offer-flow.service.ts`, `packages/cli/src/lib/init/account-prompts.service.ts`, `packages/cli/src/commands/accounts.command.ts`, `packages/cli/src/lib/init/init-accounts-offer.service.ts`
- **Gate**: type
- acceptance:
  - "The offer reports each step as it starts (clients, plan tools, local servers, the providers clients reach, credential variables, models seen) through an `onProgress` the CLI prints to stderr before any probe runs."
  - "The plan tools, the local endpoints and the providers of each client are read in parallel. On the owner's machine (measured under a pty) the first line comes at 0.4 s and the first question at 4.2 s, against 8.6 s and 12.9 s before; what is left is the clients' own answers (`opencode models` 1.8 s)."
  - "A command that never calls the server declares `offline` and runs without starting one: every CLI command started a full MCP server first (5.4 s for `accounts nope`; 0.5 s now)."
  - "At any question, `q` (or `quit`) stops the questions: what was already answered is written, everything left is listed as not asked, and the command exits 0."
- shipped-in: `ea7d45b1ba61`
- review-state: done
- review-implementer: claude-opus-5-5
- review-reviewer: minimax-m3.1-flash-preview
- review-log: approved by minimax-m3.1-flash-preview — verified at ea7d45b1ba61, validate exit 0, tests 10/10; acceptance 4/4: (1) The offer tells each step as it starts through an `onProgress` the CLI prints to stderr: the flow takes `onProgress?: ((step: IOfferStep) => void)` and calls i… (2) The plan tools, the local endpoints and the providers of each client are read together: `gatherFindings` awaits one `Promise.all` over `findingsFromPlanTools`,… (3) A command that never calls the server declares it and runs without starting one: the command contract carries `readonly offline?: boolean` (packages/cli/src/co… (4) `q` or `quit` stops the questions: `askConfirmOrStop` answers 'stop', `accountPromptsOn` sets `stopped` and every later question returns `undefined` - the answ… — Gate is `type`: `bun run typecheck` exits 0 in this worktree. Verified: the offer reports each step as it starts through an `onProgress` the CLI prints to stderr before any probe runs; the plan tools, the local endpoints and the providers of each client are read in parallel (the timing figures in the criterion are the owner's own measurement under a pty - what is verified here is the parallelism behind them); a command that never calls the server declares `offline` and runs without starting one; and `q`/`quit` stops the questions, writing what was answered and listing the rest as not asked, exiting 0. The slice's spec passes 10/10. Delivery: the slice's commit is ea7d45b1ba61.

## acceptance

- The offer reports each step as it starts (clients, plan tools, local servers, the providers clients reach, credential variables, models seen) through an `onProgress` the CLI prints to stderr before any probe runs.
- The plan tools, the local endpoints and the providers of each client are read in parallel. On the owner's machine (measured under a pty) the first line comes at 0.4 s and the first question at 4.2 s, against 8.6 s and 12.9 s before; what is left is the clients' own answers (`opencode models` 1.8 s).
- At any question, `q` (or `quit`) stops the questions: what was already answered is written, everything left is listed as not asked, and the command exits 0.
