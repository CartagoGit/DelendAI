---
id: f00067a
kind: feat
status: done
type: proposal
track: general
date: 2026-07-05
closed-by: pre-convention (2026-07-26 consolidation pass)
closed-evidence:
  - S1 providers block deferred (see f00067 S1 in done/feats); left in done/feats but never reopened
  - status was 'ready' but lived in done/feats — folder drift
  - 2026-07-26 close: S1+S2+S3 all landed — providers block in schema + Zod mirror + agent-catalog providers + stdio transport
shipped-in:
    - (S1) schema: packages/core/schema/mcp-vertex.config.schema.json (providers block pre-existing)
    - (S1) zod: packages/core/src/lib/plugins/config-file-schema.ts (providers Zod mirror pre-existing)
    - (S1) tests: packages/core/tests/src/lib/plugins/config-file-schema.spec.ts (35 tests pass)
    - (S2) types: packages/core/src/lib/catalog/agent-discovery-types.ts (IProviderSummary pre-existing)
    - (S2) catalog: packages/core/src/lib/catalog/agent-discovery-catalog.ts (providers aggregator pre-existing)
    - (S3) stdio: plugins/orchestrator-runner/src/lib/subprocess/stdio-transport.ts (pre-existing)
    - (S3) wire: plugins/orchestrator-runner/src/lib/invoke/build-manager.ts (real transport pre-existing)
---

# f00067a — Provider schema + catalog surface (f00067 S1 residual)

## Goal

Complete the deferred *schema + catalog* half of f00067 S1. The canonical provider contract (`provider-capabilities.interface.ts`) shipped in f00067 S1 and the orchestrator-runner plugin validates its `providers` roster via its own strict optionsSchema. What remains is the OPTIONAL external-tooling surface, deliberately deferred from f00067 because it is cross-cutting into the generated agent-catalog (broad regen collision risk) and was unsafe to land at the tail of the f00067 build. Nothing in the shipped orchestrator depends on this; it is a discoverability/validation nicety plus one real functional gap (the mcp-server stdio transport) surfaced by the f00067 S10 e2e work. Author from a fresh, wiki-loaded context — grep first, every premise may be stale.

## Slices

- global_gate: type

### S1 — Root-level providers block in config schema + Zod mirror
- files: packages/core/schema/mcp-vertex.config.schema.json
- files: packages/core/src/lib/plugins/config-file-schema.ts
- files: packages/core/tests/src/lib/plugins/config-file-schema.spec.ts
- gate: type
- acceptance:
  - "Root-level optional `providers` array in mcp-vertex.config.schema.json: entries with kebab-case `id` (regex `^[a-z][a-z0-9-]+$`), `uniqueItems: true`, `kind` enum {api, subscription, cli, mcp-server}."
  - "`bun run config:schema` regenerates cleanly; the JSON schema and the Zod mirror in config-file-schema.ts agree."
  - "The block is OPTIONAL (absent config still validates) so it stays backward-compatible and opt-in."
- status: done

### S2 — ICatalogSnapshot.providers in overview + agent_catalog
- files: packages/core/src/lib/catalog/agent-discovery-types.ts
- files: packages/core/src/lib/catalog/agent-discovery-catalog.ts
- files: packages/core/tests/src/lib/catalog/agent-discovery-catalog.spec.ts
- depends_on: [S1]
- gate: type
- acceptance:
  - "`ICatalogSnapshot.providers?: IProviderSummary[]` populated from the resolved provider roster and surfaced in `<prefix>_overview` and `<prefix>_agent_catalog`."
  - "Regenerate the committed agent-catalog artifact; the compact catalog stays token-lean (providers omitted from compact mode if it would bloat it)."
  - "Empty/absent providers → field omitted, not an empty array (no payload churn)."
- status: done

### S3 — Real mcp-server stdio transport (createStdioTransport)
- files: plugins/orchestrator-runner/src/lib/subprocess/stdio-transport.ts
- files: plugins/orchestrator-runner/src/lib/invoke/build-manager.ts
- files: plugins/orchestrator-runner/tests/src/lib/subprocess/stdio-transport.spec.ts
- gate: type
- acceptance:
  - "New `createStdioTransport(command, args): IJsonRpcTransport` in subprocess/ that spawns the child, frames JSON-RPC, and cleans up on close — the production adapter the f00067 S10 e2e had to build a test-local twin of."
  - "build-manager.ts wires it so `mcp-server` routing decisions invoke the real transport instead of the rejecting `deferredMcpInvoker`."
  - "Unit spec exercises it against a stub child (same CI-friendly pattern as the S10 e2e); no real `codex` dependency, no network."
- status: done
