# Extension Authoring

This guide is the public contract for building an IDE host for
`mcp-vertex`. It covers two tiers:

- **TypeScript host**: depend on `@mcp-vertex/ui-extension` and
  `@mcp-vertex/client`, implement `IHostAdapter`, and reuse the shared
  renderers and service clients.
- **Any-language host**: speak MCP over stdio to the configured
  `mcp-vertex` server, call the same public tools, validate their JSON
  outputs against the published schemas, and render equivalent UI in the
  target IDE.

The VS Code extension in `extensions/vscode` is the reference host. It
does not own the contract; it demonstrates it.

## Compatibility Contract

The supported surface for extension authors is:

- `IHostAdapter` from `@mcp-vertex/ui-extension/public`.
- Public builders, render-model helpers, and component types exported by
  `@mcp-vertex/ui-extension/public`.
- Service-layer clients exported by `@mcp-vertex/client`.
- Tool `outputSchema` declarations and generated `tool-outputs.ts` maps.

Tool output schemas are the source of truth for data payloads. The
generated `<Package>ToolOutputs` maps expose the TypeScript view of those
schemas, while non-TypeScript hosts should consume the JSON Schema shape
returned by MCP tool discovery. Breaking schema changes must be explicit
and follow the repository's public schema compatibility policy, including
`toolSchemaVersion` when a surface publishes one; additive fields are
preferred.

Do not couple a host to internal files under `src/lib`. Public barrels are
the only supported import boundary.

## Tier A: TypeScript Host

A TypeScript host implements `IHostAdapter` and passes it to the shared UI
builders. The interface is intentionally small: required members cover the
host id, commands, status items, trees, webviews, notifications, document
navigation, configuration, and asset URI resolution. Optional members model
capabilities that not every IDE has.

Use the reference implementation as the concrete example:

- `extensions/vscode/src/host/vscode-host-adapter.ts` implements the host
  seam for VS Code.
- `packages/ui-extension/tests/fake-host-adapter.ts` is a minimal test
  adapter and is useful when scaffolding another host.
- `extensions/vscode/src/commands/open-dashboard.ts` shows the thin
  adapter pattern: host command in the IDE, shared renderer in
  `ui-extension`.

### Required Adapter Duties

An adapter must provide the stable host identity and the primitives needed
by shared renderers:

- Register and dispose commands.
- Create webview panels with HTML, CSP, and message plumbing.
- Show information, warning, and error messages.
- Open URIs or documents when the host supports navigation.
- Register tree data providers.
- Create status bar items.
- Read configuration and subscribe to configuration changes.
- Resolve bundled asset paths into webview-safe URIs.

The interface contract says missing host capabilities must not throw.
Required methods that an IDE cannot fully support should return typed empty
values or inert disposables and document the limitation in that adapter.
Optional capabilities such as command dispatch, sidebar webview providers,
and quick-pick dialogs should be omitted when unsupported.

### Adapter Member Matrix

| Member | Capability | Required |
|---|---|---|
| `id` | Stable machine host id. | Yes |
| `displayName` | Human-readable host name. | Yes |
| `hostVersion` | Host runtime version string. | Yes |
| `registerCommand` | Register a command and return a disposable. | Yes |
| `executeCommand` | Dispatch an already registered command. | No |
| `createStatusBarItem` | Create an item compatible with `IStatusBarItem`. | Yes |
| `registerTreeDataProvider` | Attach an `ITreeDataProvider` to a host view. | Yes |
| `createWebviewPanel` | Create an `IWebviewPanel` with HTML and options. | Yes |
| `registerWebviewViewProvider` | Attach a sidebar or docked webview provider. | No |
| `showInformationMessage` | Show an informational user message. | Yes |
| `showErrorMessage` | Show an error user message. | Yes |
| `showQuickPick` | Ask the user to choose one item. | No |
| `openTextDocument` | Open a document or URI in the host editor. | Yes |
| `revealInExplorer` | Reveal a URI in the host file explorer. | Yes |
| `onDidChangeConfiguration` | Subscribe to configuration changes. | Yes |
| `getConfiguration` | Read a typed configuration section. | Yes |
| `asWebviewUri` | Convert bundle paths into webview-safe URIs. | Yes |

