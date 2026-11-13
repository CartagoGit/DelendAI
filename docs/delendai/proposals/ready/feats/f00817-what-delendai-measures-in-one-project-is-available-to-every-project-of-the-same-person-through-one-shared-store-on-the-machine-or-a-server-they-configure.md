---
id: f00817
title: "What delendai measures in one project is available to every project of the same person, through one shared store on the machine or a server they configure"
kind: feat
status: ready
type: proposal
track: general
date: 2026-11-13
---

# f00817 — What delendai measures in one project is available to every project of the same person, through one shared store on the machine or a server they configure

## goal

A person who runs delendai in many projects gets one shared body of measured knowledge. What is measured in one project (which model, subagent or Batuta route is cheapest and correct for a task class) is available to every other project of the same person, through one store configured once: a directory on the machine (`local`) or a server the person hosts (`remote`). Only project-agnostic records leave a project, through a single schema-validated redaction allow-list. The auto-agent-selector and Batuta read cached rollups of that store to rank the enabled agents by cost per correct result, fall back to project-local data and then to defaults when samples are few, and always say which source decided.

**START GATE (read first)**

**Implementation of this proposal does NOT start until ALL of the following hold AND the owner explicitly says so. Starting earlier only causes problems.**

1. **No fix proposal of the current rounds remains open.**
2. **Batuta (orchestrator-runner) works flawlessly.**
3. **Token saving and automatic lossless compaction (f00816) are done.**
4. **Subagent selection, contracts and metering are done.**
5. **The whole flow of proposals, refs, worktrees, pull/merge requests, merges and same-branch swarms is closed, checked, robust and 100% complete (q00048 active and green).**

This proposal stays `ready` and is never moved to in-progress until then. The proposal format has slice-level `DependsOn` only and no proposal-level `dependsOn` field; a lint that refuses the `ready` to `in-progress` transition of this id until the gate holds should encode it once such a field exists (follow-up of S6, not an excuse to start early).

## why

Owner, 2026-11-13. A person with 30 delendai projects has an agent in each. The agent in one project knows what was measured there: which model, subagent or Batuta route is cheapest and correct for a task class. It knows nothing of what was measured in the other 29, so every project pays again to learn the same thing and the selector ranks on a handful of local samples. The measurements are project-agnostic by nature (a task class, a model, tokens, outcome); the project is incidental. Builds on f00816 (its cost ledger is the only producer), on the auto-agent-selector calibration store, on Batuta's router and quota ledger, and on usage-tracking rollups. It adds sync and a shared read path, not a second ledger and not a second ranking. Agnostic: any host, any LLM, BYOK, and projects that use delendai as an MCP server.

## non-goals

- No sharing between different people or organisations.
- Nothing project-specific is stored, ever.
- No telemetry to delendai's authors.
- No second metrics ledger and no second ranking algorithm.
- No network call on the selector or Batuta hot path.

## architecture

- **One store per person, configured once.** `local`: a directory under the user's data dir shared by every project on the machine (default when enabled). `remote`: a server URL the person hosts, a tiny documented HTTP contract (append records, fetch rollups, health). Credentials only via the OS keychain or environment, never in config, logs or the repo. Opt-in and off by default. A policy block in config with a user-level default and a per-project override or opt-out.
- **What is stored: only project-agnostic records.** Task class (from a closed taxonomy), model, provider, host, tier, context size used, tokens in, out and cached, wall time, turns, retries, outcome (correct, blocked, failed, verified by a gate and not self-reported), delendai version, timestamp, and a salted project hash used only for de-duplication. Never: paths, file names, code, prompts, proposal text, repo or branch names, user identifiers. A redaction allow-list, schema-validated so that anything not in the schema is dropped, is the single write path.
- **Source.** The per-project metrics ledger (the f00816 cost ledger) is the only producer. Local-first: append to the project ledger, then a background reconcile pushes and pulls. Offline is normal. Idempotent by record id. Bounded retention and aggregation: rollups per task class x model with sample count and confidence, so reads are cheap.
- **Consumers.** The auto-agent-selector and Batuta read aggregated rollups, cached locally with a TTL, never a network call on the hot path. They rank the enabled agents for a task class by cost per correct result. With too few samples they fall back to project-local data, then to defaults, and report which source decided.
- **Privacy and trust.** `delendai knowledge show|export|purge` and a dry-run that prints exactly what would leave the project. Remote data is the person's own and single-tenant. The schema is versioned with migrations.

## slices

- global_gate: lint

### S1 — Record schema and redaction allow-list (the single write path)
- **Status**: pending
- **Files**: `plugins/usage-tracking/src/lib/contracts/knowledge-record.interface.ts`, `plugins/usage-tracking/src/lib/contracts/constants/task-class-taxonomy.constant.ts`, `plugins/usage-tracking/src/lib/services/knowledge-redaction.service.ts`, `plugins/usage-tracking/tests/src/lib/services/knowledge-redaction.service.spec.ts`, `plugins/usage-tracking/src/lib/contracts/invocation-record.interface.ts`
- **Gate**: type
- acceptance:
  - "A versioned schema defines the record fields and a closed task-class taxonomy; anything not in the schema is dropped."
  - "A record carrying a path, a file name, source text, a prompt, a proposal text, a repo or branch name or a user identifier is refused, and the spec proves it for each."
  - "The project hash is salted and cannot be reversed to a project path."
  - "Outcome is only accepted when a gate verdict is attached, never from self-report."
  - "The redaction service is the only exported way to build a record for the store."

