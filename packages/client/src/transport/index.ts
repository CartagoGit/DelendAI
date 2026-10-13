/**
 * transport/index.ts — subpath export for `@delendai/client/transport`.
 *
 * r00041 S3: the MCP conversation itself. It spawns a child process at
 * runtime through the MCP SDK, but it does so without importing `node:*`
 * or any value from `@delendai/core` — which is what lets this barrel
 * compile with `"types": []` and keeps the door open for a transport
 * that talks over `fetch`/WebSocket instead of stdio.
 *
 * The boundary is enforced two ways, deliberately: S1's spec rejects
 * `node:*` and `@delendai/core` import specifiers, and
 * `tsconfig.contracts.json` catches ambient global usage that a
 * specifier scan cannot see (it is how the `Buffer` annotation in
 * `mcp-stdio-client.ts` was found).
 */

export * from '../lib/transport/mcp-stdio-client';
