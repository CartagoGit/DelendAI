# Runtime Observability

`delendai` emits a host-neutral runtime stream outside MCP stdio:

```text
<cacheDir>/runtime/events.jsonl
```

The CLI assembler enables it for every project that uses the standard
`assembleCliConfig` path. The stream contains redacted JSONL events for session
start, tool start/completion/failure, and lazy plugin activation. It does not
add tools, prompts, resources, or notifications to MCP, and it never shares
the server's stdin/stdout with an observer.

Hosts may consume it in either of these ways:

- read or tail the JSONL file directly;
- use `readRuntimeEvents` from `@delendai/client/node` with a cursor.

VS Code, Codex, Claude, Antigravity, and other routers still need a small host
adapter to render the events in their own UI. A host cannot observe another
host's private context, token meter, or MCP process unless that host exposes a
separate integration channel. The portable stream reports what `delendai`
itself knows: plugin activation, tool calls, errors, latency, and estimated
response tokens.