import { describe, expect, it } from 'vitest';

import {
	includeFor,
	type ITypecheckWorkspace,
	typecheckScopeOf,
} from './typecheck-scope.helper';

const ROOT_INCLUDE = [
	'packages/*/src/**/*',
	'packages/*/tests/**/*',
	'plugins/*/src/**/*',
	'plugins/*/tests/**/*',
	'apps/shared/src/**/*',
	'scripts/**/*',
];

const WORKSPACES: readonly ITypecheckWorkspace[] = [
	{ dir: 'packages/state', name: '@delendai/state', dependsOn: [] },
	{
		dir: 'packages/core',
		name: '@delendai/core',
		dependsOn: ['@delendai/state', 'zod'],
	},
	{
		dir: 'packages/cli',
		name: '@delendai/cli',
		dependsOn: ['@delendai/core', '@delendai/git'],
	},
	{
		dir: 'plugins/git',
		name: '@delendai/git',
		dependsOn: ['@delendai/core'],
	},
	{ dir: 'plugins/memory', name: '@delendai/memory', dependsOn: [] },
	{ dir: 'apps/web', name: '@delendai/web', dependsOn: ['@delendai/cli'] },
	{
		dir: 'tools',
		name: 'tools',
		dependsOn: ['@delendai/core', '@delendai/memory'],
	},
];

const scope = (changed: readonly string[]) =>
	typecheckScopeOf({
		changed,
		workspaces: WORKSPACES,
		rootInclude: ROOT_INCLUDE,
	});

describe('typecheckScopeOf', () => {
	it('checks a one-file core change in core and every dependent, transitively', () => {
		const result = scope(['packages/core/src/x.ts']);
		expect(result.full).toBe(false);
		if (result.full) return;
		expect(result.workspaces.map((each) => each.dir)).toEqual([
			'packages/core',
			'packages/cli',
			'plugins/git',
			'apps/web',
			'tools',
		]);
		expect(result.workspaces[0]?.why).toBe(
			'packages/core/src/x.ts changed',
		);
		expect(result.include).toContain('packages/core/src/**/*');
		expect(result.include).toContain('plugins/git/tests/**/*');
		// Not a dependent: neither the state core uses nor an unrelated plugin.
		expect(result.include).not.toContain('packages/state/src/**/*');
		expect(result.include).not.toContain('plugins/memory/src/**/*');
		expect(result.tools).toBe(true);
	});

	it('checks a plugin-only change in that plugin and what depends on it, not every other plugin', () => {
		const result = scope(['plugins/memory/src/memory.tool.ts']);
		if (result.full) throw new Error('expected a sectioned scope');
		expect(result.workspaces.map((each) => each.dir)).toEqual([
			'plugins/memory',
			'tools',
		]);
		expect(result.include).toEqual([
			'plugins/memory/src/**/*',
			'plugins/memory/tests/**/*',
		]);
	});

	it('checks nothing for a docs-only change', () => {
		const result = scope(['docs/delendai/x.md', 'README.md']);
		if (result.full) throw new Error('expected a sectioned scope');
		expect(result.workspaces).toEqual([]);
		expect(result.include).toEqual([]);
		expect(result.tools).toBe(false);
	});

	it('checks everything for a root manifest, tsconfig or lockfile, and for no change list', () => {
		expect(scope(['bun.lock']).full).toBe(true);
		expect(scope(['tsconfig.base.json']).full).toBe(true);
		expect(scope(['package.json']).full).toBe(true);
		expect(scope([]).full).toBe(true);
	});

	it('keeps a root include outside every workspace', () => {
		const result = scope(['scripts/run.ts']);
		if (result.full) throw new Error('expected a sectioned scope');
		expect(result.include).toEqual(['scripts/**/*']);
	});
});

describe('includeFor', () => {
	it('makes the root patterns that describe a workspace concrete for it', () => {
		expect(includeFor('packages/core', ROOT_INCLUDE)).toEqual([
			'packages/core/src/**/*',
			'packages/core/tests/**/*',
		]);
		expect(includeFor('apps/web', ROOT_INCLUDE)).toEqual([]);
		expect(includeFor('apps/shared', ROOT_INCLUDE)).toEqual([
			'apps/shared/src/**/*',
		]);
	});
});
