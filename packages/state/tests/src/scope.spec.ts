/**
 * scope.spec.ts — q00018 Phase 0.1 S4.
 *
 * Pins the four-scope discriminator and the structural equality
 * helpers. Specifically asserts that:
 *
 *   - `swarm` keys are shared across worktrees with the same
 *     `RepositoryInstanceId`, even when `workspaceRoot` differs.
 *   - `project` keys are NOT shared when `worktreeId` differs.
 *   - The `scopesEqual` helper never compares across kinds.
 */

import { describe, expect, it } from 'vitest';

import {
	asRepositoryInstanceId,
	asWorktreeId,
	isSharedScope,
	isWorktreeLocalScope,
	scopesEqual,
	type StateScope,
} from '../../src/lib/scope';

describe('StateScope (q00018 S4)', () => {
	const swarmA: StateScope = {
		kind: 'swarm',
		locator: {
			repositoryInstanceId: asRepositoryInstanceId('repo-abc123'),
			swarmRoot: '/home/dev/.cache/delendai/state/swarm',
		},
	};
	const swarmB: StateScope = {
		kind: 'swarm',
		locator: {
			repositoryInstanceId: asRepositoryInstanceId('repo-abc123'),
			swarmRoot: '/home/dev/.cache/delendai/state/swarm',
		},
	};
	const swarmDifferentRepo: StateScope = {
		kind: 'swarm',
		locator: {
			repositoryInstanceId: asRepositoryInstanceId('repo-different'),
			swarmRoot: '/home/dev/.cache/delendai/state/swarm',
		},
	};

	it('isSharedScope narrows swarm + shared-content-cache only', () => {
		expect(isSharedScope(swarmA)).toBe(true);
		expect(
			isSharedScope({
				kind: 'shared-content-cache',
				locator: {
					repositoryInstanceId: asRepositoryInstanceId('r'),
					swarmRoot: '/s',
					cacheNamespace: 'parse',
				},
			}),
		).toBe(true);
		expect(
			isSharedScope({
				kind: 'project',
				locator: {
					workspaceRoot: '/r',
					worktreeId: asWorktreeId('wt-A'),
					cacheRoot: '/r/.cache/delendai',
					docsRoot: '/r/docs/delendai',
				},
			}),
		).toBe(false);
	});

	it('isWorktreeLocalScope narrows project + worktree-cache only', () => {
		expect(
			isWorktreeLocalScope({
				kind: 'project',
				locator: {
					workspaceRoot: '/r',
					worktreeId: asWorktreeId('wt-A'),
					cacheRoot: '/r/.cache/delendai',
					docsRoot: '/r/docs/delendai',
				},
			}),
		).toBe(true);
		expect(
			isWorktreeLocalScope({
				kind: 'worktree-cache',
				locator: {
					workspaceRoot: '/r',
					worktreeId: asWorktreeId('wt-A'),
					cacheRoot: '/r/.cache/delendai',
				},
			}),
		).toBe(true);
		expect(isWorktreeLocalScope(swarmA)).toBe(false);
	});

	it('S4 fix: two swarm scopes with same repositoryInstanceId are equal', () => {
		expect(scopesEqual(swarmA, swarmB)).toBe(true);
	});

	it('S4 fix: two swarm scopes with different repositoryInstanceId are not equal', () => {
		expect(scopesEqual(swarmA, swarmDifferentRepo)).toBe(false);
	});

	it('scopesEqual across different kinds returns false', () => {
		const projectScope: StateScope = {
			kind: 'project',
			locator: {
				workspaceRoot: '/r',
				worktreeId: asWorktreeId('wt-A'),
				cacheRoot: '/r/.cache/delendai',
				docsRoot: '/r/docs/delendai',
			},
		};
		expect(scopesEqual(projectScope, swarmA)).toBe(false);
	});

	it('project scopes with different worktreeId are not equal', () => {
		const a: StateScope = {
			kind: 'project',
			locator: {
				workspaceRoot: '/r',
				worktreeId: asWorktreeId('wt-A'),
				cacheRoot: '/r/.cache/delendai',
				docsRoot: '/r/docs/delendai',
			},
		};
		const b: StateScope = {
			kind: 'project',
			locator: {
				workspaceRoot: '/r',
				worktreeId: asWorktreeId('wt-B'),
				cacheRoot: '/r/.cache/delendai',
				docsRoot: '/r/docs/delendai',
			},
		};
		expect(scopesEqual(a, b)).toBe(false);
	});
});
