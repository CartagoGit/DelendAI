---
id: f00156
title: "Universal checkpoint advisories for agent session hygiene and context drift"
kind: feat
status: done
type: proposal
track: session-hygiene
date: 2026-08-23
---

# f00156 — Universal checkpoint advisories for agent session hygiene and context drift

## Goal

Add a host-agnostic checkpoint advisory system that composes existing session-hygiene, memory-checkpoint, round-context, loop-detector and slice-acceptance signals into a structured advisory every compliant agent must surface as "At this point, I recommend ...". Reduce wasted context, micro-validation, requirement drift, premature pushes and prolonged unproductive sessions without reading private host transcripts.

## why

Real agent sessions degrade in a small number of recurring ways: they run too long and accumulate obsolete context; requirements pile up in chat instead of the proposal/checkpoint; agents over-validate in tiny increments; the same agent continues after losing the thread; and push happens before functional acceptance is demonstrated. mcp-vertex already observes the signals (SessionHygieneMonitor, memory_checkpoint_packet freshness, round_context, AgentLoopDetectorService, validateEvidence) but does not turn them into a single, deduplicated, host-universal advisory. This feature is quality + compute protection: stop at the right time, persist semantic state, continue with a cleaner context.

## non-goals

- Automatically summarize private host conversations or reconstruct checkpoints from transcripts
- Inspect private model context, hidden token meters, or subscription quotas
- Replace host-native compaction
- Prohibit long sessions or useful frequent testing
- Force a proposal for every trivial task
- Block every commit before full validation
- Automatically restart agents without policy or user permission
- Emit verbose warnings after every MCP call
- Reimplement session hygiene, loop detection, or checkpoint freshness as parallel systems
- Put proposal/swarm domain types into packages/core

## Slices

- global_gate: lint

### S1 — Agnostic core advisory contract, merge, pre-block hook, and tool-result injection
- **Status**: done
- **Files**: `packages/core/src/lib/contracts/interfaces/checkpoint-advisory.interface.ts`, `packages/core/src/lib/shared/checkpoint-advisory.ts`, `packages/core/src/lib/plugins/plugin-contract.ts`, `packages/core/src/lib/contracts/interfaces/host-config.interface.ts`, `packages/core/src/lib/cli/assemble-plugins.ts`, `packages/core/src/lib/cli/assemble.ts`, `packages/core/src/lib/project/create-mcp-project.ts`, `packages/core/src/public/index.ts`, `packages/core/tests/src/lib/shared/checkpoint-advisory.spec.ts`, `packages/core/tests/src/lib/project/create-mcp-project.spec.ts`
- **Gate**: lint
- acceptance:
  - "Core exports a domain-agnostic ICheckpointAdvisory (triggered, code, severity recommend|strong|block, message, reason, nextAction, dedupeKey) with no proposal/swarm types."
  - "Plugins may register getCheckpointAdvisory and/or beforeToolCall; assemble merges them (highest severity wins; block short-circuits the handler)."
  - "Successful tool results may include structuredContent.checkpointAdvisory when triggered=true; the same advisory is not re-injected solely because another tool ran with identical dedupeKey (merge helper is pure over inputs)."
  - "Age/confusion never uses severity block in the core helper; block is reserved for explicit plugin-supplied hard stops."
  - "create-mcp-project tests cover inject-on-result, skip-duplicate via provided lastKey, and beforeToolCall block skipping the handler."
  - "No implementation reads host transcripts, context meters, or quotas."

### S2 — SESSION_TOO_LONG from SessionHygieneMonitor
- **Status**: done
- **DependsOn**: [S1]
- **Files**: `plugins/usage-tracking/src/lib/services/checkpoint-advisory.service.ts`, `plugins/usage-tracking/src/index.ts`, `plugins/usage-tracking/src/public/index.ts`, `plugins/usage-tracking/src/lib/types.ts`, `plugins/usage-tracking/tests/src/lib/checkpoint-advisory.spec.ts`
- **Gate**: lint
- acceptance:
  - "Newly breached session-age / idle-gap / mcp-output-volume maps to ICheckpointAdvisory code SESSION_TOO_LONG."
  - "Age alone is severity recommend and nextAction checkpoint-and-fresh-session (or checkpoint-and-compact when idle-gap is the only reason)."
  - "Several independent hygiene reasons escalate to strong; never block."
  - "Dedupe key SESSION_TOO_LONG:<sessionId>:<sorted-reasons>; identical state does not emit again; a new independent reason may escalate."
  - "observedMcpOnly remains true; no claim of host context/quota."
  - "Tests: below threshold → none; cross threshold → one; next call same state → none; new reason → escalate."

