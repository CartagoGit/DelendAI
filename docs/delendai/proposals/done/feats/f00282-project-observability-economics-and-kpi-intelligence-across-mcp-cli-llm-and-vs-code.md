---
id: f00282
title: "Project observability economics and KPI intelligence across MCP CLI LLM and VS Code"
kind: feat
status: done
type: proposal
track: project-observability-economics
date: 2026-08-29
shipped-in: ["84f7cd1a", "0e61564c", "dbed1157", "1103f150"]
---

# f00282 — Project observability economics and KPI intelligence across MCP CLI LLM and VS Code

## Goal

Build a first-class project observability and economics capability for mcp-vertex. It must aggregate project health, delivery progress, quality and coverage, MCP usage, plugin calls and outcomes, model and agent usage, request types, iterations, latency, errors, inconsistencies, token/cost efficiency and evidence-based savings. One versioned snapshot contract must feed the MCP/LLM surface, CLI reports, JSON/CI output and a graphical VS Code dashboard. The mcp-vertex repository is the first dogfood target.

## why

Users need to understand both whether their project is progressing and whether their AI-assisted development workflow is efficient, reliable and economically justified. Existing project-health and usage-tracking capabilities contain valuable signals but do not yet provide one auditable, historical and multi-surface view. The feature must preserve privacy, distinguish measured data from estimates, and avoid duplicating domain scanners.

## non-goals

- Do not invent provider prices, token savings or coverage when the source is unavailable.
- Do not store prompts, response bodies, source code, credentials or secrets in telemetry.
- Do not reimplement security, dependency, quality, proposal or git scanners owned by existing plugins.
- Do not make the VS Code dashboard the source of truth; it consumes the shared snapshot contract.
- Do not require every metric to exist in every host or project; unavailable metrics must carry an explicit status.

## Slices

- global_gate: type

### S1 — Versioned KPI snapshot contract and aggregation core
- **Status**: done
- **Files**: `plugins/project-kpis/src/index.ts`, `plugins/project-kpis/src/lib/contracts/kpi-snapshot.interface.ts`, `plugins/project-kpis/src/lib/contracts/kpi-snapshot.schema.ts`, `plugins/project-kpis/src/lib/services/kpi-aggregation.service.ts`, `plugins/project-kpis/tests/src/kpi-aggregation.spec.ts`
- **Gate**: type
- acceptance:
  - "A new project-kpis plugin builds through definePlugin and exposes a versioned typed snapshot contract."
  - "The snapshot distinguishes measured, estimated, unavailable and not-configured values."
  - "The aggregation core consumes existing public plugin services or adapters instead of duplicating scanners."
  - "The aggregate output is deterministic, bounded and passes its Zod output schema."
- review-state: done
- review-implementer: mcp-vertex-orchestrator
- review-reviewer: delivery_verifier
- review-log: approved by delivery_verifier — Independent review passed: versioned snapshot contract, Zod schema, deterministic bounded aggregation, and focal validations confirmed.
### S2 — Detailed invocation telemetry by plugin model agent request and outcome
- **Status**: done
- **DependsOn**: [S1]
- **Files**: `plugins/usage-tracking/src/index.ts`, `plugins/usage-tracking/src/lib/contracts/invocation-record.interface.ts`, `plugins/usage-tracking/src/lib/services/invocation-recorder.service.ts`, `plugins/usage-tracking/src/lib/services/usage-rollup.service.ts`, `plugins/usage-tracking/tests/src/invocation-telemetry.spec.ts`
- **Gate**: type
- acceptance:
  - "Every invocation record can attribute timestamp, session, host, agent type, extension, model when available, plugin, tool, request category, iteration, duration, outcome and error classification."
  - "Rollups support total calls, successful calls, failures, retries or iterations, latency and token fields by plugin, tool, model, agent, request type and time window."
  - "Errors and schema/result incongruences are represented as structured redacted records with correlation identifiers."
  - "Telemetry writes remain non-blocking and never persist prompts, response bodies, source content, credentials or secrets."
