---
id: f00773
title: "A plan's quota is read from the vendor's own tool before the first hop"
kind: feat
status: in-progress
type: proposal
track: architecture
date: 2026-10-20
related:
  - q00034
  - f00767
  - f00772
---

# f00773 — A plan's quota is read from the vendor's own tool before the first hop

## goal

When a vendor ships a tool that says what is left of a plan without spending any of it, the quota hold asks that tool before the first hop on the account. It records the answer for the account's quota groups. The first such reader is MiniMax's `mmx quota show`.

## why

The owner, 2026-10-19: "habrá que calcular cuánto se gasta de cada LLM para poder ir repartiendo el trabajo y que duren todos lo máximo posible… para MiniMax… podría ser con mmx".

Until now f00767 recorded a group's windows only from what a hop returned: rate-limit headers, or a 429. An account that had not run a hop yet had no observation. Its hold refused it unless it declared `budgets`, so the router could not choose between accounts on what each had left.

`mmx` 1.0.28 answers `mmx quota show --output json` with the general pool's 5-hour and weekly windows, as percentages left with their end times. The call is free: the interval usage count stayed at 0 after the call. Read through the new service on 2026-10-20 against the owner's real plan, it recorded 100 % left in the 5-hour window (resets 10:00Z) and 73 % left in the week (resets 2026-10-26).

mmx is not a coding client, so it is not added to `KNOWN_CLIENTS`. Discovery would offer it as a worker. It goes in the runner's own `PLAN_QUOTA_READERS`, keyed by account vendor.

## non-goals

- Readers for vendors whose tools expose no free quota answer. Codex, Claude Code and Copilot are left to hop answers and `budgets`.
- Routing on the readings. That is the q00034 router (f00768), which reads the same snapshot.

## slices

- global_gate: type

### S1 — The hold asks the plan before the first hop

- **Status**: in-progress
- **Files**: `plugins/orchestrator-runner/src/lib/contracts/interfaces/plan-quota-reader.interface.ts`, `plugins/orchestrator-runner/src/lib/contracts/constants/plan-quota-reader.constant.ts`, `plugins/orchestrator-runner/src/lib/services/plan-quota.service.ts`, `plugins/orchestrator-runner/src/lib/services/plan-quota-runner.service.ts`, `plugins/orchestrator-runner/src/lib/services/quota-reservation.service.ts`, `plugins/orchestrator-runner/src/lib/services/quota-sink.service.ts`, `plugins/orchestrator-runner/src/lib/invoke/build-manager.ts`, `plugins/orchestrator-runner/src/index.ts`, `plugins/orchestrator-runner/tests/src/lib/quota.spec.ts`, `plugins/orchestrator-runner/tests/src/lib/services/plan-quota.service.spec.ts`, `plugins/orchestrator-runner/tests/src/lib/services/quota-reservation.service.spec.ts`, `docs/delendai/batuta/guide.md`
- **Gate**: type
- acceptance:
  - "`parseMmxModelRemains` turns the general pool into an `hourly` window (the 5-hour one, with its real `resetAt`) and a `weekly` one, unit `subscription-usage`, limit 100, `used` = 100 − percent left. An unreadable answer yields nothing."
  - "`observePlanQuota` runs the reader in the environment `accountEnvironment` gives the account. It records the windows for the account's groups. It never throws, and records nothing for a vendor with no reader, a refused account, a non-zero exit or an empty parse."
  - "The reader runs through the CLI seam the hops use (`nodeCliSpawner`), not a second process adapter. A deadline kills it. A command that cannot start (ENOENT) ends as an exit with no code: the seam did not listen for `error`, so a hop on a missing CLI threw out of the server."
  - "`quotaSinkFor` moves to its own file (`quota-sink.service.ts`), which keeps the reservation service under 400 lines."
  - "`quotaHoldFor` calls `observe` when no group of the account has an observation fresher than `freshForMs`, re-reads the snapshot, and judges the hop on it. A fresh observation is not re-asked."

## acceptance

- The specs of S1 pass.
- A live read against a real MiniMax plan records both windows. Done on 2026-10-20 with the owner's account; numbers above.
