---
id: x00931
title: "The offer of accounts says what it is doing, answers fast, and q stops it"
kind: fix
status: in-progress
type: proposal
track: general
date: 2026-10-21
---

# x00931 — The offer of accounts says what it is doing, answers fast, and q stops it

## goal

`delendai accounts offer` (and the offer at the end of init) prints what it is looking at from its first moment, reads its sources in parallel so the first question comes within a few seconds, and treats `q` as an answer: it stops asking, and keeps what was answered.

## why

The owner, 2026-10-21: `delendai accounts offer` 'se queda bloqueado y solo puedo salir con la q', then Ctrl-C.

Measured under a pty the same day: the first output came after 8.6 s. Each probe was fast (`claude auth status` 0.37 s, `opencode models` 1.8 s, `mmx auth status` 0.17 s, every `command -v` about 50 ms), but the plan tools, the providers of each client and the two local ports (1.5 s timeout each) were read one after another, and nothing was printed meanwhile. It was not stuck; it looked stuck. Once a question was on screen, `q` was not an answer: `askConfirm` asked again, so the person's way out was Ctrl-C, which threw away every answer given.

## non-goals

- Changing what is found or how it is classified (f00781).

## slices

- global_gate: type

### S1 — Progress, parallel sources, and q
- **Status**: pending
- **Files**: `packages/core/src/lib/shared/account-sources.service.ts`, `packages/core/src/lib/plugins/account-offer-flow.service.ts`, `packages/cli/src/lib/init/account-prompts.service.ts`, `packages/cli/src/commands/accounts.command.ts`, `packages/cli/src/lib/init/init-accounts-offer.service.ts`
- **Gate**: type
- acceptance:
  - "The offer reports each step as it starts (clients, plan tools, local servers, the providers clients reach, credential variables, models seen) through an `onProgress` the CLI prints to stderr before any probe runs."
  - "The plan tools, the local endpoints and the providers of each client are read in parallel. On the owner's machine the first question comes in under 4 s, against 8.6 s before."
  - "At any question, `q` (or `quit`) stops the questions: what was already answered is written, everything left is listed as not asked, and the command exits 0."

## acceptance

- The offer reports each step as it starts (clients, plan tools, local servers, the providers clients reach, credential variables, models seen) through an `onProgress` the CLI prints to stderr before any probe runs.
- The plan tools, the local endpoints and the providers of each client are read in parallel. On the owner's machine the first question comes in under 4 s, against 8.6 s before.
- At any question, `q` (or `quit`) stops the questions: what was already answered is written, everything left is listed as not asked, and the command exits 0.