### S3 — Memory checkpoint freshness as an advisory input
- **Status**: done
- **DependsOn**: [S1]
- **Files**: `plugins/memory/src/lib/services/checkpoint-advisory.service.ts`, `plugins/memory/src/index.ts`, `plugins/memory/src/public/index.ts`, `plugins/memory/tests/src/lib/checkpoint-advisory.spec.ts`
- **Gate**: lint
- acceptance:
  - "Missing or stale explicit semantic checkpoint can produce a recommend advisory (create-semantic-checkpoint / checkpoint-and-compact) without reading host transcripts."
  - "Fresh checkpoint → no advisory."
  - "Dedupe key includes checkpoint state + latestCheckpointAt; creating a new digest resets it."
  - "Reuses assessCheckpointFreshness; does not fork freshness logic."
  - "Tests cover missing, stale, fresh, and reset-on-new-checkpoint."

### S4 — REQUIREMENTS_NOT_CONSOLIDATED from round_context vs checkpoint
- **Status**: done
- **DependsOn**: [S1]
- **Files**: `plugins/proposals/src/lib/services/checkpoint-advisory-requirements.service.ts`, `plugins/proposals/tests/src/lib/services/checkpoint-advisory-requirements.spec.ts`
- **Gate**: lint
- acceptance:
  - "Material work-state change after the latest semantic checkpoint (chatContext.lastUpdated or proposal/acceptance hashes newer than checkpoint.updatedAt) yields REQUIREMENTS_NOT_CONSOLIDATED."
  - "nextAction consolidate-requirements; severity recommend, or strong on substantial multi-field drift."
  - "Checkpoint newer than chat/proposal context → no advisory."
  - "New semantic checkpoint resets the advisory."
  - "Does not read host transcripts; uses round_context timestamps/hashes only."
  - "Tests cover checkpoint-newer, material-change-after-checkpoint, and reset-on-new-checkpoint."

### S5 — MICRO_VALIDATION_LOOP from observable validation without progress
- **Status**: done
- **DependsOn**: [S1]
- **Files**: `plugins/proposals/src/lib/services/checkpoint-advisory-micro-validation.service.ts`, `plugins/proposals/tests/src/lib/services/checkpoint-advisory-micro-validation.spec.ts`
- **Gate**: lint
- acceptance:
  - "Repeated equivalent validation tools with unchanged progress hash produce MICRO_VALIDATION_LOOP, nextAction finish-slice-before-validating, severity recommend."
  - "edit+test and edit+test+edit+test do not warn."
  - "Default equivalentRunsBeforeWarning is 2 and is configurable."
  - "Server-observed only; agent-enforced host-private fallback is documented in S8."
  - "Dedupe MICRO_VALIDATION:<sliceId>:<progressHash>; fresh progress clears it."
  - "Tests cover valid edit-test cycles, unchanged-progress loops, and legitimate multi-layer tests after one slice."

### S6 — CONTEXT_DRIFT for interactive agents; preserve swarm stuck/handoff
- **Status**: done
- **DependsOn**: [S1]
- **Files**: `plugins/proposals/src/lib/services/checkpoint-advisory-context-drift.service.ts`, `plugins/proposals/src/lib/agents/loop-detector-service.ts`, `plugins/proposals/tests/src/lib/services/checkpoint-advisory-context-drift.spec.ts`, `plugins/proposals/tests/src/lib/agents/loop-detector-service.spec.ts`
- **Gate**: lint
- acceptance:
  - "Interactive (non-swarm-slot) no-progress / repeat-tool evidence yields CONTEXT_DRIFT severity strong, nextAction handoff-to-fresh-agent, without writing a swarm handoff file."
  - "Swarm workers keep the existing isAgentStuck hard handoff path unchanged."
  - "Repeated orientation tools with observable progress do not warn."
  - "Fresh progress hash clears drift state."
  - "Dedupe CONTEXT_DRIFT:<agentId>:<progressHash>."
  - "Tests cover repeat-with-progress, no-progress sequence, reset, and swarm-vs-interactive split."

