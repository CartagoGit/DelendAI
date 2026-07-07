/**
 * `packages/ui-extension/webview` — browser-safe webview helpers.
 *
 * This is the strict subset of `@mcp-vertex/ui-extension/public` that has
 * NO runtime dependency on `@mcp-vertex/client`. It exists so browser
 * bundles (the `extensions/vscode` dev entry on :5200, the
 * `packages/ui-extension` dev entry on :5100, and any future webview
 * preview harness) can import the CSP helpers without pulling in the
 * whole `@mcp-vertex/client` barrel — which transitively re-exports
 * `McpStdioClient` → `@modelcontextprotocol/sdk/client/stdio` →
 * `cross-spawn` → `require('child_process')`, and that Node builtin
 * makes `Bun.build({ target: 'browser' })` fail with a 500.
 *
 * The host (VS Code extension host, JetBrains plugin, etc.) can keep
 * importing `DEFAULT_DENY`, `injectCspMeta`, etc. from
 * `@mcp-vertex/ui-extension/public` without changes — the host runs in
 * Node.js where `child_process` is available. The webview bundle is
 * the only consumer that needs the slimmer import path.
 */
export {
	DEFAULT_DENY,
	WEBVIEW_CSP_OVERRIDES,
	resolveCspPolicy,
	cspHeaderValue,
	injectCspMeta,
	withCsp,
} from './csp';
export type { IWebviewCspPolicy } from './csp';
