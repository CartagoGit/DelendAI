import { resolve } from 'node:path';
import type { Alias } from 'vitest/config';

/**
 * Path to the global console-silencing vitest setup. Wired into every
 * project via `sharedSetupFiles` so production `console.log`/`warn`/
 * `error` calls made from tested code don't drown the validate stream.
 * Opt out per test with `process.env.ALLOW_TEST_OUTPUT = '1'` (used by
 * the 3 fault-injection suites that assert on real console output).
 */
export const silenceConsoleSetupFile = (workspaceRoot: string): string =>
	resolve(workspaceRoot, 'tools/scripts/lib/silence-console-setup.ts');

/**
 * Default setup file list shared by every vitest project. Add new
 * cross-cutting setup files here so adding a plugin doesn't require
 * remembering to wire them.
 *
 * Order matters:
 *   1. silenceConsoleSetupFile — must come first so console-output spies
 *      installed per-test are not undone by the polyfill's subprocess
 *      `which bun` call (which can log on certain shells).
 *   2. bunPolyfillSetupFile — attaches `Bun.which` to globalThis so
 *      specs gated on `typeof Bun !== 'undefined'` unskip on hosts that
 *      have Bun installed (the default vitest thread-pool is plain Node).
 */
export const sharedSetupFiles = (workspaceRoot: string): string[] => [
	silenceConsoleSetupFile(workspaceRoot),
	resolve(workspaceRoot, 'tools/scripts/lib/bun-polyfill.ts'),
];

/**
 * Shared module aliases so specs can import via the public package
 * specifiers (`@mcp-vertex/core/...`, `@mcp-vertex/proposals/...`)
 * without a tsconfig-paths plugin. Mirrors `tsconfig.base.json` paths.
 * Order matters: more specific subpaths must come before the bare name.
 */