### S7 — STALE_ACCEPTANCE evidence + commit warn / push block
- **Status**: done
- **DependsOn**: [S1]
- **Files**: `plugins/proposals/src/lib/services/slice-acceptance-evidence.service.ts`, `plugins/proposals/src/lib/services/checkpoint-advisory-stale-acceptance.service.ts`, `plugins/proposals/src/lib/tools/auto-work-persist.ts`, `plugins/proposals/tests/src/lib/services/checkpoint-advisory-stale-acceptance.spec.ts`, `plugins/proposals/tests/src/lib/tools/auto-work-persist.spec.ts`
- **Gate**: lint
- acceptance:
  - "ISliceAcceptanceEvidence tracks lastMeaningfulChangeAt, optional validatedAt/validationCommand/validationPassed/acceptanceSatisfied."
  - "Commit with incomplete acceptance is warning at most (recommend), never a hard block unless an existing repo invariant is violated."
  - "Push is blocked (severity block, nextAction validate-before-push) only when required acceptance evidence is objectively stale or missing after the latest meaningful change."
  - "No declared validation requirement → do not invent a blocker."
  - "Dedupe STALE_ACCEPTANCE:<sliceId>:<gitTreeHash>."
  - "Tests: validate-then-push allowed; validate-then-change-then-push blocked; change-then-commit warn-only; no-requirement-no-block."

### S8 — Proposals wiring, universal bootstrap contract, config schema, and workflow docs
- **Status**: done
- **DependsOn**: [S1, S2, S3, S4, S5, S6, S7]
- **Files**: `plugins/proposals/src/index.ts`, `docs/mcp-vertex/AGENT-BOOTSTRAP.md`, `docs/mcp-vertex/CHECKPOINT-ADVISORIES.md`, `packages/core/schema/mcp-vertex.config.schema.json`, `plugins/usage-tracking/README.md`, `plugins/memory/README.md`, `plugins/proposals/README.md`
- **Gate**: lint
- acceptance:
  - "proposals plugin register() composes S4–S7 engines into getCheckpointAdvisory and registers beforeToolCall for push-guard blocks."
  - "AGENT-BOOTSTRAP.md requires compliant agents to surface checkpointAdvisory.message verbatim when triggered=true, starting with 'At this point, I recommend', explain the reason in at most one short sentence, follow nextAction unless the user asks to continue, and never repeat until dedupe resets."
  - "Bootstrap documents the agent-enforced micro-validation fallback for host-private terminals, labelled agent-enforced vs server-observed."
  - "Docs explain checkpoint → persist proposal/slice state → release unnecessary locks → fresh session → orient → resume from bounded checkpoint packet."
  - "Plugin options (not a parallel source of truth) cover enabled, session thresholds, equivalentRunsBeforeWarning, interactiveSeverity, pushGuard.enabled."
  - "Session age by itself does not hard-block work anywhere in docs or defaults."

## acceptance

