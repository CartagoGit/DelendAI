# Example: a delendai plugin written in Python (`greeter`)

A plugin does not have to be TypeScript. Any program that speaks MCP over
stdio can be one: delendai boots it through the `external-mcps` plugin and
judges it by a JSON manifest that sits beside it. This example is a Python
MCP server that uses only the standard library, and it is run for real by
[`python-plugin.e2e.spec.ts`](../../../../plugins/external-mcps/tests/src/lib/e2e/python-plugin.e2e.spec.ts).

## The three files

- [`server.py`](server.py): the MCP server. It reads newline-delimited
  JSON-RPC 2.0 on stdin and answers on stdout. Like any conforming server,
  it answers nothing before the session is open (`initialize`, then
  `notifications/initialized`). It offers one tool, `greet`.
- [`delendai.plugin.json`](delendai.plugin.json): the manifest. It is
  validated against the published schema,
  [`delendai.plugin-manifest.schema.json`](../../../../packages/core/schema/delendai.plugin-manifest.schema.json),
  which any editor or language can check without importing delendai. The
  `package` is the author's own npm-style name. Names in the `@delendai/`
  scope are reserved for delendai's plugins.
- [`delendai.config.json`](delendai.config.json): how a project declares the
  server under `plugins.external-mcps.options.servers`. The command and its
  arguments are resolved against the workspace root.

## How delendai finds the manifest

For each declared server, delendai looks for `delendai.plugin.json` in the
directory of the command, and of each argument that is a path
(`docs/delendai/examples/python-plugin/server.py` here). It then does one
of two things:

- **The manifest validates.** The server is a plugin and boots on its
  first call.
- **The manifest does not validate.** The server never boots.
  `external_mcp_status` reports it with the schema path of each problem,
  for example `tags: tags must not be empty`, and every call routed to it
  fails with the same reason.

The manifest's `permissions` bound what the server is given. A server
whose entry asks for host environment variables (`env: ["API_TOKEN"]`) is
refused unless its manifest declares `env-read` or `secrets`.

## Try it

1. Copy the three files into your project, for example under `tools/greeter/`,
   and point `args` at the copied `server.py`.
2. Merge the `plugins.external-mcps` block of `delendai.config.json` into your
   project's configuration.
3. Start delendai and call the tool through the external-mcps `call` proxy
   with `server: "greeter"` and `tool: "greet"`. The first call from an
   agent waits for a person's acknowledgement, as every activation the LLM
   decides does.

## Not yet

The tools a manifest plugin offers are not listed in delendai's lazy catalog
yet, and a manifest cannot declare agent roles.