### Service Layer

Use `@mcp-vertex/client` for stdio client setup and service wrappers.
Hosts should keep transport code out of views:

1. The host command calls a client/service method.
2. The service validates or narrows the tool result.
3. The command passes a plain render model to `ui-extension`.
4. The webview posts user actions back through the host adapter.

That split keeps renderers host-agnostic and makes the same feature usable
from VS Code, JetBrains, Zed, Neovim, or a browser-based shell.

## Tier B: Any-Language Host

A non-TypeScript host does not need the packages. It needs the protocol:

1. Launch or connect to the configured `mcp-vertex` MCP server over stdio.
2. Discover tools through the MCP list-tools flow.
3. Call compact orientation tools first, then feature tools as needed.
4. Validate `structuredContent` against each tool's `outputSchema`.
5. Render the returned JSON with native IDE components.

Useful entry points include the overview/catalog tools for orientation,
proposal tools for swarm work, provider health and usage tools for model
operations, and docs/search tools for reference lookup. Do not hardcode a
weekly-changing tool list in your extension; discover it from the server.

For write flows, preserve the coordination contract:

- Claim files before editing through the proposals agent-lock tool.
- Use proposal continuation/close-slice flows for multi-agent work.
- Treat lock conflicts as a user-visible blocked state.
- Never mutate workspace files outside a claimed ownership set.

## Rendering Payloads

Renderers should treat tool results as data, not HTML from the server.
The common pattern is:

- Tools return plain JSON in `structuredContent`.
- The host maps JSON to a local render model.
- The renderer escapes user-controlled text.
- Webview messages send small command payloads back to the host.

For TypeScript hosts, use the shared builders from
`@mcp-vertex/ui-extension/public`, including CSP helpers such as
`withCsp`, `injectCspMeta`, and `cspHeaderValue`. For other languages,
mirror the render models, not the implementation details.

## CSP And Webview Posture

Hosts that render HTML must use a restrictive content-security policy:

- Default to no remote script execution.
- Prefer nonces for local scripts.
- Restrict styles, images, and fonts to local webview resources unless a
  feature explicitly requires remote media.
- Sanitize all tool and user text before interpolation.
- Keep message handlers command-specific and validate payload shapes.

The VS Code adapter is the reference for this posture. Other IDEs should
apply the same policy using their native webview APIs.

## Internationalization

User-facing strings belong in host-local i18n dictionaries, not inside
tool payloads. The project site enforces a twelve-language dictionary
pattern for shipped web copy; host extensions should follow the same
shape when exposing equivalent copy:

- English source copy is canonical.
- Spanish should be translated when the feature ships.
- Other locales may temporarily fall back only when the local checker
  documents that fallback.

Keep protocol field names stable and language-neutral. Translate labels,
menus, onboarding, warnings, and empty states at the edge.

## CLI/UI Parity Duty

If a host exposes a command that corresponds to a CLI or MCP tool, map it
in the parity data or document a waiver. A visible command without a real
tool path is dead UI; a public tool with no reasonable host affordance
should have an explicit rationale.

The parity rule is not "every tool needs a button". Coordination,
automation, and low-level maintenance tools can remain CLI/MCP-only. The
rule is that human-facing surfaces must be discoverable and honest.

## Scaffold Expectation

`create_project { kind: "extension-host" }` generates a TypeScript
reference scaffold with:

- A minimal package with `package.json`, `tsconfig.json`, and Vitest.
- A small `IHostAdapter` implementation with required members wired as
  host-porting seams and optional members omitted until the host supports
  them.
- One example command that calls the overview tool and opens a webview.
- A passing example spec using a fake host.

Use `extensionHostName` to choose the host id and `description` for the
generated package metadata.

## Porting Checklist

- Use MCP tool discovery instead of a hardcoded catalog.
- Validate tool outputs against `outputSchema`.
- Keep UI rendering host-local and escape all text.
- Implement `IHostAdapter` only through public barrels in TypeScript
  hosts.
- Preserve agent locks and proposal state-machine flows for writes.
- Add native onboarding that covers connect, overview, dashboard, and
  proposals.
- Keep command/menu exposure aligned with the parity map or document a
  waiver.
