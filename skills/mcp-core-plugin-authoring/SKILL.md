---
name: mcp-core-plugin-authoring
description: How to author or modify an mcp-core plugin — the contract, the namespace, outputSchema discipline, durable state, path containment, and the test/build gates. Use when adding a tool, creating a plugin, or changing a plugin's surface.
---

# Authoring an mcp-core plugin

A plugin is an opt-in capability the core loads by specifier. The core stays
agnostic; the plugin receives everything resolved through `IMcpPluginContext`.

## The contract

```ts
import { definePlugin } from '@cartago-git/mcp-core/public';

export default definePlugin({
  name: 'example',                 // becomes the tool namespace prefix
  // optionsSchema: z.object({...}) // validated BEFORE register() runs
  register(ctx) {                  // ctx: IMcpPluginContext
    // ctx.workspace, ctx.corePaths, ctx.pluginCacheDir, ctx.pluginDocsDir,
    // ctx.namespacePrefix, ctx.options, ctx.args
    return { tools: [/* IToolRegistration[] */], prompts, resources, knowledge };
  },
});
```

- **Namespace everything.** Tools are exposed as `<namespace>_<tool>`; never collide.
- **Declare an `outputSchema` for every tool.** Open `catchall` schemas are a
  documented exception, not the default. Return compact JSON via `toolJson`/`toolOk`,
  errors via `toolError` (`{ ok:false, error:{ reason, nextAction } }`).
- **Validate inputs with Zod** (`.strict()`, `.min(1)`, no unknown keys).

## Invariants (non-negotiable)

- No `process.cwd()` — resolve paths from `ctx.workspace` / injected options.
- Async I/O only in handlers/engines (`fs/promises`); no `*Sync` in hot paths.
- Workspace-scoped path inputs (`roots`, `manifest`, …) → `resolveWorkspaceContained`.
- Durable state → `withFileMutex` + `writeFileAtomic`; treat corrupt ≠ empty with
  `quarantineCorruptFile`.
- Persisting user text → run it through `redactSecrets` first.
- Keep engines pure over injected readers so tests don't touch the real FS.

## Checklist before you commit

1. Tests next to the code (`*.spec.ts`); protocol behaviour → e2e with a real
   in-memory MCP server (mirror `packages/core/tests/src/lib/e2e`).
2. `bun run types:generate` if the tool surface changed (drift-guard test enforces it).
3. Update the plugin `README.md`; if user-visible on the site, add ALL i18n keys.
4. `bun run validate` green.
5. Conventional Commit (`feat(<plugin>): …`).