### S2 — Local shared store and reconcile
- **Status**: pending
- **DependsOn**: [S1]
- **Files**: `plugins/usage-tracking/src/lib/services/knowledge-store.service.ts`, `plugins/usage-tracking/src/lib/services/knowledge-reconcile.service.ts`, `plugins/usage-tracking/src/lib/contracts/knowledge-store.interface.ts`, `plugins/usage-tracking/tests/src/lib/services/knowledge-store.service.spec.ts`, `plugins/usage-tracking/tests/src/lib/services/knowledge-reconcile.service.spec.ts`, `plugins/usage-tracking/src/lib/services/usage-rollup.service.ts`
- **Gate**: type
- acceptance:
  - "A directory under the user's data dir is shared by two projects on one machine; writes are atomic and safe under concurrent writers."
  - "Reconcile appends from the project ledger, then pushes and pulls; running it twice changes nothing (idempotent by record id)."
  - "Offline or unreachable store: the project ledger still works and the reconcile retries later without loss."
  - "Retention is bounded by policy and old records are aggregated, not silently lost."
  - "Specs name their max time and use no real timers."

### S3 — Rollups and the selector and Batuta read path with fallback and source report
- **Status**: pending
- **DependsOn**: [S2]
- **Files**: `plugins/usage-tracking/src/lib/services/knowledge-rollup.service.ts`, `plugins/auto-agent-selector/src/lib/routing/rank-providers.ts`, `plugins/auto-agent-selector/src/lib/routing/selection-explain.service.ts`, `plugins/auto-agent-selector/src/lib/calibrate/store.ts`, `plugins/orchestrator-runner/src/lib/router/advise.ts`, `plugins/orchestrator-runner/src/lib/router/score.ts`, `plugins/auto-agent-selector/tests/src/lib/routing/knowledge-ranking.spec.ts`
- **Gate**: type
- acceptance:
  - "Rollups per task class x model carry sample count and confidence and are cached locally with a TTL."
  - "Ranking of the ENABLED agents uses cost per correct result; a disabled agent is never ranked from shared data."
  - "Below the minimum sample count the ranking falls back to project-local data, then to defaults."
  - "Every selection names the source that decided (shared, project-local, default)."
  - "The hot path performs no network call; the spec fails if one is attempted."

### S4 — Remote store contract, client and reference server
- **Status**: pending
- **DependsOn**: [S2]
- **Files**: `plugins/usage-tracking/src/lib/contracts/knowledge-remote.interface.ts`, `plugins/usage-tracking/src/lib/services/knowledge-remote-client.service.ts`, `plugins/usage-tracking/tests/src/lib/services/knowledge-remote-client.service.spec.ts`, `docs/delendai/plugins/knowledge-remote-contract.md`
- **Gate**: type
- acceptance:
  - "The HTTP contract (append, fetch rollups, health) is documented and versioned, and a small reference server passes the client spec."
  - "Credentials come only from the OS keychain or environment and never appear in config, logs, errors or the repo (asserted)."
  - "An unreachable or slow server degrades to local data with a reason, never an error to the agent."
  - "The server stores the same allow-listed records only and is single-tenant."

### S5 — CLI show, export, purge, dry-run and doctor checks
- **Status**: pending
- **DependsOn**: [S2, S3]
- **Files**: `plugins/usage-tracking/src/lib/tools/knowledge.tool.ts`, `plugins/usage-tracking/tests/src/lib/tools/knowledge.tool.spec.ts`, `plugins/usage-tracking/src/lib/services/knowledge-doctor.service.ts`
- **Gate**: type
- acceptance:
  - "`delendai knowledge show|export|purge` work against local and remote stores; purge needs explicit confirmation."
  - "The dry-run prints exactly the records that would leave the project and nothing else."
  - "Doctor reports store reachability, schema version, last reconcile and credential presence (never its value)."
  - "The tool declares an outputSchema and a help summary."

### S6 — Config, init, migration for existing projects and docs
- **Status**: pending
- **DependsOn**: [S4, S5]
- **Files**: `packages/core/src/lib/plugins/development-config-schema.constant.ts`, `delendai.config.json`, `docs/delendai/plugins/knowledge.md`, `plugins/auto-agent-selector/skills/delendai-auto-agent-selector-playbook/SKILL.md`
- **Gate**: lint
- acceptance:
  - "A policy block (user-level default, per-project override and opt-out) is validated by the config schema; off by default."
  - "Init offers the store choice once; an existing project is migrated without losing its ledger or enabling anything."
  - "Docs and the selector playbook state the privacy rules and the source report; size budgets still pass."
  - "The proposal-level start gate is encoded by a lint or a dependsOn-style field if the format has one by then."

## acceptance

- Two fixture projects on one machine: a measurement recorded in A changes the ranked choice in B.
- Nothing project-specific is in the store (asserted by a spec scanning every stored record).
- With the store unreachable, selection and Batuta work from local data.
- A record with a path or source text is refused by the allow-list.
- Every selection reports which source decided.
- The feature is off until enabled, and a project can opt out of a user-level enable.
- Implementation did not start before the start gate held and the owner said so.
