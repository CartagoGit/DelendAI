# Authoring plugins with incident-driven logging (f00154)

This document is for **plugin authors** — anyone writing a plugin that
ships under `plugins/` or in a third-party project that consumes
`@delendai/core`. It shows how to make every error path in your
plugin surface in the `logs` JSONL streams without writing a single
line of logging code.

If you only want to add a `mcp-vertex_logs_log` call to your own
code, jump to **[`ctx.logs.log(...)`](#ctxlogslogg---the-write-side-helper)**.
If you want every `toolError(...)` in your tools to become a
structured incident automatically, jump to
**[`withIncidentLogging`](#withincidentlogging---the-opt-in-adapter)**.
If you are operating a host and want the `logs` plugin to be loaded
unconditionally, jump to
**[`--strict-logs`](#--strict-logs---auto-load-the-logs-plugin)**.

---

## The contract — `IPluginLogInput` and `IPluginLogsHelper`

Both types are exported from `@delendai/core/public`. The
`severity` field is the syslog 7-level taxonomy f00153 ships
(`debug` / `info` / `notice` / `warning` / `error` / `critical` /
`alert` / `emergency`). The `incidentType` field is a lower-case
slug in `^[a-z][a-z0-9-]{0,63}$` — choose one that describes the
recurring class of bug, not the hook that caught it.

```ts
import type {
	IPluginLogInput,
	IPluginLogsHelper,
} from '@delendai/core/public';

// ctx is the IMcpPluginContext handed to your register() hook.
await ctx.logs?.log({
  severity: 'critical',
  incidentType: 'lock-conflict',
  message: 'agents/proposals.lock held > 30s by agent peer-1',
  files: ['agents/proposals.lock'],
  agent: 'peer-1',
  context: { lockPath: 'agents/proposals.lock', heldMs: 32_000 },
});
```

`ctx.logs` is `undefined` when the `logs` plugin is not in the
host's load set. Always null-check (`ctx.logs?.log(...)`).

The helper is the same writer `mcp-vertex_logs_log` uses, so an
emitted entry is queryable by `mcp-vertex_logs_query` /
`mcp-vertex_logs_search` / `mcp-vertex_logs_incidents` with the same
`severity` and `incidentType`.

---

## `ctx.logs.log(...)` — the write-side helper

The helper is the simple path. Use it when:

- You have a single concrete incident to record (e.g. "config file
  is malformed", "command policy denied this command").
- You already know the `severity` / `incidentType` / `message` and
  do not need a wrapper around a tool handler.

The helper **does not** wrap a tool call. It only emits one
incident. For wrapping a tool handler so every `toolError(...)` it
returns becomes an incident, use `withIncidentLogging`.

```ts
import { z } from 'zod';
import {
	type IPluginLogsHelper,
	type IPluginLogInput,
	toolError,
	toolJson,
} from '@delendai/core/public';

export default definePlugin({
  name: 'my-plugin',
  version: '0.1.0',
  describe: 'Example plugin that emits structured incidents.',
  register(ctx) {
    return {
      tools: [
        {
          id: 'my_broken_tool',
          summary: 'A tool that intentionally fails to demonstrate incident logging.',
          register: async (server) => {
            server.registerTool(
              `${ctx.namespacePrefix}_my_broken_tool`,
              {
                description: 'Always returns an error to demonstrate incident logging.',
                inputSchema: z.object({}),
                outputSchema: z.object({ ok: z.literal(true) }),
              },
              async () => {
                if (ctx.logs) {
                  await ctx.logs.log({
                    severity: 'warning',
                    incidentType: 'example-failure',
                    message: 'my_broken_tool was invoked',
                    context: { demo: true },
                  });
                }
                return toolError('demonstration', 'this tool always fails');
              },
            );
          },
        },
      ],
    };
  },
});
```

---

## `withIncidentLogging` — the opt-in adapter

The wrapper is the default-on path. Use it when:

- A tool handler returns `toolError(...)` for any of its failure
  paths and you want each one to surface as an incident.
- You do **not** want to add `if (ctx.logs) { … }` branches inside
  the handler.
- You want `logs_incidents` to cluster the failures by your
  plugin's `incidentType`.

The wrapper is **opt-out** at the registration level (set
`incidentLoggingDisabled: true` on the registration) and
**opt-in** at the tool level (you wrap the handler yourself). The
default `incidentType` is `tool-failure`; override per-tool.

```ts
import {
	type ILogsSink,
	type IToolRegistration,
	withIncidentLogging,
} from '@delendai/core/public';

export const buildMyToolRegistration = (
  options: { namespacePrefix: string; logsSink?: ILogsSink },
): IToolRegistration => ({
  id: 'my_tool',
  summary: 'Runs a thing; failures are incident-logged as my-failure.',
  register: async (server) => {
    server.registerTool(
      `${options.namespacePrefix}_my_tool`,
      {
        description: '…',
        inputSchema: z.object({ /* … */ }),
        outputSchema: z.object({ /* … */ }),
      },
      withIncidentLogging(
        { incidentType: 'my-failure' },
        { logsSink: options.logsSink },
        async (args) => {
          // Throw or return toolError(...) — both surface as
          // structured incidents with the right incidentType.
          return toolError('something went wrong', '…');
        },
      ),
    );
  },
});
```

The wrapper:

- Returns the original handler result untouched (so the MCP wire
  format is unchanged).
- Emits **one** incident per failed call with `severity: 'error'`
  (configurable), `incidentType: 'my-failure'`, and a `message`
  extracted from the error envelope.
- Swallows sink failures (the tool error still reaches the caller).
- Is a no-op when `logsSink` is `undefined` (the `logs` plugin is
  not loaded and the host did not pass `--strict-logs`).

### Opting out

For tools that intentionally return failure as part of their
contract (e.g. `redact_test`, `proposals_locate`, `logs_search` with
an invalid regex), set `incidentLoggingDisabled: true` on the
registration:

```ts
{
  id: 'redact_test',
  incidentLoggingDisabled: true,
  register: async (server) => { /* … */ },
}
```

---

## The `ILogsSink` contract (low-level)

The core uses `ILogsSink.record(event)` to publish every tool-call
lifecycle event (`tool-started` / `tool-completed` / `tool-failed`
/ `tool-cancelled`). Two implementations ship in
`@delendai/core`:

- `LogsPluginSink` — wraps the `logs` plugin's `appendEvent`.
- `ConsoleLogsSink` — always-available fallback that writes
  redacted JSON lines to stderr.

Most plugin authors do **not** need to touch `ILogsSink` directly;
`withIncidentLogging` is built on top of it. If you are writing a
custom sink (e.g. an external SIEM bridge), set
`logsSink: { id, record }` on your plugin's `register()` return
value; the core will pick it up and route lifecycle events to it.

---

## `--strict-logs` — auto-load the `logs` plugin

```bash
mcp-vertex --plugins=audit,quality,security --strict-logs
```

When `--strict-logs` is on and the explicit `--plugins` list does
not include the `logs` plugin, the core auto-injects it and prints
a one-line warning on stderr. The JSONL streams
(`.cache/mcp-vertex/results/logs/*.jsonl`) are populated as if
`logs` were on the original list. This is the recommended way to
operate the host in production: every tool call surfaces, no plugin
author needs to opt in.

A host that prefers the console fallback (no JSONL) can pass
`--strict-logs` together with `--quiet`; the console sink becomes a
no-op and the host is silent (use this only when piping the host's
stderr to a log aggregator that parses JSON).

---

## FAQ

**Q: My plugin does not see `ctx.logs`. What do I do?**
A: The `logs` plugin is not in the host's load set. Either (a)
add it explicitly (`mcp-vertex --plugins=my-plugin,logs`) or
(b) ask the host to pass `--strict-logs` so the core auto-loads
it. Your code should always null-check (`ctx.logs?.log(...)`).

**Q: I want to test the wrapper without loading the `logs`
plugin. How?**
A: Pass a mock `logsSink` to `withIncidentLogging`'s second
argument (the `IIncidentLoggingContext`). The wrapper does not
require the `logs` plugin to be present; it only requires a sink.
See `packages/core/tests/src/lib/tools/with-incident-logging.spec.ts`
for a working example.

**Q: My handler returns `{ ok: false, error: '…' }` directly,
without `toolError`. Does the wrapper still emit?**
A: No. The wrapper inspects `isError: true` on the result. If
your handler returns a custom envelope, set `isError: true` on
it (the MCP SDK reads this flag to mark the response as an
error). Alternatively, call `ctx.logs?.log(...)` directly.

**Q: Can I disable the wrapper for one specific call?**
A: Set `incidentLoggingDisabled: true` on the tool's
registration. There is no per-call opt-out.
