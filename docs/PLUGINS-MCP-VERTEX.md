# Creating plugins for mcp-vertex

A **plugin** is an npm package (or a local module) that adds tools, prompts,
resources and knowledge to an mcp-vertex server. You enable it at runtime:

```bash
mcp-vertex --plugins=myfeature
```

mcp-vertex resolves `myfeature` to a module (see _Resolution_ below), imports it,
and calls its `register(ctx)`. One plugin failing never aborts the others.

## The contract

A plugin module **default-exports** an `IMcpPlugin` (or a factory returning
one). Use `definePlugin` for type-safety:

```ts
import { definePlugin } from '@mcp-vertex/core/public';
import { z } from 'zod';

export default definePlugin({
	name: 'myfeature',          // also the default tool namespace + cache dir
	version: '0.1.0',
	describe: 'What this plugin adds, in one model-agnostic line.',
	register(ctx) {
		const prefix = ctx.namespacePrefix; // 'myfeature' unless overridden
		return {
			tools: [
				{
					id: 'myfeature_do',
					register: async (server) => {
						server.registerTool(
							`${prefix}_do`,
							{ description: '…', inputSchema: z.object({ x: z.string() }) },
							async ({ x }) => ({
								content: [{ type: 'text', text: JSON.stringify({ ok: true, x }) }],
							}),
						);
					},
				},
			],
			knowledge: [{ id: 'myfeature-overview', title: 'My feature', body: '…' }],
			// prompts: [...], resources: [...], skills: [...]  (all optional)
		};
	},
});
```

### What `register` receives (`ctx`)

| Field | Meaning |
|---|---|
| `ctx.workspace` | Resolves workspace-relative paths to absolute. **Never use `process.cwd()`.** |
| `ctx.corePaths` | `{ cacheDir, docsDir }` as resolved from the CLI. |
| `ctx.cacheDir` / `ctx.docsDir` | Shorthands for the above. |
| `ctx.keepLegacy` | Global preservation preference from `mcp-vertex.config.json` (default `false`). Plugins that regenerate durable project files should preserve the old file first when this is `true`. |
| `ctx.pluginCacheDir` | Your private scratch root: `<cacheDir>/<name>`. |
| `ctx.pluginDocsDir` | Your docs root: `<docsDir>/<name>`. |
| `ctx.namespacePrefix` | Tool namespace (default `name`, override with `plugins.<name>.prefix` in the config file). |
| `ctx.options` | **Your typed options** from `mcp-vertex.config.json` → `plugins.<name>.options` (any JSON). Empty `{}` when absent. This is the structured way to receive values. |
| `ctx.args` | Unrecognised global `--key=value` CLI flags, forwarded for you to read. |

### Receiving values (`mcp-vertex.config.json`)

Users pass values to your plugin through the config file at the workspace root:

```jsonc
{ "plugins": { "myfeature": { "prefix": "mf", "options": { "limit": 10, "paths": ["a", "b"] } } } }
```

Read them in `register` via `ctx.options.limit` etc. Validate them yourself
(e.g. with zod) and apply defaults — treat `ctx.options` as untrusted JSON.

### What `register` returns (`IMcpPluginRegistrations`)

All optional: `tools`, `prompts`, `resources`, `knowledge`, `skills`.

## Resolution

`--plugins=<spec>` is resolved in order:

1. `./path` or `/abs` or `file:` → used verbatim (great for local dev).
2. `@scope/pkg` (contains `/`) → used verbatim.
3. bare `name` → `@mcp-vertex/<name>`, then `mcp-<name>`, then `name`.

## Generate a plugin skeleton

Let mcp-vertex write the boilerplate for you:

```bash
# via the scaffold tool (kind: plugin) or:
mcp-vertex_create_server  { "kind": "plugin", "pluginName": "myfeature", "description": "…" }
```

It produces `plugins/myfeature/` with `package.json`, `tsconfig.json`,
`src/index.ts` (a working `IMcpPlugin` with a `_ping` tool) and a `README.md`.

## Rules for great, model-agnostic, low-token plugins

1. **Strict schemas in, structured JSON out.** Don't return prose an LLM has to
   parse — return data. This is what keeps a plugin reliable across models.
2. **Idempotent & deterministic.** Same input → same effect; re-runs are safe.
3. **Namespace everything** with `ctx.namespacePrefix`; never hardcode names.
4. **All state under `ctx.pluginCacheDir`**, all docs under `ctx.pluginDocsDir`.
   Resolve to absolute with `ctx.workspace.resolve(...)`.
5. **Respect `ctx.keepLegacy` for generated durable project files.** The core
   scaffold moves existing targets to `legacy/` before rewriting when this flag
   is true; plugins with similar regeneration flows should offer the same
   preservation contract.
6. **No host imports, no `process.cwd()`.** Everything you need is in `ctx`.
7. **Keep knowledge short and on-demand.** It is loaded per plugin; small,
   precise bodies cost the agent fewer tokens.

## Example plugin

See `plugins/proposals` (`@mcp-vertex/proposals`) for a real plugin: it
derives its paths from `ctx`, exposes `agent_lock` and `task_queue`, and ships
a compact workflow knowledge entry.
