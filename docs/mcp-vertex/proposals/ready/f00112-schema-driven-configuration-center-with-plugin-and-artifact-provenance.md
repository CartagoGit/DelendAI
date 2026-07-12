---
id: f00112
title: "Schema-driven Configuration Center with plugin and artifact provenance"
kind: feat
status: ready
type: proposal
track: core+config+client+ui-extension+vscode+plugins+i18n+docs
date: 2026-07-12
---

# f00112 — Schema-driven Configuration Center with plugin and artifact provenance

## Goal

Provide a safe, friendly VS Code Configuration Center that introspects and
edits mcp-vertex project configuration; shows bundled, user-local and external
plugins with enabled state and validated properties/arguments; and inventories
agents, skills, prompts, resources and knowledge with the mcp-vertex plugin or
external server that owns each artifact.

## Why

The current extension offers a plugin activation QuickPick and a small settings
form, but neither is a complete project configuration surface. Users must edit
`mcp-vertex.config.json` by hand to configure plugin paths, prefixes and options,
and cannot inspect artifact provenance from one place. A safe editor must derive
forms from runtime-owned schemas, preserve custom/unknown fields, validate
before writing, and make external edits/conflicts visible.

## Non-goals

- No hot reload of an already-running MCP server; committed runtime changes
  offer an explicit restart.
- No arbitrary secret editor. Secret-like fields stay redacted and use their
  owning secure-store workflow.
- No plugin sandboxing or permission model; provenance is visibility metadata.
- No conversion of host-only preferences into project configuration.
- No inference of forms from opaque `options`; plugins without metadata remain
  visible with a raw, preservation-safe fallback.

## Architecture

The 2026-07-12 audit recorded the following evidence and resolution tracks.

### 1. Runtime option validation exists, but it is not introspectable

**File**: `packages/core/src/lib/plugins/load-plugins.ts:291-300`

```typescript
if (plugin.optionsSchema) {
  const parsed = plugin.optionsSchema.safeParse(ctx.options);
  if (!parsed.success) errors.push({ message: 'plugin rejected its options' });
}
```

**Problem**: plugins can validate `options`, but activation/UI payloads expose no
serializable schema, defaults, examples or field descriptions. Reconstructing
forms by guessing over `options: unknown` would create a second, drifting schema.
**Impact**: the extension cannot safely render or validate plugin properties.
**Resolution Track**: S1 exposes a lazy serializable metadata contract; S5 makes
first-party and convention-compliant external plugins publish it from their
runtime source of truth.

### 2. The switchboard cannot represent configuration or ownership

**File**: `packages/ui-extension/src/contracts/interfaces/plugin-switchboard.interface.ts:6-27`

```typescript
readonly id: string;
readonly origin: PluginSwitchboardOrigin;
readonly active: boolean;
readonly source: PluginSwitchboardSource;
readonly toolCount: number;
```

**Problem**: the model contains only activation summary fields; it has no
`path`, `prefix`, `options`, schema, agents, skills, prompts or owner/provenance.
**Impact**: a toggle list cannot satisfy project/plugin/artifact configuration.
**Resolution Track**: S3 adds a separate Configuration Center model rather than
overloading the token-lean switchboard.

### 3. Existing activation writes can destroy an invalid config

**File**: `packages/client/src/lib/services/plugin-activation.service.ts:23-30,94-108`

```typescript
try {
  return parseConfigFile(await readFile(configFile, 'utf8'));
} catch {
  return {};
}
// later: await writeFileAtomic(configFile, nextText)
```

**Problem**: every read/parse/permission error is treated as an absent config.
A toggle can replace the original bytes with a minimal new document.
**Impact**: malformed JSON or transient I/O errors can erase unrelated plugin,
provider and path configuration.
**Resolution Track**: S2 fails closed except on ENOENT, validates before commit,
preserves unknown fields and detects concurrent edits.

### 4. VS Code settings are contributed at the wrong manifest level

**File**: `extensions/vscode/package.json:323-354`

