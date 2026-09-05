/**
 * scope.spec.ts — q00018 S2 acceptance.
 *
 * Pins the four-scope discriminator and the structural equality
 * helper. The acceptance tests do NOT touch the filesystem;
 * they exercise the in-memory contracts directly.
 */

import { describe, expect, it } from 'vitest';

import {
	isSharedScope,
	isWorktreeLocalScope,
	locatorsEqual,
	scopesEqual,
	type IStateScope,
} from '../../src/lib/scope';

const baseLocator = {
	workspaceRoot: '/repo',
	cacheRoot: '/repo/.cache/delendai',
	swarmRoot: '/repo/.cache/delendai/state/swarm',
	docsRoot: '/repo/docs/delendai',
};

describe('IStateScope (q00018 S2)', () => {
	const scopes: IStateScope[] = [
		{ kind: 'project', locator: baseLocator },
		{ kind: 'swarm', locator: baseLocator },
		{ kind: 'shared-content-cache', locator: baseLocator },
		{ kind: 'worktree-cache', locator: baseLocator },
	];

	it('exposes exactly four scope kinds', () => {
		const kinds = scopes.map((s) => s.kind).sort();
		expect(kinds).toEqual([
			'project',
			'shared-content-cache',
			'swarm',
			'worktree-cache',
		]);
	});

	it('isSharedScope narrows swarm + shared-content-cache only', () => {
		const shared = scopes
			.filter(isSharedScope)
			.map((s) => s.kind)
			.sort();
		expect(shared).toEqual(['shared-content-cache', 'swarm']);
	});

	it('isWorktreeLocalScope narrows project + worktree-cache only', () => {
		const local = scopes
			.filter(isWorktreeLocalScope)
			.map((s) => s.kind)
			.sort();
		expect(local).toEqual(['project', 'worktree-cache']);
	});

	it('scopesEqual is reflexive and symmetric for the same scope', () => {
		for (const scope of scopes) {
			expect(scopesEqual(scope, scope)).toBe(true);
		}
	});

	it('scopesEqual returns false across kinds', () => {
		const a: IStateScope = { kind: 'project', locator: baseLocator };
		const b: IStateScope = { kind: 'swarm', locator: baseLocator };
		expect(scopesEqual(a, b)).toBe(false);
	});

	it('locatorsEqual treats identity as opaque, order-insensitive bag', () => {
		const a = {
			workspaceRoot: '/repo',
			identity: { repoInstanceId: 'abc', remote: 'origin' },
		};
		const b = {
			workspaceRoot: '/repo',
			identity: { remote: 'origin', repoInstanceId: 'abc' },
		};
		expect(locatorsEqual(a, b)).toBe(true);
	});

	it('locatorsEqual rejects different identity values', () => {
		const a = {
			workspaceRoot: '/repo',
			identity: { repoInstanceId: 'abc' },
		};
		const b = {
			workspaceRoot: '/repo',
			identity: { repoInstanceId: 'def' },
		};
		expect(locatorsEqual(a, b)).toBe(false);
	});

	it('locatorsEqual rejects missing identity entries', () => {
		const a = {
			workspaceRoot: '/repo',
			identity: { repoInstanceId: 'abc' },
		};
		const b = { workspaceRoot: '/repo', identity: {} };
		expect(locatorsEqual(a, b)).toBe(false);
	});
});