- Core exports a domain-agnostic ICheckpointAdvisory (triggered, code, severity recommend|strong|block, message, reason, nextAction, dedupeKey) with no proposal/swarm types.
- Plugins may register getCheckpointAdvisory and/or beforeToolCall; assemble merges them (highest severity wins; block short-circuits the handler).
- Successful tool results may include structuredContent.checkpointAdvisory when triggered=true; the same advisory is not re-injected solely because another tool ran with identical dedupeKey (merge helper is pure over inputs).
- Age/confusion never uses severity block in the core helper; block is reserved for explicit plugin-supplied hard stops.
- create-mcp-project tests cover inject-on-result, skip-duplicate via provided lastKey, and beforeToolCall block skipping the handler.
- No implementation reads host transcripts, context meters, or quotas.
- Newly breached session-age / idle-gap / mcp-output-volume maps to ICheckpointAdvisory code SESSION_TOO_LONG.
- Age alone is severity recommend and nextAction checkpoint-and-fresh-session (or checkpoint-and-compact when idle-gap is the only reason).
- Several independent hygiene reasons escalate to strong; never block.
- Dedupe key SESSION_TOO_LONG:<sessionId>:<sorted-reasons>; identical state does not emit again; a new independent reason may escalate.
- observedMcpOnly remains true; no claim of host context/quota.
- Tests: below threshold → none; cross threshold → one; next call same state → none; new reason → escalate.
- Missing or stale explicit semantic checkpoint can produce a recommend advisory (create-semantic-checkpoint / checkpoint-and-compact) without reading host transcripts.
- Fresh checkpoint → no advisory.
- Dedupe key includes checkpoint state + latestCheckpointAt; creating a new digest resets it.
- Reuses assessCheckpointFreshness; does not fork freshness logic.
- Tests cover missing, stale, fresh, and reset-on-new-checkpoint.
- Material work-state change after the latest semantic checkpoint (chatContext.lastUpdated or proposal/acceptance hashes newer than checkpoint.updatedAt) yields REQUIREMENTS_NOT_CONSOLIDATED.
- nextAction consolidate-requirements; severity recommend, or strong on substantial multi-field drift.
- Checkpoint newer than chat/proposal context → no advisory.
- New semantic checkpoint resets the advisory.
- Does not read host transcripts; uses round_context timestamps/hashes only.
- Tests cover checkpoint-newer, material-change-after-checkpoint, and reset-on-new-checkpoint.
- Repeated equivalent validation tools with unchanged progress hash produce MICRO_VALIDATION_LOOP, nextAction finish-slice-before-validating, severity recommend.
- edit+test and edit+test+edit+test do not warn.
- Default equivalentRunsBeforeWarning is 2 and is configurable.
- Server-observed only; agent-enforced host-private fallback is documented in S8.
- Dedupe MICRO_VALIDATION:<sliceId>:<progressHash>; fresh progress clears it.
- Tests cover valid edit-test cycles, unchanged-progress loops, and legitimate multi-layer tests after one slice.
- Interactive (non-swarm-slot) no-progress / repeat-tool evidence yields CONTEXT_DRIFT severity strong, nextAction handoff-to-fresh-agent, without writing a swarm handoff file.
- Swarm workers keep the existing isAgentStuck hard handoff path unchanged.
- Repeated orientation tools with observable progress do not warn.
- Fresh progress hash clears drift state.
- Dedupe CONTEXT_DRIFT:<agentId>:<progressHash>.
- Tests cover repeat-with-progress, no-progress sequence, reset, and swarm-vs-interactive split.
- ISliceAcceptanceEvidence tracks lastMeaningfulChangeAt, optional validatedAt/validationCommand/validationPassed/acceptanceSatisfied.
- Commit with incomplete acceptance is warning at most (recommend), never a hard block unless an existing repo invariant is violated.
- Push is blocked (severity block, nextAction validate-before-push) only when required acceptance evidence is objectively stale or missing after the latest meaningful change.
- No declared validation requirement → do not invent a blocker.
- Dedupe STALE_ACCEPTANCE:<sliceId>:<gitTreeHash>.
- Tests: validate-then-push allowed; validate-then-change-then-push blocked; change-then-commit warn-only; no-requirement-no-block.
- proposals plugin register() composes S4–S7 engines into getCheckpointAdvisory and registers beforeToolCall for push-guard blocks.
- AGENT-BOOTSTRAP.md requires compliant agents to surface checkpointAdvisory.message verbatim when triggered=true, starting with 'At this point, I recommend', explain the reason in at most one short sentence, follow nextAction unless the user asks to continue, and never repeat until dedupe resets.
- Bootstrap documents the agent-enforced micro-validation fallback for host-private terminals, labelled agent-enforced vs server-observed.
- Docs explain checkpoint → persist proposal/slice state → release unnecessary locks → fresh session → orient → resume from bounded checkpoint packet.
- Plugin options (not a parallel source of truth) cover enabled, session thresholds, equivalentRunsBeforeWarning, interactiveSeverity, pushGuard.enabled.
- Session age by itself does not hard-block work anywhere in docs or defaults.
