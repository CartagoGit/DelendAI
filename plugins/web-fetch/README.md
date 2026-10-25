# @delendai/web-fetch

Opt-in **web/fetch** plugin for [`@delendai/core`](../../packages/core).
Lets an agent fetch one allow-listed URL and get its (capped) text body back
— without making "the agent can reach the network" a default capability.

## Load it

```bash
delendai --plugins=web-fetch
```

Registers `<prefix>_web_fetch`.

## Tools

- **`<prefix>_web_fetch`** `{ url, maxBytes?, timeoutMs? }` →
  `{ ok, url, status, contentType, body, truncated }` on success, or
  `{ ok: false, reason, detail? }` on failure.
  `reason` is one of `blocked-host`, `blocked-address`, `invalid-url`,
  `redirect-blocked`, `redirect-invalid`, `too-many-redirects`,
  `timeout`, `fetch-error`.

## Configuration (`delendai.config.json`)

```json
{ "plugins": { "web-fetch": { "options": { "allowList": ["example.com", "*.docs.example.com"] } } } }
```

`allowList` accepts exact hostnames and `*.suffix` wildcards. **An
empty/missing allow-list rejects every call** — the plugin fails closed,
not open. `allowPrivateAddresses: true` lets an allow-listed name resolve
to a private address, for an intranet host.

## Security model

- The allow-list is checked against the **hostname** of the requested URL
  and of **every redirect hop**. `fetch`'s automatic redirect handling is
  disabled (`redirect: 'manual'`); each hop is re-validated before being
  followed, so an allow-listed URL that redirects to a non-allow-listed
  host is rejected (`reason: 'redirect-blocked'`), not silently followed.
- The host of the URL and of every hop is **resolved**, and each address
  it answers is checked: a name that resolves to a private, loopback,
  link-local or unspecified address is refused (`reason:
  'blocked-address'`), so an allow-listed name pointed at `127.0.0.1` or
  a metadata address does not reach inside the machine. Allow-listing a
  literal address or `localhost` is the opt-in for that address; the
  `allowPrivateAddresses` option is the opt-in for every name.
- A `Location` that is not a URL returns `reason: 'redirect-invalid'`.
- Response bodies are capped at `maxBytes` (default 50 KiB,
  configurable per call); a capped response returns `truncated: true`,
  not a failure.
- Each request has a timeout (default 8000 ms, configurable per call);
  exceeding it returns `reason: 'timeout'`.

### Out of scope (host-level concerns)

The connection resolves the name again: a resolver that answers a public
address to the check and a private one to the connection, within that
instant, is not caught here — the runtime's `fetch` takes no pinned
address. If your deployment needs that guarantee, enforce it at the
network layer (an egress proxy or firewall).

## Scope

This is **not** a crawler or a scraping DSL — one tool, one URL per call,
no link-following beyond redirects, no HTML parsing. It is also **not** a
replacement for the host's own browsing tool (e.g. `fetch_webpage`): this
plugin runs *inside* the MCP server, for hosts that don't already provide
that capability or that want it gated behind the project's own allow-list
instead of the host's.
