---
id: x00097
kind: fix
title: Cross-plugin security, concurrency, lifecycle and portability hardening
status: ready
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
- **Status**: pending

### S2 — Proposal queue RMW mutex coverage
- **Files**: plugins/proposals/src/lib/tools/state-tools.tool.ts
- **Files**: plugins/proposals/src/lib/tools/agent-names.tool.ts
- **Files**: plugins/proposals/tests/src/lib/tools/queue-races.spec.ts
- **Gate**: `bun run test`
- **Status**: pending

### S3 — Usage rollup and shutdown lifecycle
- **Files**: plugins/usage-tracking/src/lib/rollup.ts
- **Files**: plugins/usage-tracking/src/lib/record-buffer.ts
- **Files**: plugins/usage-tracking/src/index.ts
- **Files**: plugins/usage-tracking/tests/src/lib/lifecycle-races.spec.ts
- **Gate**: `bun run test`
- **Status**: pending

### S4 — Streaming byte cap
- **Files**: plugins/web-fetch/src/lib/services/engine.ts
- **Files**: plugins/web-fetch/src/lib/contracts/interfaces/fetch.interface.ts
- **Files**: plugins/web-fetch/tests/src/lib/services/engine.spec.ts
- **Gate**: `bun run test`
- **Status**: pending

### S5 — Async portable process runners
- **Files**: packages/core/src/lib/shared/run-command.ts
- **Files**: plugins/quality/src/lib/services/runner.ts
- **Files**: plugins/issues/src/lib/github-client.ts
- **Files**: plugins/rules/src/lib/tools/rules-tools.ts
- **Gate**: `bun run test`
- **Status**: pending

### S6 — Protected push destination and force policy
- **Files**: plugins/git/src/lib/tools/write-tools.ts
- **Files**: plugins/git/tests/src/lib/tools/write-tools.spec.ts
- **Gate**: `bun run test`
- **Status**: pending

### S7 — Durable redaction quota and rejection handling
- **Files**: plugins/issues/src/lib/tools/resolve-issue.tool.ts
- **Files**: plugins/memory/src/lib/tools/tools.ts
- **Files**: plugins/memory/src/lib/store/store-records.ts
- **Files**: plugins/logs/src/lib/services/subscribe.ts
- **Files**: plugins/memory/tests/src/lib/store/quota-concurrency.spec.ts
- **Files**: plugins/logs/tests/src/lib/services/subscribe.spec.ts
- **Gate**: `bun run test`
- **Status**: pending

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
- **Status**: pending

### S9 — Remaining plugin containment and online registry truth
- **Files**: plugins/proposals/src/index.ts
- **Files**: plugins/proposals/src/lib/proposals/sync-proposal-registry.ts
- **Files**: plugins/proposals/src/lib/swarm/round-context-sources.ts
- **Files**: plugins/rules/src/lib/frameworks/online-preset.ts
- **Files**: plugins/proposals/tests/src/lib/proposals/proposal-folders-containment.spec.ts
- **Files**: plugins/rules/tests/src/lib/frameworks/online-preset.spec.ts
- **Gate**: `bun run test`
- **Status**: pending

## Acceptance

- Cada RMW concurrente queda bajo un mutex común con tests de barrera.
- Paths configurables fallan cerrados; subprocesses son async/argv-first.
- Shutdown drena buffers; byte caps son streaming; pushes protegidos no admiten bypass.
- README/skills se contrastan automáticamente con catálogo, schemas y effects.
