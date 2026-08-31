---
id: f00392
title: "Adaptive preferred path, proposals facade, provenance, generated truth and VS Code benchmark"
kind: feat
status: ready
type: proposal
track: general
date: 2026-08-30
related:
  - q00013 # master coordination plan
---

# f00392 — Adaptive preferred path, proposals facade, provenance, generated truth and VS Code benchmark

## Goal

GENERAL TRACK — owner lógico plan-execution-orchestrator; RELEASE TRACK excluido. Problema/evidencia: la superficie detallada de proposals es útil pero costosa, los datos vivos de documentación pueden quedar stale y `onStartupFinished` en VS Code debe justificarse con medición. Objetivo: fachada adaptativa con intenciones orient/plan/claim/progress/close/recover preservando capabilities detalladas; capability negotiation y preferred path comparando task success, tokens, calls, latency y side-effect risk; grafo de provenance agent/proposal/slice/tool/test/commit/release/PR usando IDs/digests sin datos privados; documentación generada desde registries reales eliminando contadores manuales; benchmark de activación VS Code con y sin MCP Vertex y evaluación de onStartupFinished frente a lazy activation. Diseño: facade como routing layer sobre tools existentes, no lógica duplicada en skills; provenance append-only/redacted; generated docs verificadas por drift; benchmark reproducible. Alternativas: reemplazar capabilities detalladas, usar prose-only skills, mantener listas manuales o activar startup sin evidencia; descartadas. Contracts/files esperados: adaptive-optimizer, proposals stable tools, usage/observability, docs generators, extensions/vscode tests/benchmarks. Dependencias: v00131 para coste/superficie; r00044 para capabilities; x00323 para generated gates; f00388-f00391 para provenance de release. Compatibility/migration: detailed tools siguen disponibles, facade opt-in/adaptive, provenance privacy-preserving, VS Code fallback lazy. Tests: facade intent mapping, negotiation matrix, success/token/call/latency metrics, provenance graph completeness and redaction, docs drift, activation benchmark thresholds. Security: no user content in provenance/telemetry, capability checks, explicit network consent. Token impact: discovery bytes and calls target down without reducing task success. CI impact: benchmark non-flaky, generated drift and regression thresholds. Multiagent impact: provenance includes claims/locks/rereads/polls and supports recovery; worktree recommended for registry/doc changes. Rollback: disable facade/benchmark policy and use detailed tools; preserve generated source. Observability: task success, discovery bytes, calls, latency, activation time, memory, workspace mode, provenance links. Acceptance/DoD: adaptive facade executable, capability negotiation measured, provenance graph queryable/redacted, docs truth generated, VS Code startup decision backed by benchmark, all tests/gates green. Parallelizable: facade, provenance, docs and benchmark can be disjoint; integration after v00131/r00044. Reviewer: adaptive systems/documentation/VS Code specialist. Related: q00013, x00323, r00044, v00131, f00388-f00391. Required sections: problem, evidence, SHA, objective, non-goals, design, alternatives, contracts, expected files, dependencies, compatibility, migration, tests, security, token/CI/multiagent impact, rollback, observability, acceptance, DoD, parallelism, worktree, reviewer, related, ownership.

## why

Completa la evolución orientada a agentes sin sustituir capacidades detalladas, y convierte métricas/documentación/activación en decisiones verificables.

## non-goals

- No eliminar las tools detalladas.
- No registrar contenido privado en provenance.
- No decidir onStartupFinished sin benchmark.
- No implementar release tooling fuera del RELEASE TRACK.

## Slices

- global_gate: e2e

### S1 — Adaptive facade and preferred-path evaluation
- **Status**: pending
- **Files**: `plugins/adaptive-optimizer/src`, `plugins/proposals/src/lib/api`, `plugins/usage-tracking/src`, `plugins/adaptive-optimizer/tests`
- **Gate**: e2e
- acceptance:
  - "intents orient/plan/claim/progress/close/recover mapean a capabilities existentes"
  - "negotiation compara success/tokens/calls/latency/risk"
  - "detailed surface remains available"
- review-state: in_review
- review-implementer: falcon
### S2 — Provenance graph and generated documentation truth
- **Status**: pending
- **DependsOn**: [S1]
- **Files**: `plugins/observability/src`, `tools/scripts/gen`, `docs/mcp-vertex/generated`, `plugins/observability/tests`
- **Gate**: type
- acceptance:
  - "graph links agent/proposal/slice/tool/test/commit/release/PR"
  - "redaction excludes user data"
  - "counts/lists generated from source of truth"
  - "drift check passes"

### S3 — VS Code activation benchmark
- **Status**: pending
- **Files**: `extensions/vscode/src/benchmarks`, `extensions/vscode/src/test`, `extensions/vscode/package.json`
- **Gate**: e2e
- acceptance:
  - "activation time/memory/work measured with and without MCP Vertex"
  - "onStartupFinished decision has threshold evidence"
  - "workspace no-MCP and MCP cases covered"
  - "lazy fallback documented"

## acceptance

- intents orient/plan/claim/progress/close/recover mapean a capabilities existentes
- negotiation compara success/tokens/calls/latency/risk
- detailed surface remains available
- graph links agent/proposal/slice/tool/test/commit/release/PR
- redaction excludes user data
- counts/lists generated from source of truth
- drift check passes
- activation time/memory/work measured with and without MCP Vertex
- onStartupFinished decision has threshold evidence
- workspace no-MCP and MCP cases covered
- lazy fallback documented
