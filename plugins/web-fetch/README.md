# @mcp-vertex/web-fetch

Opt-in **web/fetch** plugin for [`@mcp-vertex/core`](../../packages/core).
Lets an agent fetch one allow-listed URL and get its (capped) text body back
— without making "the agent can reach the network" a default capability.

## Load it

```bash
mcp-vertex --plugins=web-fetch
```

Registers `<prefix>_web_fetch`.

## Tools

- **`<prefix>_web_fetch`** `{ url, maxBytes?, timeoutMs? }` →
  `{ ok, url, status, contentType, body, truncated }` on success, or
  `{ ok: false, reason, detail? }` on failure.
  `reason` is one of `blocked-host`, `invalid-url`, `redirect-blocked`,
  `too-many-redirects`, `timeout`, `fetch-error`.

## Configuration (`mcp-vertex.config.json`)

```json
{ "plugins": { "web-fetch": { "options": { "allowList": ["example.com", "*.docs.example.com"] } } } }
```

`allowList` accepts exact hostnames and `*.suffix` wildcards. **An
empty/missing allow-list rejects every call** — the plugin fails closed,
not open.

## Security model

- The allow-list is checked against the **hostname** of the requested URL
  and of **every redirect hop**. `fetch`'s automatic redirect handling is
  disabled (`redirect: 'manual'`); each hop is re-validated before being
  followed, so an allow-listed URL that redirects to a non-allow-listed
  host is rejected (`reason: 'redirect-blocked'`), not silently followed.
- Response bodies are capped at `maxBytes` (default 50 KiB,
  configurable per call); a capped response returns `truncated: true`,
  not a failure.
- Each request has a timeout (default 8000 ms, configurable per call);
  exceeding it returns `reason: 'timeout'`.

### Out of scope (host-level concerns)

DNS-rebinding and IPv6/`localhost`-equivalent bypass of the hostname check
are **not** mitigated by this plugin — a hostname can resolve to a
different IP between the allow-list check and the actual connection. If
your deployment needs that guarantee, enforce it at the network layer
(e.g. an egress proxy/firewall), not in this plugin.

## Scope

This is **not** a crawler or a scraping DSL — one tool, one URL per call,
no link-following beyond redirects, no HTML parsing. It is also **not** a
replacement for the host's own browsing tool (e.g. `fetch_webpage`): this
plugin runs *inside* the MCP server, for hosts that don't already provide
that capability or that want it gated behind the project's own allow-list
instead of the host's.
