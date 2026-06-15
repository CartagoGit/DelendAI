import { resolve } from 'node:path';
import type { Alias } from 'vitest/config';

/**
 * Shared module aliases so specs can import via the public package
 * specifiers (`@cartago-git/mcp-core/...`, `@cartago-git/mcp-proposals/...`)
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
	return [
		{
			find: '@cartago-git/mcp-core/public',
			replacement: resolve(core, 'public/index.ts'),
		},
		{
			find: /^@cartago-git\/mcp-core\/lib\/(.*)$/,
			replacement: resolve(core, 'lib') + '/$1',
		},
		{ find: '@cartago-git/mcp-core', replacement: resolve(core, 'index.ts') },
		{
			find: '@cartago-git/mcp-proposals/public',
			replacement: resolve(proposals, 'public/index.ts'),
		},
		{
			find: /^@cartago-git\/mcp-proposals\/lib\/(.*)$/,
			replacement: resolve(proposals, 'lib') + '/$1',
		},
		{
			find: '@cartago-git/mcp-proposals',
			replacement: resolve(proposals, 'index.ts'),
		},
		{
			find: '@cartago-git/mcp-rules/public',
			replacement: resolve(rules, 'public/index.ts'),
		},
		{
			find: /^@cartago-git\/mcp-rules\/lib\/(.*)$/,
			replacement: resolve(rules, 'lib') + '/$1',
		},
		{
			find: '@cartago-git/mcp-rules',
			replacement: resolve(rules, 'index.ts'),
		},
		{
			find: '@cartago-git/mcp-memory/public',
			replacement: resolve(memory, 'public/index.ts'),
		},
		{
			find: /^@cartago-git\/mcp-memory\/lib\/(.*)$/,
			replacement: resolve(memory, 'lib') + '/$1',
		},
		{
			find: '@cartago-git/mcp-memory',
			replacement: resolve(memory, 'index.ts'),
		},
		{
			find: '@cartago-git/mcp-git/public',
			replacement: resolve(git, 'public/index.ts'),
		},
		{
			find: /^@cartago-git\/mcp-git\/lib\/(.*)$/,
			replacement: resolve(git, 'lib') + '/$1',
		},
		{
			find: '@cartago-git/mcp-git',
			replacement: resolve(git, 'index.ts'),
		},
		{
			find: '@cartago-git/mcp-quality/public',
			replacement: resolve(quality, 'public/index.ts'),
		},
		{
			find: /^@cartago-git\/mcp-quality\/lib\/(.*)$/,
			replacement: resolve(quality, 'lib') + '/$1',
		},
		{
			find: '@cartago-git/mcp-quality',
			replacement: resolve(quality, 'index.ts'),
		},
		{
			find: '@cartago-git/mcp-search/public',
			replacement: resolve(search, 'public/index.ts'),
		},
		{
			find: /^@cartago-git\/mcp-search\/lib\/(.*)$/,
			replacement: resolve(search, 'lib') + '/$1',
		},
		{
			find: '@cartago-git/mcp-search',
			replacement: resolve(search, 'index.ts'),
		},
	];
};
