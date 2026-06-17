# Example: a custom mcp-core plugin (`wordcount`)

A minimal, **self-tested** plugin you can copy to author your own. It exposes one
tool — `<prefix>_wordcount` — that counts the words and characters in `text`.

## What it shows

[`src/index.ts`](src/index.ts) is the whole plugin in one file and demonstrates
the entire contract:

- **`definePlugin({ name, version, describe, optionsSchema, register })`** — the
  identity helper that gives you full type inference.
- **`optionsSchema`** (zod) — declarative validation of the options a host passes
  via `plugins.example-wordcount.options` in `mcp-core.config.json`. The loader
  rejects bad options *before* `register` runs, and `mcp-core --check` reports them.
- **A tool** (`IToolRegistration`) with `inputSchema` + `outputSchema` (zod) and a
  handler returning **`toolJson({...})`** (compact text + MCP `structuredContent`).
- **A `knowledge` entry** — lazy, on-demand context the agent can fetch.

The plugin never hardcodes paths or reads the environment — everything it needs
arrives on `ctx` (`ctx.namespacePrefix`, `ctx.workspace`, `ctx.options`, …), so the
same plugin behaves identically under any host/model.

## Run it

Once `@cartago-git/mcp-core` is installed:

```jsonc
// mcp.json
{
  "servers": {
    "mcp-core": {
      "command": "bunx",
      "args": ["@cartago-git/mcp-core", "--plugins=@cartago-git/example-wordcount"]
    }
  }
}
```

Or pass options through the config file:

```jsonc
// mcp-core.config.json
{
  "plugins": {
    "example-wordcount": { "options": { "splitOnPunctuation": false } }
  }
}
```

## Test it

[`tests/wordcount.spec.ts`](tests/wordcount.spec.ts) registers the plugin against a
tiny in-memory server and invokes the tool — proving the example actually works
(run with the repo's `bun run test`). Examples that aren't tested rot; this one
can't.

## Make it your own

1. Copy this folder, rename `name`/`package.json`.
2. Move real logic into a `lib/` engine (pure, dependency-injected) and keep
   `index.ts` thin — see the bundled plugins (`plugins/*`) for that shape.
3. Add more tools to the `tools: [...]` array; add `prompts`/`resources`/`skills`
   as needed (all optional).