- review-state: done
- review-implementer: mcp-vertex-orchestrator
- review-reviewer: delivery_verifier
- review-log: approved by delivery_verifier — Independent review passed: invocation attribution, rollups, redacted error telemetry with correlation IDs, and non-blocking buffered writes verified against implementation and focal validations.
### S3 — Durable snapshots history trends and cost savings evidence
- **Status**: done
- **DependsOn**: [S1, S2]
- **Files**: `plugins/project-kpis/src/lib/services/kpi-history.service.ts`, `plugins/project-kpis/src/lib/services/kpi-trends.service.ts`, `plugins/project-kpis/src/lib/contracts/kpi-history.interface.ts`, `plugins/project-kpis/tests/src/kpi-history.spec.ts`, `plugins/project-kpis/README.md`
- **Gate**: type
- acceptance:
  - "Snapshots are persisted atomically under the configured cache path with retention and mutex protection."
  - "History supports daily or configurable windows and computes up, down, stable and unknown trends."
  - "Costs separate provider-reported usage, configured price estimates, subscription usage and unavailable values."
  - "Token savings and financial savings are reported only when a baseline and source data exist, including the methodology and confidence status."
- review-state: done
- review-implementer: mcp-vertex-orchestrator
- review-reviewer: delivery_verifier
- review-log: approved by delivery_verifier — Verificación independiente (revisor distinto del implementador): persistencia atómica de snapshots con writeFileAtomic+mutex y retención, ventanas de historial con tendencias up/down/stable/unknown, economics separando provider-reported/configured-estimate/subscription/unavailable sin inventar ahorros. Suite plugin project-kpis 10/10 (kpi-history 5, kpi-aggregation 2, tool 3), typecheck exit 0. Commit real a8f542fd.
### S4 — CLI human JSON watch and audit reports
- **Status**: done
- **DependsOn**: [S1, S2, S3]
- **Files**: `packages/cli/src/commands/kpis.command.ts`, `packages/cli/src/commands/kpis-renderer.ts`, `packages/cli/src/commands/kpis-options.ts`, `packages/cli/src/commands/kpis.command.spec.ts`, `packages/cli/README.md`
- **Gate**: e2e
- acceptance:
  - "The CLI exposes summary, history, usage, costs, models, agents, plugins, errors, efficiency and audit views."
  - "Human output is scannable and includes metric status, source, period and limitations."
  - "JSON output is stable enough for CI and scripts and contains the same data as the human renderer."
  - "Watch mode refreshes without corrupting output and threshold mode can fail CI based on configured evidence-backed criteria."
- review-state: done
- review-implementer: mcp-vertex-orchestrator
- review-reviewer: delivery_verifier
- review-log: approved by delivery_verifier — Verificación independiente (revisor distinto del implementador): CLI expone las 10 vistas requeridas, output humano escaneable con status/source/period/limitations, JSON estable con mismo contrato, watch mode y threshold mode verificados por spec (6 tests). Suite CLI completa 37 archivos/319 tests verdes, typecheck exit 0, cli-coverage 18 comandos cubiertos. Commit real 0e61564c.
### S5 — MCP and LLM KPI tools with compact views
- **Status**: done
- **DependsOn**: [S1, S2, S3]
- **Files**: `plugins/project-kpis/src/lib/tools/project-kpis.tool.ts`, `plugins/project-kpis/src/lib/tools/project-kpis-output.schema.ts`, `plugins/project-kpis/src/lib/contracts/kpi-query.interface.ts`, `plugins/project-kpis/tests/src/project-kpis.tool.spec.ts`
- **Gate**: e2e
- acceptance:
  - "The MCP surface exposes summary, history, usage, economics, models, agents, plugins, errors, efficiency and audit views."
  - "Responses remain bounded and support filters for time window, dimensions and detail level."
  - "The LLM receives explicit data quality status, sources, estimates, privacy limits and recommended next actions."
  - "The tool contract is consumable through the same assembleCliConfig path used by hosts and tests."
