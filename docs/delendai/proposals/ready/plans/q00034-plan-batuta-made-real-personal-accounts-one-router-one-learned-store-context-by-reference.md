---
id: q00034
title: "Plan — Batuta made real: personal accounts, one router, one learned store, context by reference"
kind: plan
status: ready
type: plan
track: batuta
date: 2026-10-18
priority: P1
---

# q00034 — Batuta made real: personal accounts, one router, one learned store, context by reference

## goal

delendai runs work on the accounts a person really has, chooses for each task the model and account that do it best for what is left to spend, and hands every worker exactly the context its task needs from sources all workers share. One rule per concern, read by every plugin that touches it; no token is ever read, copied or shown.

## why

f00551 built the parts (account registry, consented discovery, isolated environments, quota reservations, a hop journal) against simulated processes, and its S7 waits for real runs that cannot happen. Asked to use the owner's machine on 2026-10-18, five facts stood in the way:

1. **Accounts are in the committed configuration.** `accounts` lives at the root of `delendai.config.json`, with a person's `profileDir`. A project several people work on cannot hold one person's accounts, and two people may use the same vendor differently: one through a subscription, the other through a key.
2. **Nothing says whether an account can be used.** Discovery reports a client as installed and logged in; OpenCode is installed on this machine with no paid plan, and nothing would tell it apart from a working one. Copilot holds BYOK models (qwen, glm) and GPT-5.4 behind its own configuration, which delendai must use through Copilot and never read.
3. **Nothing writes quota observations.** The runner refuses a hop on an unknown quota (unknown is never unlimited), so every unattended hop is refused: no real run is possible.
4. **Three components choose a model and three keep what was learned.** `auto-agent-selector` (`rank-providers`, a calibration store of win rates), `orchestrator-runner` (its own scoring against capability hints) and `adaptive-optimizer` (candidate scoring) each rank; `self-learning`, `prompt-eval`'s calibration writes and `usage-tracking`'s cost log each keep observations. Discovery is implemented twice (`auto-agent-selector/src/lib/discovery`, `orchestrator-runner/src/lib/healthcheck` and `tools/discover.tool.ts`). f00551 S0 already asked to "reuse existing selectors"; nothing unified them.
5. **A worker gets no defined context.** Nothing bounds what a delegated hop receives. Workers on different vendors share no context, so the cheap failure is the expensive one: each worker re-reads or is sent the whole conversation, spending its quota before doing the task.

## non-goals

- Reading, copying, logging or committing any credential. A credential is reached only through the vendor's own client and login, or named by an environment variable the person sets.
- A new orchestrator, CLI or daemon: this unifies what exists.

## slices

- global_gate: type

Each slice becomes its own proposal before implementation, with its files, specs and acceptance reconciled against the code at that time.

### S1 — Accounts are personal, local and layered

- **Status**: pending
- **Files**: `packages/core/src/lib/plugins/account-registry.helper.ts`, `packages/core/src/lib/plugins/load-config-file.ts`, `packages/core/src/lib/platform/user-directories.helper.ts`
- **Gate**: type
- acceptance:
  - "A person's accounts live outside the repository, in a per-user, per-project file under the user configuration root (`userConfigRoot`), never committed; the committed configuration may declare only what the project shares (recommended providers, policies, an optional shared account a team agrees on)."
  - "The two layers merge by one documented rule: the personal entry for an account id wins, so the same account can be a subscription for one person and a key for another; `delendai --check` names the layer each value came from."
  - "A start-up migration moves `accounts` and personal provider fields (`profileDir`, `credentialEnv`) from `delendai.config.json` to the personal file, journalled, leaving the shared part in place."

### S2 — One discovery that knows whether an account can work

- **Status**: pending
- **Files**: `plugins/orchestrator-runner/src/lib/healthcheck/probe.ts`, `plugins/auto-agent-selector/src/lib/discovery/real-deps.ts`
- **Gate**: type
- acceptance:
  - "One discovery service answers for every consumer: installed, version, logged in, and usable (`usable`, `needs-login`, `needs-plan`, `quota-exhausted`, `unknown`), with the evidence for each; `auto-agent-selector` and `orchestrator-runner` call it and keep no probe of their own."
  - "A client installed without a paid plan (OpenCode on 2026-10-18) reads `needs-plan` from the vendor's own answer, not from a guess; models a host client exposes through its configuration (Copilot's BYOK and hosted models) are listed by id through that client, and no value of that configuration is read."

### S3 — Quota and budget are observed, not assumed

- **Status**: pending
- **Files**: `plugins/orchestrator-runner/src/lib/services/quota-reservation.service.ts`, `plugins/orchestrator-runner/src/lib/quota.ts`
- **Gate**: type
- acceptance:
  - "Every hop records what the vendor said about what is left (rate-limit headers, usage commands, limit errors) as a dated observation of the account's quota groups; a person may declare a budget per account in the personal layer (requests per window, or money)."
  - "With an observation or a declared budget, unattended hops run within it; with neither, they are refused as today. The runner's choice states what remained and why that hop fit."

### S4 — One router and one learned store

- **Status**: pending
- **Files**: `plugins/auto-agent-selector/src/lib/routing/rank-providers.ts`, `plugins/auto-agent-selector/src/lib/calibrate/store.ts`, `plugins/orchestrator-runner/src/lib/invoke/build-manager.ts`
- **Gate**: type
- acceptance:
  - "One store keeps, per task kind, model and account: outcome against the task's own acceptance, tokens in and out, cost (measured, estimated or included in a plan, marked as which), latency and retries. `prompt-eval`, `self-learning` and the runner's journal write to it; `usage-tracking` correlates with it instead of keeping costs of its own."
  - "One ranking reads it, with what is left on each account (S3), and every consumer (`auto-agent-selector`, `orchestrator-runner`, `adaptive-optimizer`) asks it; a choice names its evidence (the observations it rests on, or that it had none)."

### S5 — A worker gets the context its task needs, by reference

- **Status**: pending
- **Files**: `plugins/agent-orchestrator/src/lib/dispatch/port-resolution.helper.ts`, `plugins/context-for-change/src/index.ts`
- **Gate**: type
- acceptance:
  - "A delegated hop receives a bounded task pack: the slice, its acceptance, the files it may touch, the conventions it must follow, and the `context_for_change` result, under a byte budget the router sets per model; never the parent's conversation."
  - "Shared knowledge (memory, project context, the agent catalog, the work model) is named in the pack by reference and read through the same tools by every worker, so no worker holds a private copy that can drift; the pack's bytes and the hop's tokens are recorded in the S4 store."

### S6 — init and start-up offer the accounts found

- **Status**: pending
- **Files**: `packages/core/src/lib/install/ide-targets.ts`
- **Gate**: type
- acceptance:
  - "`init`, and a start-up migration in a project already using delendai, offer the accounts S2 found, once, through the host's consent; a yes writes the personal layer (S1) only, with automation off until the person turns it on per account."

### S7 — Real, consented runs feed the measurement

- **Status**: pending
- **Files**: `docs/delendai/batuta/guide.md`
- **Gate**: type
- acceptance:
  - "With the owner's accounts declared (S1, S6), at least one real hop per usable account runs through the runner, and its journal entry, quota observation and S4 record exist; the guide's 'Not proved yet' section lists what has now been proved and what has not. This is the evidence f00551 S7 waits for."

## acceptance

- A person can declare their own accounts without committing them, delendai tells which can work and how much is left, picks per task by measured results, and gives each worker only its task's context, from sources every worker shares.
