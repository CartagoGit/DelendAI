/**
 * Node builtin specifiers to keep OUT of a browser dev-preview bundle.
 *
 * `Bun.build({ external })` matching is specifier-exact (or glob), and
 * `'node:*'` only matches the `node:`-prefixed form. Several npm
 * packages we pull in transitively (e.g. `cross-spawn`, a dependency of
 * `@modelcontextprotocol/sdk`'s stdio client transport, reached via
 * `McpStdioClient` in `@delendai/client`'s barrel) still
 * `require('child_process')` the OLD bare way, which slips past that
 * glob and crashes the browser bundle with "Browser build cannot
 * require() Node.js builtin". This is the full public Node builtin
 * list in bare form, so any future transitive dependency using the
 * unprefixed spelling is covered too.
 */
export const BARE_NODE_BUILTINS: readonly string[] = [
	'assert',
	'buffer',
	'child_process',
	'cluster',
	'console',
	'constants',
	'crypto',
	'dgram',
	'diagnostics_channel',
	'dns',
	'domain',
	'events',
	'fs',
	'http',
	'http2',
	'https',
	'inspector',
	'module',
	'net',
	'os',
	'path',
	'perf_hooks',
	'process',
	'punycode',
	'querystring',
	'readline',
	'repl',
	'stream',
	'string_decoder',
	'timers',
	'tls',
	'trace_events',
	'tty',
	'url',
	'util',
	'v8',
	'vm',
	'wasi',
	'worker_threads',
	'zlib',
];

/** Full `Bun.build({ external })` list for browser-target dev bundles. */
export const BROWSER_BUILD_EXTERNALS: readonly string[] = [
	'node:*',
	'vscode',
	...BARE_NODE_BUILTINS,
];
