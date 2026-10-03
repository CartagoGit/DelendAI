# Configuration Center

The Configuration Center is the schema-driven project editor included in the
delendai VS Code extension. Run **DelendAI: Open Configuration Center**
from the command palette. In a multi-root window, choose the workspace whose
`delendai.config.json` you want to inspect.

## What it shows

- **General** — root configuration fields advertised by the core schema.
- **Plugins** — bundled, project-local and composed external plugins; active
  state, origin, source, path/prefix and schema-backed options.
- **Providers** — provider definitions from the root `providers` array.
- **Agents, Skills, Prompts, Resources and Knowledge** — discovered artifacts
  with their owning plugin and origin. A warning means that the running host
  cannot provide ownership metadata for that artifact kind.

Search filters plugin cards and artifacts without calling the server. Tabs,
keyboard navigation and responsive layouts work entirely inside the webview;
there is no polling.

## Project configuration versus VS Code preferences

The center edits only `<workspace>/delendai.config.json`. These settings are
versionable project policy and affect the next delendai server process.

VS Code's `delendai.server.command`, `delendai.server.args` and
`delendai.server.prefix` preferences select how the extension starts and
addresses that process. They live under VS Code Settings and are not written
to the project file. Theme and language are host preferences too.

## Safe editing model

The extension reads the exact file bytes and records a SHA-256 digest. Saving
submits bounded path edits with that digest; the client takes a file mutex,
re-reads the document, merges only those paths, validates the complete result,
and atomically replaces the file. Unknown root fields, plugin path/prefix,
custom options and disabled external definitions remain untouched.

If another editor changes the file first, saving returns a conflict and does
not overwrite either version. Choose **Discard** to reload, review the fresh
values and apply the change again. Invalid JSON, schema-invalid values,
symlinked configuration files and paths outside the workspace fail closed.

Secret-looking values are redacted and read-only. External MCP `env` entries
are environment-variable names only; put the corresponding values in the
shell or host secret store. Cleartext assignments such as `TOKEN=value` are
rejected. A secret field may be deleted without returning its original value.

After a changed save, the extension offers **Restart server**. The success
message appears only after the atomic write completes. A no-op save does not
restart anything.

## Plugin metadata convention

Native and project-local plugins use the same runtime contract:

```ts
export default definePlugin({
  name: 'my-plugin',
  optionsSchema: z.object({
    mode: z.enum(['safe', 'fast']).default('safe'),
  }),
  configExample: {
    summary: 'Run the plugin in safe mode.',
    options: { mode: 'safe' },
  },
  register(ctx) {
    // ctx.options was validated by optionsSchema.
    return { tools: [] };
  },
});
```

Declare a project-local plugin with `plugins.<id>.path`; the loader preserves
`user-local` provenance and the center renders its schema automatically.
Defaults shown by the editor come from the serialized runtime schema, not a
second hand-maintained property list. Keep every `configExample.options`
valid against that same schema.

Composition plugins may attach generic `configuration` metadata to activation
contributions. `external-mcps` uses this contract for each `ext.<server>` child,
so command, exact version, arguments, namespace, detection rule, enabled state
and environment-variable names stay editable at their original nested path.

## Recovery

| Symptom | Safe action |
|---|---|
| File changed outside the editor | Discard/reload, then reapply the intended fields. |
| Invalid JSON | Repair `delendai.config.json` in a text editor; the center will not overwrite it. |
| Value rejected | Correct the highlighted value; the original bytes remain unchanged. |
| Secret value hidden | Configure the secret in the environment/host store, or delete the field. |
| Change saved but runtime unchanged | Accept **Restart server**, or run the restart command manually. |
| Ownership unavailable | Restart with the owning plugin loaded; the center reports absence explicitly. |

For external-server rules and the complete plugin author contract, see
[`PLUGINS-DELENDAI.md`](PLUGINS-DELENDAI.md).
