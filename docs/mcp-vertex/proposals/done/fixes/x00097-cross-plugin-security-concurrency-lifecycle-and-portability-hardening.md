---
id: x00097
kind: fix
title: Cross-plugin security, concurrency, lifecycle and portability hardening
status: done
type: proposal
track: hardening
date: 2026-07-12
---

# x00097 — cross plugin security concurrency lifecycle and portability hardening

## Goal

Close the remaining verified security, containment, lost-update, shutdown, streaming and portability gaps without weakening plugin boundaries.

## Why

La auditoría confirmó gaps reproducibles que cruzan ownership de plugins y
requieren cambios contractuales o tests de carrera más amplios que un quick fix.

## Non-goals

- No fusionar plugins ni mover dominio al core.
- No cambiar comportamientos no relacionados con los findings auditados.

## Slices

- global_gate: e2e

### S1 — External MCP ack composition
- **Files**: plugins/external-mcps/src/index.ts
- **Files**: plugins/external-mcps/src/lib/tools/invoke-proxy.ts
- **Files**: plugins/external-mcps/tests/src/lib/plugin-composition.spec.ts
- **Gate**: `bun run test`
- **Status**: done
### S2 — Proposal queue RMW mutex coverage
- **Files**: plugins/proposals/src/lib/tools/state-tools.tool.ts
- **Files**: plugins/proposals/src/lib/tools/agent-names.tool.ts
- **Files**: plugins/proposals/tests/src/lib/tools/queue-races.spec.ts
- **Gate**: `bun run test`
- **Status**: done
### S3 — Usage rollup and shutdown lifecycle
- **Files**: plugins/usage-tracking/src/lib/rollup.ts
- **Files**: plugins/usage-tracking/src/lib/record-buffer.ts
- **Files**: plugins/usage-tracking/src/index.ts
- **Files**: plugins/usage-tracking/tests/src/lib/lifecycle-races.spec.ts
- **Gate**: `bun run test`
- **Status**: done

### S3b — Usage buffer registry and deterministic plugin cleanup
- **Finding (2026-07-12)**: the full-suite gate reproduced an `ENOENT` where a
  delayed append outlived the plugin test workspace. `RecordBuffer` retained
  every constructed instance forever, including settled buffers, and the
  plugin specs used wall-clock sleeps without awaiting the actual append.
- **Resolution**: track a buffer only while it owns pending/in-flight work,
  unregister it after a complete drain, and make plugin cleanup await
  `drainLiveBuffers()` before deleting its workspace.
- **Files**: plugins/usage-tracking/src/lib/record-buffer.ts
- **Files**: plugins/usage-tracking/tests/src/lib/plugin.spec.ts
- **Files**: plugins/usage-tracking/tests/src/lib/lifecycle-races.spec.ts
- **Gate**: `bun run test`
- **Status**: done

### S4 — Streaming byte cap
- **Files**: plugins/web-fetch/src/lib/services/engine.ts
- **Files**: plugins/web-fetch/src/lib/contracts/interfaces/fetch.interface.ts
- **Files**: plugins/web-fetch/tests/src/lib/services/engine.spec.ts
- **Gate**: `bun run test`
- **Status**: done

### S3c — Deterministic host signal-readiness handshake
- **Finding (2026-07-12)**: the full-suite gate reproduced a double-SIGTERM
  failure where the child exited with the raw signal. The e2e assumed handlers
  were installed after a fixed minimum uptime, but cold assembly can exceed
  that interval under load.
- **Resolution**: the host emits an opt-in, test-only readiness marker directly
  after installing signal handlers; lifecycle e2e tests pipe stderr and await
  that handshake before sending SIGINT/SIGTERM. No production banner is added.
- **Files**: tools/scripts/host/host-server.script.ts
- **Files**: packages/core/tests/src/lib/cli/host-graceful-shutdown.spec.ts
- **Gate**: `bun run test`
- **Status**: done

