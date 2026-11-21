/**
 * reconcile-refs.script.spec.ts — the forge adapter maps the reconciler's
 * actions onto gh and git, and never deletes a tip it could not keep.
 */
import { describe, expect, it } from 'vitest';

import {
	REPOSITORY_SLUG,
	RefReconcilerService,
	type IObservedPullRequest,
} from '@delendai/core/cli';
import { resolveDevelopmentPolicy } from '@delendai/core/public';

import { GitForgeRefs, type IForgeRefsDeps } from './reconcile-refs.script';

const branches = resolveDevelopmentPolicy({
	development: { branches: { namespacePrefix: 'delendai' } },
}).branches;
const NOW = 2_000_000;

const harness = (
	observed: readonly { name: string; sha: string }[],
	pullRequests: readonly IObservedPullRequest[],
	failing: (args: readonly string[]) => boolean = () => false,
) => {
	const calls: string[] = [];
	const lines: string[] = [];
	const deps: IForgeRefsDeps = {
		observed: () => observed,
		pullRequests: () => pullRequests,
		contains: () => false,
		inProgressAt: () => false,
		run: (file, args) => {
			calls.push(`${file} ${args.join(' ')}`);
			if (failing(args)) throw new Error('refused');
			return '';
		},
		now: () => NOW,
		report: (line) => lines.push(line),
	};
	return { calls, lines, deps };
};

const merged: IObservedPullRequest = {
	number: 7,
	headRefName: 'delendai/pr/a/implement/x1-S1-g1/t',
	state: 'merged',
	headSha: 'aaa',
};

describe('GitForgeRefs', () => {
	it('[<200ms] deletes a publication whose pull request merged, through the forge API', async () => {
		const { calls, deps } = harness(
			[{ name: merged.headRefName, sha: 'aaa' }],
			[merged],
		);
		await new RefReconcilerService(
			new GitForgeRefs(branches, deps),
			branches,
		).pass();
		expect(calls).toEqual([
			`gh api -X DELETE repos/${REPOSITORY_SLUG}/git/refs/heads/${merged.headRefName}`,
		]);
	});

	it('[<200ms] changes nothing without apply, and says what it would do', async () => {
		const { calls, lines, deps } = harness(
			[{ name: merged.headRefName, sha: 'aaa' }],
			[merged],
		);
		await new RefReconcilerService(
			new GitForgeRefs(branches, deps, false),
			branches,
		).pass();
		expect(calls).toEqual([]);
		expect(lines).toEqual([`would delete-forge-ref ${merged.headRefName}`]);
	});

	it('[<200ms] keeps the tip of a closed publication under the retired namespace before the branch goes', async () => {
		const closed: IObservedPullRequest = {
			number: 8,
			headRefName: 'delendai/pr/a/implement/x2-S1-g1/t',
			state: 'closed',
			headSha: 'bbb',
			closedAt: NOW - 100_000,
		};
		const { calls, deps } = harness(
			[{ name: closed.headRefName, sha: 'bbb' }],
			[closed],
		);
		await new RefReconcilerService(
			new GitForgeRefs(branches, deps),
			branches,
		).pass();
		expect(calls[0]).toContain('git/refs');
		expect(calls[0]).toContain('retired');
		expect(calls.some((c) => c.includes('-X DELETE'))).toBe(true);
	});

	it('[<200ms] never deletes a tip it could not keep', async () => {
		const closed: IObservedPullRequest = {
			number: 9,
			headRefName: 'delendai/pr/a/implement/x3-S1-g1/t',
			state: 'closed',
			headSha: 'ccc',
			closedAt: NOW - 100_000,
		};
		const { calls, lines, deps } = harness(
			[{ name: closed.headRefName, sha: 'ccc' }],
			[closed],
			(args) =>
				args.includes('POST') ||
				args.some((a) => a.includes('git/ref/')),
		);
		await new RefReconcilerService(
			new GitForgeRefs(branches, deps),
			branches,
		).pass();
		expect(calls.some((c) => c.includes('-X DELETE'))).toBe(false);
		expect(lines.some((l) => l.includes('could not keep'))).toBe(true);
	});

	it('[<200ms] leaves a closed publication whose work branch is still on the forge', async () => {
		const closed: IObservedPullRequest = {
			number: 10,
			headRefName: 'delendai/pr/a/implement/x4-S1-g1/t',
			state: 'closed',
			headSha: 'ddd',
			closedAt: NOW - 100_000,
		};
		const { calls, deps } = harness(
			[
				{ name: closed.headRefName, sha: 'ddd' },
				{ name: 'delendai/wip/a/implement/x4-S1-g1/t', sha: 'eee' },
			],
			[closed],
		);
		await new RefReconcilerService(
			new GitForgeRefs(branches, deps),
			branches,
		).pass();
		expect(calls).toEqual([]);
	});

	it('[<200ms] refuses an action that belongs to a clone, not the forge', async () => {
		const { deps } = harness([], []);
		await expect(
			new GitForgeRefs(branches, deps).apply({
				kind: 'fast-forward',
				ref: 'x',
			}),
		).rejects.toThrow('not a forge action');
	});
});
