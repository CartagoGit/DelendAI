---
id: f00112
title: "Schema-driven Configuration Center with plugin and artifact provenance"
kind: feat
status: ready
type: proposal
track: configuration-center
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
- **Status**: done
- **Files**: `packages/client/src/lib/services/configuration-center.service.ts`, `packages/client/src/lib/contracts/interfaces/configuration-edit.interface.ts`, `packages/client/src/public/index.ts`
- **DependsOn**: [S1]
- **Gate**: type
- **Evidence (2026-07-12)**:
  - "Added a public host-neutral document contract and service with redacted
    snapshots, exact-byte SHA-256 digests and path-based set/delete edits."
  - "Each save re-reads under `withFileMutex`, compares the optimistic digest,
    applies edits to the fresh document, validates core-owned fields with the
    canonical schema and commits through `writeFileAtomic`; competing saves
    deterministically produce one winner and one conflict."
  - "Unknown root fields and untouched plugin path/prefix/options survive the
    round trip. Missing-file deletion is a no-op; malformed/non-object JSON,
    schema errors, invalid paths, non-JSON values and symlinked config files
    fail closed without changing bytes."
  - "Reads redact high-confidence credentials. Set operations reject
    secret-named fields and secret-like values, while delete remains available
    for removing an existing credential without surfacing it."
  - "The earlier activation switchboard mutation remains hardened: only
    `ENOENT` creates an empty document; parse and I/O failures preserve the
    original file. Focused configuration/activation suites pass 18 tests and
    root typecheck is green."
  - "Incidental package-gate finding: the real-stdio client e2e resolved the
    core CLI from `process.cwd()`, so `bun run --cwd packages/client test`
    spawned a nonexistent path. It now resolves from `import.meta.url` and
    passes from both repository and package working directories."
  - "A clean dependency rebuild also exposed one stale compact-catalog
    assumption in the web capability generator: core tools legitimately omit
    their redundant plugin field. The generator now infers `core` from that
    omission while preserving explicit external plugin ownership."
- acceptance:
  - "ENOENT creates a new config; parse, permission and schema errors preserve original bytes and return actionable failures."
  - "Writes preserve unknown/unowned keys and untouched plugin path/prefix/options blocks, validate before commit, and use withFileMutex plus writeFileAtomic."
  - "An optimistic digest detects external edits and returns a conflict instead of losing updates."
  - "Secret-valued fields are redacted on reads and rejected from unsafe durable persistence paths."

### S3 — Host-agnostic Configuration Center model and renderer
- **Status**: done
- **Files**: `packages/ui-extension/src/configuration-center/**`, `packages/ui-extension/src/contracts/interfaces/configuration-center.interface.ts`, `packages/ui-extension/src/public/index.ts`
- **DependsOn**: [S1, S2]
- **Gate**: type
- **Evidence (2026-07-12)**:
  - "Added a public pure model builder and full HTML/CSS/vanilla-JS renderer
    under `@mcp-vertex/ui-extension`; it imports no VS Code API and dispatches
    typed edit payloads through an injected generic host or DOM event fallback."
  - "Navigation covers General, Plugins, Providers, Agents, Skills and Prompts
    with counts, search, owner/origin/active badges and an explicit unavailable
    state instead of guessed agent ownership."
  - "Root and plugin controls derive from advertised JSON Schema for scalar,
    enum, nested object and JSON fields. Unknown keys remain visible as raw JSON;
    opaque plugins get a preservation-safe options fallback. Any object that
    contains a redacted value becomes read-only so a partial edit cannot replace
    hidden credentials with placeholders."
  - "External `ext.*` rows map activation and raw server edits to
    `plugins.external-mcps.options.servers.<id>` rather than creating invalid
    native-plugin blocks. Project-local plugin path/prefix/options retain their
    native paths."
  - "The renderer includes roving keyboard tabs, labels/ARIA live regions,
    focus states, responsive layout, reduced-motion handling, dirty/JSON-invalid,
    saving/acknowledged/conflict states and delete edits for cleared optional
    fields. It never announces save success before host acknowledgement."
  - "Verified: ui-extension typecheck and its complete 28-suite / 178-test gate."
- acceptance:
  - "Navigation covers General, Plugins, Providers, Agents, Skills and Prompts with origin and owner badges plus searchable rows."
  - "Plugin forms derive controls from advertised schema and display unsupported or unknown fields without deleting them."
  - "Accessible keyboard, focus, validation, dirty, conflict and reduced-motion states are built into the renderer."
  - "No vscode import or host-specific storage exists in the package."

### S4 — VS Code Configuration Center host and project adapters
- **Status**: in-progress
- **Files**: `extensions/vscode/src/commands/open-configuration-center.ts`, `extensions/vscode/src/views/configuration-center-webview.ts`, `extensions/vscode/src/contracts/interfaces/configuration-center-message.interface.ts`, `extensions/vscode/src/i18n/configuration-center.strings.ts`, `extensions/vscode/package.json`
- **DependsOn**: [S3]
- **Gate**: type
- **Progress (2026-07-13)**:
  - "Contributed and registered `Open Configuration Center`. The command
    requires a workspace, explicitly picks a folder in multi-root windows,
    reads the local digest-addressed document and exhausts the MCP's paginated
    config/plugin/artifact sections with repeated-cursor protection."
  - "The webview uses the shared renderer behind the centralized CSP policy.
    Its bridge acquires the VS Code API once; every inbound save/discard message
    passes a strict Zod discriminated-union schema with bounded edits and paths."
  - "Save delegates to the merge-aware service, reports validation/conflict
    back to the webview, waits for durable acknowledgement before showing
    success, and offers restart only after a changed commit. Discard reloads
    from disk and server without polling. Handler failures are caught and
    surfaced rather than becoming unhandled webview promise rejections."
  - "Moved server command/args/prefix settings from the invalid manifest root
    into `contributes.configuration` and added a structural regression. VS Code
    typecheck, build and its complete 41-suite / 179-test gate pass."
  - "Still pending before S4 can be marked done: route the renderer and host
    chrome through typed 12-language copy, then visually inspect the real panel
    in the Extension Development Host."
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
