import { resolve } from 'node:path';

/**
 * `Alias` moved from `vitest/config` to `vite` in vitest 4.x, and
 * `vite` is not a direct dep of every workspace (apps/web, plugins/…)
 * — so a direct `import type { Alias } from 'vite'` breaks `tsc -p
 * apps/web/tsconfig.json`. Declare the shape locally and rely on
 * structural compatibility: `resolve.alias` accepts any object that
 * matches `{ find: string | RegExp; replacement: string }`.
 */
export interface Alias {
	readonly find: string | RegExp;
	readonly replacement: string;
}

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
 */
export const sharedSetupFiles = (workspaceRoot: string): string[] => [
	silenceConsoleSetupFile(workspaceRoot),
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
	const security = resolve(workspaceRoot, 'plugins/security/src');
	const diagram = resolve(workspaceRoot, 'plugins/diagram/src');
	const env = resolve(workspaceRoot, 'plugins/env/src');
	const i18n = resolve(workspaceRoot, 'plugins/i18n/src');
	const perf = resolve(workspaceRoot, 'plugins/perf/src');
	const techDebt = resolve(workspaceRoot, 'plugins/tech-debt/src');
	const logs = resolve(workspaceRoot, 'plugins/logs/src');
	const audit = resolve(workspaceRoot, 'plugins/audit/src');
	const notification = resolve(workspaceRoot, 'plugins/notification/src');
	const statusMarker = resolve(workspaceRoot, 'plugins/status-marker/src');
	const testConvention = resolve(
		workspaceRoot,
		'plugins/test-convention/src',
	);
	const webFetch = resolve(workspaceRoot, 'plugins/web-fetch/src');
	const autoAgentSelector = resolve(
		workspaceRoot,
		'plugins/auto-agent-selector/src',
	);
	const conventions = resolve(workspaceRoot, 'plugins/conventions/src');
	const issues = resolve(workspaceRoot, 'plugins/issues/src');
	const cache = resolve(workspaceRoot, 'plugins/cache/src');
	const client = resolve(workspaceRoot, 'packages/client/src');
	const cli = resolve(workspaceRoot, 'packages/cli/src');
	const shared = resolve(workspaceRoot, 'apps/shared/src');
	return [
		{ find: '@mcp-vertex/cli', replacement: resolve(cli, 'index.ts') },
		{
			find: '@mcp-vertex/shared/i18n',
			replacement: resolve(shared, 'i18n/index.ts'),
		},
		{
			find: /^@mcp-vertex\/shared\/styles\/(.*)$/,
			replacement: resolve(shared, 'styles/$1'),
		},
		{
			find: '@mcp-vertex/shared/styles',
			replacement: resolve(shared, 'styles/_index.scss'),
		},
		{
			find: /^@mcp-vertex\/shared\/components\/(.*)$/,
			replacement: resolve(shared, 'components/$1'),
		},
		{
			find: '@mcp-vertex/shared',
			replacement: resolve(shared, 'public/index.ts'),
		},
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
			find: '@mcp-vertex/security/public',
			replacement: resolve(security, 'public/index.ts'),
		},
		{
			find: /^@mcp-vertex\/security\/lib\/(.*)$/,
			replacement: `${resolve(security, 'lib')}/$1`,
		},
		{
			find: '@mcp-vertex/security',
			replacement: resolve(security, 'index.ts'),
		},
		{
			find: '@mcp-vertex/diagram/public',
			replacement: resolve(diagram, 'public/index.ts'),
		},
		{
			find: /^@mcp-vertex\/diagram\/lib\/(.*)$/,
			replacement: `${resolve(diagram, 'lib')}/$1`,
		},
		{
			find: '@mcp-vertex/diagram',
			replacement: resolve(diagram, 'index.ts'),
		},
		{
			find: '@mcp-vertex/env/public',
			replacement: resolve(env, 'public/index.ts'),
		},
		{
			find: /^@mcp-vertex\/env\/lib\/(.*)$/,
			replacement: `${resolve(env, 'lib')}/$1`,
		},
		{
			find: '@mcp-vertex/env',
			replacement: resolve(env, 'index.ts'),
		},
		{
			find: '@mcp-vertex/i18n/public',
			replacement: resolve(i18n, 'public/index.ts'),
		},
		{
			find: /^@mcp-vertex\/i18n\/lib\/(.*)$/,
			replacement: `${resolve(i18n, 'lib')}/$1`,
		},
		{
			find: '@mcp-vertex/i18n',
			replacement: resolve(i18n, 'index.ts'),
		},
		{
			find: '@mcp-vertex/perf/public',
			replacement: resolve(perf, 'public/index.ts'),
		},
		{
			find: /^@mcp-vertex\/perf\/lib\/(.*)$/,
			replacement: `${resolve(perf, 'lib')}/$1`,
		},
		{
			find: '@mcp-vertex/perf',
			replacement: resolve(perf, 'index.ts'),
		},
		{
			find: '@mcp-vertex/tech-debt/public',
			replacement: resolve(techDebt, 'public/index.ts'),
		},
		{
			find: /^@mcp-vertex\/tech-debt\/lib\/(.*)$/,
			replacement: `${resolve(techDebt, 'lib')}/$1`,
		},
		{
			find: '@mcp-vertex/tech-debt',
			replacement: resolve(techDebt, 'index.ts'),
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
			find: '@mcp-vertex/audit/public',
			replacement: resolve(audit, 'public/index.ts'),
		},
		{
			find: /^@mcp-vertex\/audit\/lib\/(.*)$/,
			replacement: `${resolve(audit, 'lib')}/$1`,
		},
		{
			find: '@mcp-vertex/audit',
			replacement: resolve(audit, 'index.ts'),
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
			find: '@mcp-vertex/web-fetch/public',
			replacement: resolve(webFetch, 'public/index.ts'),
		},
		{
			find: /^@mcp-vertex\/web-fetch\/lib\/(.*)$/,
			replacement: `${resolve(webFetch, 'lib')}/$1`,
		},
		{
			find: '@mcp-vertex/web-fetch',
			replacement: resolve(webFetch, 'index.ts'),
		},
		{
			find: '@mcp-vertex/auto-agent-selector/public',
			replacement: resolve(autoAgentSelector, 'public/index.ts'),
		},
		{
			find: /^@mcp-vertex\/auto-agent-selector\/lib\/(.*)$/,
			replacement: `${resolve(autoAgentSelector, 'lib')}/$1`,
		},
		{
			find: '@mcp-vertex/auto-agent-selector',
			replacement: resolve(autoAgentSelector, 'index.ts'),
		},
		{
			find: '@mcp-vertex/conventions/public',
			replacement: resolve(conventions, 'public/index.ts'),
		},
		{
			find: /^@mcp-vertex\/conventions\/lib\/(.*)$/,
			replacement: `${resolve(conventions, 'lib')}/$1`,
		},
		{
			find: '@mcp-vertex/conventions',
			replacement: resolve(conventions, 'index.ts'),
		},
		{
			find: '@mcp-vertex/issues/public',
			replacement: resolve(issues, 'public/index.ts'),
		},
		{
			find: /^@mcp-vertex\/issues\/lib\/(.*)$/,
			replacement: `${resolve(issues, 'lib')}/$1`,
		},
		{
			find: '@mcp-vertex/issues',
			replacement: resolve(issues, 'index.ts'),
		},
		{
			find: '@mcp-vertex/cache/public',
			replacement: resolve(cache, 'public/index.ts'),
		},
		{
			find: /^@mcp-vertex\/cache\/lib\/(.*)$/,
			replacement: `${resolve(cache, 'lib')}/$1`,
		},
		{
			find: '@mcp-vertex/cache',
			replacement: resolve(cache, 'index.ts'),
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
			find: /^@mcp-vertex\/ui-extension\/(webview|components|dashboard|dev|brand)(?:\/(.*))?$/,
			replacement: resolve(
				workspaceRoot,
				'packages/ui-extension/src/$1/index.ts',
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
