---
id: f00392
title: "Adaptive preferred path, proposals facade, provenance, generated truth and VS Code benchmark"
kind: feat
status: review
type: proposal
track: general
date: 2026-08-30
related:
  - q00013 # master coordination plan
shipped-in: ["8514f99f7", "af2265b4b"]
last-transition-id: bf494b73-2057-4e90-ad3d-de06ede5f714
last-correlation-id: bf494b73-2057-4e90-ad3d-de06ede5f714
last-transition-from: in-progress
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
- **Status**: done
- **Files**: `plugins/adaptive-optimizer/src`, `plugins/proposals/src/lib/api`, `plugins/usage-tracking/src`, `plugins/adaptive-optimizer/tests`
- **Gate**: e2e
- acceptance:
  - "intents orient/plan/claim/progress/close/recover mapean a capabilities existentes"
  - "negotiation compara success/tokens/calls/latency/risk"
  - "detailed surface remains available"
- review-state: done
- review-implementer: falcon
- review-reviewer: delivery-verifier-f00392-final
- review-log: requested_changes by delivery-verifier-f00392-s1 — La facade reduce detailedSurface a name/summary y puede truncarla; la acceptance exige conservar la surface detallada completa. Proyectar todos los campos del contrato estable y cubrirlo con tests.
- review-log: requested_changes by delivery-verifier-f00392-s1-r2 — La surface detallada ya conserva todos los campos, pero la tool aplica maxBytes implícito 16384 y puede truncar sin presupuesto explícito del llamador. Hacer el truncado opt-in o documentar/validar un contrato explícito, con test nominal sin truncado.
- review-log: approved by delivery-verifier-f00392-final — Aprobada tras tercera verificación independiente. detailedSurface completa por defecto; maxBytes solo opt-in; intents, negociación y fallback cubiertos. 12/12 tests focalizados pass, validate exit 0, HEAD 8514f99.
### S2 — Provenance graph and generated documentation truth
- **Status**: done
- **DependsOn**: [S1]
- **Files**: `plugins/observability/src`, `tools/scripts/gen`, `docs/mcp-vertex/generated`, `plugins/observability/tests`
- **Gate**: type
- acceptance:
  - "graph links agent/proposal/slice/tool/test/commit/release/PR"
  - "redaction excludes user data"
  - "counts/lists generated from source of truth"
  - "drift check passes"
- review-state: done
- review-implementer: crow
- review-reviewer: delivery-verifier-f00392-s2-final
- review-log: requested_changes by delivery-verifier-f00392-s2 — La documentación de provenance usa TOOL_PATHS/TEST_PATHS/SAMPLE_GRAPH manuales y omite obs_health aunque el plugin registra cuatro tools. Derivar counts/lists desde el registry real y cubrir la discrepancia con tests.
- review-log: approved by delivery-verifier-f00392-s2-final — `bun install --frozen-lockfile` reproducible tras regenerar el lockfile, drift sin cambios en docs/mcp-vertex/generated/observability-provenance.generated.md y 7/7 tests focales pass, exit code 0, HEAD af2265b.
### S3 — VS Code activation benchmark
- **Status**: done
- **Files**: `extensions/vscode/src/benchmarks`, `extensions/vscode/src/test`, `extensions/vscode/package.json`
- **Gate**: e2e
- acceptance:
  - "activation time/memory/work measured with and without MCP Vertex"
  - "onStartupFinished decision has threshold evidence"
  - "workspace no-MCP and MCP cases covered"
  - "lazy fallback documented"
- review-state: done
- review-implementer: sparrow
- review-reviewer: delivery-verifier-f00392-s3-final
- review-log: requested_changes by delivery-verifier-f00392-s3 — El benchmark es una simulación en Bun: no lanza extension host, no abre workspaces no-MCP/MCP ni mide activación real, memoria real o calls observadas. Añadir harness operativo reproducible y documentación explícita del lazy fallback.
- review-log: requested_changes by delivery-verifier-f00392-s3-r2 — El benchmark crea un archivo de calls vacío antes de lanzar VS Code y luego lo lee como artefacto válido, lo que fusiona "artefacto ausente" con "cero observadas". Hacer artefactos explícitos y fixtures reales control/no-MCP distintas del MCP.
- review-log: approved by delivery-verifier-f00392-s3-final — Runner real activation-benchmark.integration.cjs y classificador central activation-benchmark.ts distinguen archivo vacío (missing-artifact) de artefacto poblado (artifact con N calls). Spec cubre el caso de call-log vacío con insufficient-evidence. 5/5 tests focales pass, exit code 0, HEAD af2265b.
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