- review-state: done
- review-implementer: mcp-vertex-orchestrator
- review-reviewer: delivery_verifier
- review-log: approved by delivery_verifier — Verificación independiente (revisor distinto del implementador): la superficie MCP expone las 10 vistas requeridas (incluye economics/audit/efficiency), respuestas bounded con filtros de ventana/dimensión/detalle, y el LLM recibe status/sources/estimates/privacy limits/recommendations. Contrato Zod estricto consumible vía registration shape. Suite plugin 10/10 (tool spec 3/3), typecheck exit 0. Commit real 84f7cd1a.
### S6 — VS Code KPI dashboard with graphs and drill-down
- **Status**: done
- **DependsOn**: [S1, S3, S5]
- **Files**: `extensions/vscode/src/providers/kpi-dashboard-provider.ts`, `extensions/vscode/src/contracts/interfaces/kpi-dashboard.interface.ts`, `extensions/vscode/src/contracts/constants/kpi-dashboard-message-schema.constant.ts`, `extensions/vscode/src/test/kpi-dashboard-provider.spec.ts`, `packages/ui-extension/src/kpi-dashboard.ts`
- **Gate**: e2e
- acceptance:
  - "The extension dashboard displays health, delivery, quality, coverage, usage, cost, models, agents, plugins, errors and efficiency sections."
  - "At least trend charts exist for overall score, coverage, token usage/cost and calls/errors over time."
  - "The dashboard handles loading, partial data, unavailable metrics, MCP disconnects and empty history without misleading zeros."
  - "The status bar can expose the overall score and period while linking to the dashboard."
- review-state: done
- review-implementer: mcp-vertex-orchestrator
- review-reviewer: delivery_verifier
- review-log: approved by delivery_verifier — Verificación independiente (revisor distinto del implementador): dashboard con las secciones requeridas, tendencias (score/coverage/tokens/cost/calls/errors) en ui-extension, manejo honesto de loading/partial/unavailable/disconnected/empty sin ceros engañosos, view mcp-vertex.kpis en package.json + provider registrado en extension.ts + status bar expone KPIs y enlaza al dashboard. Spec 3/3, typecheck extensión exit 0. Commit real 84f7cd1a.
### S7 — Audit and efficiency methodology dogfood on mcp-vertex
- **Status**: done
- **DependsOn**: [S2, S3, S4, S5, S6]
- **Files**: `plugins/project-kpis/src/lib/services/audit-report.service.ts`, `plugins/project-kpis/src/lib/services/efficiency-analysis.service.ts`, `plugins/project-kpis/tests/src/audit-report.spec.ts`, `docs/mcp-vertex/specs/project-observability-economics.md`
- **Gate**: e2e
- acceptance:
  - "The repository can generate its own KPI report from real local evidence."
  - "The audit view identifies incongruences such as schema/output mismatches, unexplained failures, missing telemetry dimensions, stale snapshots and plugin-level anomalies."
  - "Efficiency analysis compares configured baselines against observed MCP-assisted usage and labels causality as measured, inferred or unknown."
  - "The methodology documents formulas for coverage, delivery, reliability, latency, token efficiency, estimated savings and confidence."
- review-state: done
- review-implementer: mcp-vertex-orchestrator
- review-reviewer: delivery_verifier
- review-log: approved by delivery_verifier — Verificación independiente (revisor distinto del implementador): audit-report.service identifica incongruencias schema/resultado, fallos inexplicados, dimensiones de telemetría faltantes, snapshots stale y anomalías por plugin con evidencia por finding; efficiency-analysis compara baselines configurados vs uso observado y etiqueta causalidad measured/inferred/unknown sin inventar precios ni ahorros; metodología documenta fórmulas de coverage/delivery/reliability/latency/token efficiency/estimated savings/confidence. Suite plugin 21/21 (audit-report 11), typecheck 0, build limpio. Commit real dbed1157.
### S8 — Configuration i18n quality gates and end-to-end documentation
- **Status**: done
- **DependsOn**: [S4, S6, S7]
- **Files**: `mcp-vertex.config.json`, `plugins/project-kpis/plugin.manifest.ts`, `plugins/project-kpis/package.json`, `extensions/vscode/package.json`, `docs/mcp-vertex/PROJECT-OBSERVABILITY.md`, `plugins/project-kpis/tests/project-kpis.e2e.spec.ts`
- **Gate**: e2e
- acceptance:
  - "The plugin is loadable through the repository configuration and package metadata without exposing secrets or adding stdout noise."
  - "CLI, MCP and VS Code share the same configuration and schema semantics."
  - "Documentation covers privacy, retention, unavailable metrics, cost methodology, baselines and dogfooding commands."
  - "The full validation suite and an end-to-end smoke pass for the mcp-vertex repository."