export const workspaceAliases = (workspaceRoot: string): Alias[] => {
	const core = resolve(workspaceRoot, 'packages/core/src');
	const proposals = resolve(workspaceRoot, 'plugins/proposals/src');
	const rules = resolve(workspaceRoot, 'plugins/rules/src');
	const memory = resolve(workspaceRoot, 'plugins/memory/src');
	const git = resolve(workspaceRoot, 'plugins/git/src');
	const quality = resolve(workspaceRoot, 'plugins/quality/src');
	const search = resolve(workspaceRoot, 'plugins/search/src');
	const docs = resolve(workspaceRoot, 'plugins/docs/src');
	const deps = resolve(workspaceRoot, 'plugins/deps/src');
	const logs = resolve(workspaceRoot, 'plugins/logs/src');
	const notification = resolve(workspaceRoot, 'plugins/notification/src');
	const statusMarker = resolve(workspaceRoot, 'plugins/status-marker/src');
	const testConvention = resolve(
		workspaceRoot,
		'plugins/test-convention/src',
	);
	const client = resolve(workspaceRoot, 'packages/client/src');
	return [
		{
			find: '@mcp-vertex/core/public',
			replacement: resolve(core, 'public/index.ts'),
		},
		{
			find: /^@mcp-vertex\/core\/lib\/(.*)$/,
			replacement: `${resolve(core, 'lib')}/$1`,
		},
		{ find: '@mcp-vertex/core', replacement: resolve(core, 'index.ts') },
		{
			find: '@mcp-vertex/proposals/public',
			replacement: resolve(proposals, 'public/index.ts'),
		},
		{
			find: /^@mcp-vertex\/proposals\/lib\/(.*)$/,
			replacement: `${resolve(proposals, 'lib')}/$1`,
		},
		{
			find: '@mcp-vertex/proposals',
			replacement: resolve(proposals, 'index.ts'),
		},
		{
			find: '@mcp-vertex/rules/public',
			replacement: resolve(rules, 'public/index.ts'),
		},
		{
			find: /^@mcp-vertex\/rules\/lib\/(.*)$/,
			replacement: `${resolve(rules, 'lib')}/$1`,
		},
		{
			find: '@mcp-vertex/rules',
			replacement: resolve(rules, 'index.ts'),
		},
		{
			find: '@mcp-vertex/memory/public',
			replacement: resolve(memory, 'public/index.ts'),
		},
		{
			find: /^@mcp-vertex\/memory\/lib\/(.*)$/,
			replacement: `${resolve(memory, 'lib')}/$1`,
		},
		{
			find: '@mcp-vertex/memory',
			replacement: resolve(memory, 'index.ts'),
		},
		{
			find: '@mcp-vertex/git/public',
			replacement: resolve(git, 'public/index.ts'),
		},
		{
			find: /^@mcp-vertex\/git\/lib\/(.*)$/,
			replacement: `${resolve(git, 'lib')}/$1`,
		},
		{
			find: '@mcp-vertex/git',
			replacement: resolve(git, 'index.ts'),
		},
		{
			find: '@mcp-vertex/quality/public',
			replacement: resolve(quality, 'public/index.ts'),
		},
		{
			find: /^@mcp-vertex\/quality\/lib\/(.*)$/,
			replacement: `${resolve(quality, 'lib')}/$1`,
		},
		{
			find: '@mcp-vertex/quality',
			replacement: resolve(quality, 'index.ts'),
		},
		{
			find: '@mcp-vertex/search/public',
			replacement: resolve(search, 'public/index.ts'),
		},
		{
			find: /^@mcp-vertex\/search\/lib\/(.*)$/,
			replacement: `${resolve(search, 'lib')}/$1`,
		},
		{
			find: '@mcp-vertex/search',
			replacement: resolve(search, 'index.ts'),
		},
		{
			find: '@mcp-vertex/notification/public',
			replacement: resolve(notification, 'public/index.ts'),
		},
		{
			find: /^@mcp-vertex\/notification\/lib\/(.*)$/,
			replacement: `${resolve(notification, 'lib')}/$1`,
		},
		{
			find: '@mcp-vertex/notification',
			replacement: resolve(notification, 'index.ts'),
		},
		{
			find: '@mcp-vertex/docs/public',
			replacement: resolve(docs, 'public/index.ts'),
		},
		{
			find: /^@mcp-vertex\/docs\/lib\/(.*)$/,
			replacement: `${resolve(docs, 'lib')}/$1`,
		},
		{
			find: '@mcp-vertex/docs',
			replacement: resolve(docs, 'index.ts'),
		},
		{
			find: '@mcp-vertex/deps/public',
			replacement: resolve(deps, 'public/index.ts'),
		},
		{
			find: /^@mcp-vertex\/deps\/lib\/(.*)$/,
			replacement: `${resolve(deps, 'lib')}/$1`,
		},
		{
			find: '@mcp-vertex/deps',
			replacement: resolve(deps, 'index.ts'),
		},
		{
			find: '@mcp-vertex/logs/public',
			replacement: resolve(logs, 'public/index.ts'),
		},
		{
			find: /^@mcp-vertex\/logs\/lib\/(.*)$/,
			replacement: `${resolve(logs, 'lib')}/$1`,
		},
		{
			find: '@mcp-vertex/logs',
			replacement: resolve(logs, 'index.ts'),
		},
		{
			find: '@mcp-vertex/status-marker/public',
			replacement: resolve(statusMarker, 'public/index.ts'),
		},
		{
			find: /^@mcp-vertex\/status-marker\/lib\/(.*)$/,
			replacement: `${resolve(statusMarker, 'lib')}/$1`,
		},
		{
			find: '@mcp-vertex/status-marker',
			replacement: resolve(statusMarker, 'index.ts'),
		},
		{
			find: '@mcp-vertex/test-convention/public',
			replacement: resolve(testConvention, 'public/index.ts'),
		},
		{
			find: /^@mcp-vertex\/test-convention\/lib\/(.*)$/,
			replacement: `${resolve(testConvention, 'lib')}/$1`,
		},
		{
			find: '@mcp-vertex/test-convention',
			replacement: resolve(testConvention, 'index.ts'),
		},
		{
			find: '@mcp-vertex/client/public',
			replacement: resolve(client, 'public/index.ts'),
		},
		{
			find: /^@mcp-vertex\/client\/lib\/(.*)$/,
			replacement: `${resolve(client, 'lib')}/$1`,
		},
		{
			find: '@mcp-vertex/client',
			replacement: resolve(client, 'index.ts'),
		},
		{
			find: '@mcp-vertex/ui-extension/public',
			replacement: resolve(
				workspaceRoot,
				'packages/ui-extension/src/public/index.ts',
			),
		},
		{
			find: '@mcp-vertex/ui-extension',
			replacement: resolve(
				workspaceRoot,
				'packages/ui-extension/src/index.ts',
			),
		},
		{
			find: '@mcp-vertex/ide/public',
			replacement: resolve(
				workspaceRoot,
				'packages/ui-extension/src/public/index.ts',
			),
		},
		{
			find: '@mcp-vertex/ide',
			replacement: resolve(
				workspaceRoot,
				'packages/ui-extension/src/index.ts',
			),
		},
	];
};