### S5 — Async portable process runners
- **Files**: packages/core/src/lib/shared/run-command.ts
- **Files**: plugins/quality/src/lib/services/runner.ts
- **Files**: plugins/issues/src/lib/github-client.ts
- **Files**: plugins/rules/src/lib/tools/rules-tools.ts
- **Gate**: `bun run test`
- **Status**: done
### S6 — Protected push destination and force policy
- **Files**: plugins/git/src/lib/tools/write-tools.ts
- **Files**: plugins/git/tests/src/lib/write-tools.spec.ts
- **Gate**: `bun run test`
- **Status**: done
- **Evidence**:
  - "Push policy resolves the effective destination for explicit branches, `src:dst` refspecs and omitted/current branches before allowing the write; nested feature paths are not misclassified by their final segment."
  - "Plain force and leading-plus force refspecs fail closed; only `--force-with-lease` is emitted. The git plugin gate passes 34 tests, including protected refspec, implicit branch and safe-force regressions."

### S7 — Durable redaction quota and rejection handling
- **Files**: plugins/issues/src/lib/tools/resolve-issue.tool.ts
- **Files**: plugins/issues/tests/src/lib/tools/resolve-issue.tool.spec.ts
- **Files**: plugins/memory/src/lib/tools/tools.ts
- **Files**: plugins/memory/src/lib/tools/compact.tool.ts
- **Files**: plugins/memory/src/lib/services/store-records.ts
- **Files**: plugins/logs/src/lib/services/subscribe.ts
- **Files**: plugins/memory/tests/src/lib/store-concurrency.spec.ts
- **Files**: plugins/logs/tests/subscribe.spec.ts
- **Gate**: `bun run test`
- **Status**: done
- **Evidence**:
  - "Memory quota admission now occurs inside the same store mutex as the read-modify-write for both ordinary saves and session compaction; a barrier regression proves two max-minus-one writers cannot exceed the limit."
  - "Issue-resolution fields are redacted before serialization. Log subscriptions observe rejected appends, detach listeners first and await every in-flight write during async close, preventing unhandled rejections and post-close loss."
  - "The issues, memory and logs suites pass 164 tests and the repository typecheck passes."

### S8 — Owner docs and skills drift ratchet
- **Files**: plugins/audit/README.md
- **Files**: plugins/audit/skills/audit-runner/SKILL.md
- **Files**: plugins/deps/README.md
- **Files**: plugins/git/README.md
- **Files**: plugins/issues/README.md
- **Files**: plugins/memory/README.md
- **Files**: plugins/rules/skills/rules-solid-architecture/SKILL.md
- **Files**: plugins/status-marker/src/index.ts
- **Files**: tools/scripts/lint/skills-script.ts
- **Gate**: `bun run lint:skills`
- **Status**: done
- **Evidence**:
  - "Owner documentation now matches the registered conditional network/write surfaces, current tool arguments, redaction/quota guarantees and current proposal/skill paths."
  - "The skills ratchet now verifies that every manifest id equals the referenced SKILL frontmatter name in addition to uniqueness and on-disk existence; lint, proposal lint and repository typecheck pass."

### S9 — Remaining plugin containment and online registry truth
- **Files**: plugins/proposals/src/index.ts
- **Files**: plugins/proposals/src/lib/proposals/sync-proposal-registry.ts
- **Files**: plugins/proposals/src/lib/swarm/round-context-sources.ts
- **Files**: plugins/rules/src/lib/frameworks/online-preset.ts
- **Files**: plugins/proposals/tests/src/lib/proposals/proposal-folders-containment.spec.ts
- **Files**: plugins/rules/tests/src/lib/online-preset.spec.ts
- **Gate**: `bun run test`
- **Status**: done
- **Evidence**:
  - "Custom proposal folders are resolved beneath proposalsDir before registry or live round-context scanning; traversal and absolute paths throw before filesystem enumeration."
  - "Online preset lookups no longer fabricate version 1.0.0 for empty or unsupported registry responses. Missing published-version data fails closed while a real registry-supplied 1.0.0 remains valid."
  - "Containment and online-registry regressions pass 24 tests and the repository typecheck passes."

## Acceptance

- Cada RMW concurrente queda bajo un mutex común con tests de barrera.
- Paths configurables fallan cerrados; subprocesses son async/argv-first.
- Shutdown drena buffers; byte caps son streaming; pushes protegidos no admiten bypass.
- README/skills se contrastan automáticamente con catálogo, schemas y effects.