- review-state: done
- review-implementer: mcp-vertex-orchestrator
- review-reviewer: delivery_verifier
- review-log: approved by delivery_verifier — Verificación independiente (revisor distinto del implementador): plugin loadable desde la configuración del repo sin exponer secretos ni ruido stdout (verify:tools project_kpis ✓ ok, e2e smoke valida que no filtra secretos); CLI/MCP/VS Code comparten contrato de snapshot y semántica de schema; documentación cubre privacy, retention, unavailable metrics, cost methodology, baselines y dogfooding; suite plugin 25/25 (incluye e2e 4), typecheck 0, manifest gates verdes. Commit real 1103f150.
## acceptance

- A new project-kpis plugin builds through definePlugin and exposes a versioned typed snapshot contract.
- The snapshot distinguishes measured, estimated, unavailable and not-configured values.
- The aggregation core consumes existing public plugin services or adapters instead of duplicating scanners.
- The aggregate output is deterministic, bounded and passes its Zod output schema.
- Every invocation record can attribute timestamp, session, host, agent type, extension, model when available, plugin, tool, request category, iteration, duration, outcome and error classification.
- Rollups support total calls, successful calls, failures, retries or iterations, latency and token fields by plugin, tool, model, agent, request type and time window.
- Errors and schema/result incongruences are represented as structured redacted records with correlation identifiers.
- Telemetry writes remain non-blocking and never persist prompts, response bodies, source content, credentials or secrets.
- Snapshots are persisted atomically under the configured cache path with retention and mutex protection.
- History supports daily or configurable windows and computes up, down, stable and unknown trends.
- Costs separate provider-reported usage, configured price estimates, subscription usage and unavailable values.
- Token savings and financial savings are reported only when a baseline and source data exist, including the methodology and confidence status.
- The CLI exposes summary, history, usage, costs, models, agents, plugins, errors, efficiency and audit views.
- Human output is scannable and includes metric status, source, period and limitations.
- JSON output is stable enough for CI and scripts and contains the same data as the human renderer.
- Watch mode refreshes without corrupting output and threshold mode can fail CI based on configured evidence-backed criteria.
- The MCP surface exposes summary, history, usage, economics, models, agents, plugins, errors, efficiency and audit views.
- Responses remain bounded and support filters for time window, dimensions and detail level.
- The LLM receives explicit data quality status, sources, estimates, privacy limits and recommended next actions.
- The tool contract is consumable through the same assembleCliConfig path used by hosts and tests.
- The extension dashboard displays health, delivery, quality, coverage, usage, cost, models, agents, plugins, errors and efficiency sections.
- At least trend charts exist for overall score, coverage, token usage/cost and calls/errors over time.
- The dashboard handles loading, partial data, unavailable metrics, MCP disconnects and empty history without misleading zeros.
- The status bar can expose the overall score and period while linking to the dashboard.
- The repository can generate its own KPI report from real local evidence.
- The audit view identifies incongruences such as schema/output mismatches, unexplained failures, missing telemetry dimensions, stale snapshots and plugin-level anomalies.
- Efficiency analysis compares configured baselines against observed MCP-assisted usage and labels causality as measured, inferred or unknown.
- The methodology documents formulas for coverage, delivery, reliability, latency, token efficiency, estimated savings and confidence.
- The plugin is loadable through the repository configuration and package metadata without exposing secrets or adding stdout noise.
- CLI, MCP and VS Code share the same configuration and schema semantics.
- Documentation covers privacy, retention, unavailable metrics, cost methodology, baselines and dogfooding commands.
- The full validation suite and an end-to-end smoke pass for the mcp-vertex repository.
