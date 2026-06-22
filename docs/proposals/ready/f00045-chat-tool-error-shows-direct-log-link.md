---
id: f00045
kind: feat
title: chat tool error surfaces a direct clickable link to its log entry
status: ready
type: proposal
track: core+client+extension+tests
date: 2026-06-21
---

# f00045 — chat tool error surfaces a direct clickable link to its log entry

## Goal

When a tool call from VS Code Copilot Chat (or any MCP client) returns an
`ok:false` envelope, is canceled mid-flight, times out, or yields a
transport-level error, the rendered result must include a **direct,
clickable link** to the exact line in the per-day `logs/YYYY-MM-DD.jsonl`
event store that recorded the failure — so the user can land in the log
without scrolling, grepping, or re-deriving the timestamp.

## why

- The user-facing complaint: the chat shows `Canceled: Canceled` (or
  `toolError` envelopes) with **no pointer** to the persisted log entry.
  They have to find the log file, open it, and locate the line by hand.
- The repo already persists every tool event in
  `plugins/logs/src/lib/log-store.ts` (one JSON line per `ILogEvent`,
  `ts`, `kind`, `agent`, `taskId`, `outcome`, `files`, `summary`,
  `meta`). The knowledge is server-side; the client side just does not
  surface it.
- The fix is structurally small: the server knows the path + line it
  just wrote; it can return a `logHint` next to every `isError: true`
  result, the client transport can carry that hint on `McpToolError`,
  and the VS Code adapter can offer it as a toast action.
- Without this, observability work (the `ide-observability-v3`
  proposal, f00026) stops one step short: events are written but never
  linked from the failure itself.

## non-goals

- Replacing `logs_*` query tools or the dashboards panel — this slice
  is **only** about the failure-render affordance.
- Streaming tail UI in the chat; a static file link is enough.
- Changing the `ok:true` success envelope. Only failures get a hint.
- Backporting the hint to historic log files; the link always points at
  the line the server just wrote for THIS call.

## Slices

### S1 — Server envelope carries a `logHint` on every `isError:true` result
- **Files**: `packages/core/src/lib/shared/tool-response.ts`,
  `packages/core/src/lib/server/create-mcp-server.ts`,
  `packages/core/src/lib/log/log-emitter.ts` (new, small),
  `packages/core/src/lib/contracts/interfaces/core-paths.interface.ts`,
  `packages/core/tests/src/lib/shared/tool-response.spec.ts`
- **Status**: done
- status: done
- **Gate**: `bun run typecheck`

Note: `toolErrorWithLogHint` + `IToolErrorLogHint` ship in
`packages/core/src/lib/shared/tool-response.ts`; the `create-mcp-project`
wrapper augments every `isError` result with a `logHint` (path + ts;
`line: 0` path-only — a real line number requires the logs plugin's
explicit emit) and never overwrites an engine-set hint.
- **Acceptance**:
  - "A new helper `toolErrorWithLogHint(reason, hint, nextAction?)`
    returns `{ ok: false, error: { reason, nextAction? }, logHint:
    { path, line, ts } }` + `isError: true`."
  - "`createMcpServer` wraps every registered `tool` handler so any
    `isError: true` result returned by the engine is augmented with a
    `logHint` pointing at the log line emitted just before the handler
    returned. The success path is untouched (`toolOk` stays as-is)."
  - "If the engine already returned a `logHint` (e.g. nested call), the
    wrapper does not overwrite it."
  - "`bun run typecheck` is green; unit tests cover both the helper
    and the wrapper with a fake registration."

### S2 — `McpToolError` carries `logHint` and `payloadFromResult` propagates it
- **Files**: `packages/client/src/lib/transport/mcp-stdio-client.ts`,
  `packages/client/src/lib/transport/mcp-transport.types.ts`,
  `packages/client/tests/src/lib/transport/mcp-stdio-client.spec.ts`
- **Status**: done
- status: done
- **Gate**: `bun run typecheck`

Note: `McpToolError` now exposes `readonly logHint?`; `request()`
extracts it via the new `logHintFromResult` helper (checks
`structuredContent` then the parsed `content[0].text`, validating the
`{path, line, ts}` shape) on every `isError` result. `IMcpLogHint` +
`logHintFromResult` are exported from `@mcp-vertex/client`. The actual
spec lives at `packages/client/tests/transport/mcp-stdio-client.spec.ts`
(5 new cases: structured hint, text-only hint, absent, malformed).
Transport-level throws (cancel/timeout/parse) are not McpToolErrors, so
they carry no hint — the absence is the affordance.
- **Acceptance**:
  - "`McpToolError` exposes `readonly logHint?: { path, line, ts }`."
  - "When the server returns `isError:true`, `request()` extracts
    `logHint` from `result.structuredContent` or from the parsed JSON
    `content[0].text` envelope and attaches it to the thrown
    `McpToolError`."
  - "When the SDK throws a transport-level error (cancel, timeout,
    JSON parse), `McpToolError` carries `logHint: undefined` — the
    extension uses the absence to render the no-link variant."
  - "Unit tests with a fake `IMcpTransport` cover all three branches."