```json
},
"configuration": {
  "title": "MCP Vertex server",
  "properties": { "mcp-vertex.server.command": { "type": "string" } }
}
```

**Problem**: `configuration` is top-level, after `contributes` closes. VS Code
only registers `contributes.configuration`.
**Impact**: command/args/prefix are read by extension code but do not appear as
declared settings in the editor.
**Resolution Track**: S4 fixes the manifest and adds a structural regression.

## Slices

- global_gate: e2e

### S1 — Serializable configuration and provenance introspection
- **Status**: done
- **Files**: `packages/core/src/lib/configuration-center/configuration-center.ts`, `packages/core/src/lib/contracts/interfaces/configuration-center.interface.ts`, `packages/core/src/lib/tools/configuration-center.tool.ts`, `packages/core/src/lib/cli/assemble.ts`, `packages/core/src/public/index.ts`, `packages/core/tests/src/lib/configuration-center/configuration-center.tool.spec.ts`, `packages/core/src/generated/tool-outputs.ts`, `docs/mcp-vertex/agent-catalog.generated.json`
- **Gate**: type
- **Evidence (2026-07-12)**:
  - "Added the read-only `configuration_center` tool with summary/config/plugins/artifacts sections, numeric cursor pagination, a public outputSchema and lazy detail: the default summary contains counts only and does not embed config, schemas or lists."
  - "The root Zod config schema is projected to JSON Schema on demand. Loaded and disabled plugin rows reconcile activation origin/source with path, prefix, redacted options, runtime-derived JSON Schema when serializable, examples and registration capability counts. Validators that cannot serialize report `schemaStatus: unavailable` instead of guessed forms."
  - "Prompts, resources and knowledge retain their owning loaded plugin; skill ownership derives from the manifest's authored `appliesTo`; unavailable agent ownership is reported explicitly. Config and duplicated plugin options are redacted before any section can return them."
  - "Verified: typecheck; Biome; 3 focused suites / 14 tests including real assembly, pagination, redaction and outputSchema; verify:tools 270/270; generated SDK and live catalog checks."
- acceptance:
  - "Expose the canonical root config schema plus current redacted values without persisting or returning secrets."
  - "Each plugin reports id, origin, active state, activation source, path/prefix/options, serializable options schema/defaults/examples and capabilities."
  - "Agents, skills, prompts, resources and knowledge report owner plugin/server plus bundled, user-local or external provenance; missing metadata degrades explicitly, never by guessing."
  - "Default overview remains token-lean; detailed schemas and artifacts are lazy and paginated with outputSchema coverage."

### S2 — Safe merge-aware project config document service
- **Status**: pending
- **Files**: `packages/client/src/lib/services/configuration-center.service.ts`, `packages/client/src/lib/contracts/interfaces/configuration-edit.interface.ts`, `packages/client/src/public/index.ts`
- **DependsOn**: [S1]
- **Gate**: type
- **Progress (2026-07-12)**: the independent activation-writer safety finding is
  hardened ahead of S1. `plugin-activation.service.ts` now treats only `ENOENT`
  as an empty document; malformed/non-object JSON and read/permission failures
  fail closed before mutation while the existing `withFileMutex` +
  `writeFileAtomic` persistence path remains mandatory. Colocated regressions
  cover absent-file creation, corrupt-byte preservation and I/O-error byte
  preservation. The S2 document service, schema validation, optimistic digest,
  secret policy and public contracts remain pending on S1.
- acceptance:
  - "ENOENT creates a new config; parse, permission and schema errors preserve original bytes and return actionable failures."
  - "Writes preserve unknown/unowned keys and untouched plugin path/prefix/options blocks, validate before commit, and use withFileMutex plus writeFileAtomic."
  - "An optimistic digest detects external edits and returns a conflict instead of losing updates."
  - "Secret-valued fields are redacted on reads and rejected from unsafe durable persistence paths."

