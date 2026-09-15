/**
 * forward-sync-release.script.spec.ts — the decision that runs before
 * anything is pushed: in sync, history only, real content, or a conflict
 * nobody but a person may resolve.
 */
import { describe, expect, it } from 'vitest';

import {
	FORWARD_SYNC_REF_PREFIX,
	forwardSyncBody,
	forwardSyncExplanation,
	forwardSyncRef,
	forwardSyncTitle,
	forwardSyncVerdict,
	type IForwardSyncVerdict,
} from './forward-sync-release.script';

const BRANCHES = { integration: 'develop', release: 'main' };
const RELEASE_SHA = 'c7eda197a0123456789abcdef0123456789abcde';

describe('forwardSyncVerdict', () => {
	it('is in sync when the release tip is already in the integration history', () => {
		expect(
			forwardSyncVerdict({
				releaseIsAncestor: true,
				conflicts: true,
				treeChanges: true,
			}),
		).toBe('in-sync');
	});

	it('names a merge that stopped as a conflict, before looking at trees', () => {
		expect(
			forwardSyncVerdict({
				releaseIsAncestor: false,
				conflicts: true,
				treeChanges: false,
			}),
		).toBe('conflict');
	});

	it('tells history-only drift from drift that carries changes', () => {
		// Measured on 2026-09-15: main's only exclusive commit was the merge
		// of #178, and merging it into develop left the tree byte-identical.
		expect(
			forwardSyncVerdict({
				releaseIsAncestor: false,
				conflicts: false,
				treeChanges: false,
			}),
		).toBe('ancestry-only');
		expect(
			forwardSyncVerdict({
				releaseIsAncestor: false,
				conflicts: false,
				treeChanges: true,
			}),
		).toBe('content');
	});
});

describe('forwardSyncRef', () => {
	it('lives in the namespace the forge lets a workflow create refs in', () => {
		expect(forwardSyncRef(RELEASE_SHA)).toBe(
			`${FORWARD_SYNC_REF_PREFIX}c7eda197a`,
		);
		expect(FORWARD_SYNC_REF_PREFIX.startsWith('delendai/pr/')).toBe(true);
	});
});

describe('the words that travel with the verdict', () => {
	const verdicts: readonly IForwardSyncVerdict[] = [
		'in-sync',
		'ancestry-only',
		'content',
		'conflict',
	];

	it('names both branches and the release tip for every verdict', () => {
		for (const verdict of verdicts) {
			const line = forwardSyncExplanation(verdict, BRANCHES, RELEASE_SHA);
			expect(line).toContain('main (c7eda197a)');
			expect(line).toContain('develop');
		}
	});

	it('titles the pull request as a conventional commit', () => {
		expect(forwardSyncTitle(BRANCHES, RELEASE_SHA)).toBe(
			'chore(release): forward-sync main c7eda197a into develop',
		);
	});

	it('says why an empty pull request is not the #100 shape, and asks for review otherwise', () => {
		expect(
			forwardSyncBody('ancestry-only', BRANCHES, RELEASE_SHA),
		).toContain('lint:candidate-delivers');
		expect(forwardSyncBody('content', BRANCHES, RELEASE_SHA)).toContain(
			'Review the diff',
		);
	});
});