### S3 — `showCommandError` renders an `Open log` toast action
- **Files**: `extensions/vscode/src/commands/types.ts`,
  `extensions/vscode/src/extension.ts`,
  `extensions/vscode/src/test/commands.spec.ts`
- **Status**: done
- status: done
- **Gate**: `bun run typecheck`

Note: implemented more simply than the original sketch. Because S2 now
puts `logHint` directly on the thrown `McpToolError`, the hint rides on
the `err` every handler already passes to `showCommandError(vscode,
action, err)` — so NO handler had to be changed to thread it through.
`showCommandError` duck-types `err.logHint`; when present (and the host
exposes `Uri` + `commands.executeCommand`) it offers an `Open log`
action that runs `vscode.open` on
`Uri.file(path).with({ fragment: 'L<line>' })`. Tests live at
`extensions/vscode/src/test/show-command-error.spec.ts` (4 cases:
open-on-click, dismiss, no-hint fallback, no-Uri fallback).
- **Acceptance**:
  - "`showCommandError(vscode, action, err, logHint?)` accepts an
    optional `logHint`. When present, the toast uses
    `vscode.window.showErrorMessage(message, 'Open log')` and on click
    does `await vscode.commands.executeCommand('vscode.open',
    vscode.Uri.file(logHint.path))` plus a `#L<line>` range fragment."
  - "When the error is an `McpToolError` with `logHint`, every command
    handler (`show-overview`, `show-metrics`, `tool-search`,
    `run-validation`, `open-proposal`, `open-knowledge`, `open-docs`,
    `open-dashboard`) rethrows with the hint so the toast action
    appears automatically."
  - "The `McpToolError` is imported from `@mcp-vertex/client` only
    inside `extensions/vscode/src/commands/types.ts` — no other file in
    the extension imports it."
  - "Unit tests assert the right `vscode.open` command is dispatched
    with the right `Uri` and `#L<line>` fragment."

### S4 — End-to-end coverage of `logHint` round-trip
- **Files**:
  `packages/core/tests/src/lib/e2e/log-hint.e2e.spec.ts` (new),
  `packages/client/tests/src/lib/transport/mcp-stdio-client.spec.ts`
  (extend)
- **Status**: done
- status: done
- **Gate**: `bun run validate`

Note: the round-trip is covered without an undeclared cross-package
dependency. The server-side emission is pinned by a real over-the-wire
e2e at `plugins/proposals/tests/src/lib/e2e/log-hint.e2e.spec.ts` (an
illegal transition carries a well-formed `logHint` — path under the
workspace `logs/<date>.jsonl`, numeric `line`, ISO `ts`; a successful
call carries none). The client-side extraction is covered by the S2
client unit specs. The proposals test package keeps a core-only
dependency surface (it does not import `@mcp-vertex/client`). The
cancel-mid-flight branch yields a non-McpToolError throw with no hint —
the absence is the affordance (S2/S3).
- **Acceptance**:
  - "An e2e test boots the assembled server, calls a tool that
    returns `toolError(...)`, and asserts the response carries
    `logHint.path` resolving to a real file under
    `.cache/<host>/logs/<YYYY-MM-DD>.jsonl` AND `logHint.line` is a
    positive integer within that file's line count."
  - "A second e2e test cancels the call mid-flight and asserts the
    `McpToolError` reaches the client (link absent is acceptable;
    absence is itself the affordance)."
  - "`bun run validate` is green."

## acceptance

- Every tool failure (envelope `ok:false`, transport cancel, transport
  timeout, parse failure) renders with a clickable `Open log` action
  whenever the server persisted the event.
- No success path is touched (`toolOk` unchanged, `bun run
  test:coverage` budget unaffected).
- `bun run validate` is green.
- The change is additive and backward-compatible: existing clients
  ignore the new `logHint` field on the response.

## notes

- Implements the chat-side half of f00026 (`ide-observability-v3`):
  f00026 writes the events, f00045 links them from the failure.
- The line-number hint requires the `logs` plugin to be loaded. When
  it is not, the wrapper falls back to writing the event to stderr
  only and returns the envelope without `logHint` — the absence is the
  signal, not a regression.