### S3 — Host-agnostic Configuration Center model and renderer
- **Status**: pending
- **Files**: `packages/ui-extension/src/configuration-center/**`, `packages/ui-extension/src/contracts/interfaces/configuration-center.interface.ts`, `packages/ui-extension/src/public/index.ts`
- **DependsOn**: [S1, S2]
- **Gate**: type
- acceptance:
  - "Navigation covers General, Plugins, Providers, Agents, Skills and Prompts with origin and owner badges plus searchable rows."
  - "Plugin forms derive controls from advertised schema and display unsupported or unknown fields without deleting them."
  - "Accessible keyboard, focus, validation, dirty, conflict and reduced-motion states are built into the renderer."
  - "No vscode import or host-specific storage exists in the package."

### S4 — VS Code Configuration Center host and project adapters
- **Status**: pending
- **Files**: `extensions/vscode/src/commands/open-configuration-center.ts`, `extensions/vscode/src/views/configuration-center-webview.ts`, `extensions/vscode/src/contracts/interfaces/configuration-center-message.interface.ts`, `extensions/vscode/src/i18n/configuration-center.strings.ts`, `extensions/vscode/package.json`
- **DependsOn**: [S3]
- **Gate**: type
- acceptance:
  - "A contributed command opens the center for an explicitly selected workspace folder in multi-root workspaces."
  - "Every inbound webview message is schema-validated and restricted to declared configuration operations."
  - "Save waits for host acknowledgement, shows validation/conflict errors, preserves config on failure and offers restart only after a committed runtime-affecting change."
  - "All copy exists in every language and server settings live under contributes.configuration with a manifest regression test."

### S5 — First-party and external plugin metadata adoption
- **Status**: pending
- **Files**: `plugins/*/src/configuration-metadata.ts`, `plugins/*/src/index.ts`, `plugins/*/README.md`
- **DependsOn**: [S1]
- **Gate**: type
- acceptance:
  - "First-party plugins publish schemas/defaults/examples from their runtime source rather than duplicate hand-written property lists."
  - "User-local convention-compliant plugins appear automatically with declared metadata and user-local provenance."
  - "External MCP children retain command/version/env definitions, expose only safe editable fields, and carry external provenance."

### S6 — Configuration Center regressions and end-to-end safety
- **Status**: pending
- **Files**: `packages/core/tests/src/lib/configuration-center/configuration-center.e2e.spec.ts`, `packages/client/tests/services/configuration-center.service.spec.ts`, `packages/ui-extension/src/configuration-center/configuration-center.spec.ts`, `extensions/vscode/src/test/configuration-center.spec.ts`
- **DependsOn**: [S1, S2, S3, S4, S5]
- **Gate**: e2e
- acceptance:
  - "Cover bundled, user-local and external plugins; active states; custom arguments/options; artifact provenance; corrupt JSON; concurrent conflict; acknowledgement and restart."
  - "Round-trip fixtures prove no unknown field, path/prefix/options block or disabled external definition is lost."
  - "No polling, recursive navigation or delayed work can repaint an unmounted center."

### S7 — Configuration Center user and author documentation
- **Status**: pending
- **Files**: `docs/mcp-vertex/CONFIGURATION-CENTER.md`, `docs/mcp-vertex/PLUGINS-MCP-VERTEX.md`, `apps/web/src/content/docs/configuration-center.md`
- **DependsOn**: [S6]
- **Gate**: lint
- acceptance:
  - "Document ownership/provenance, safe-edit semantics, restart requirements, plugin metadata convention and external plugin behaviour."
  - "Explain project config versus VS Code host preferences and conflict/error recovery."

## Acceptance

- `bun run validate` exits 0.
- A user can inspect and safely configure mcp-vertex, every discoverable plugin
  and its declared options from VS Code without hand-editing JSON.
- Agents, skills, prompts, resources and knowledge show their owning plugin or
  external server and their origin.
- Invalid, corrupt or concurrently edited config is never overwritten.
- The center remains accessible, localized, responsive and free of polling,
  navigation loops and stale rerenders.
