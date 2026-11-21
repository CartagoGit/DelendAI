import { describe, expect, it } from 'vitest';

import {
	headNotBuilt,
	outsideDerived,
	prepareDerived,
	pushDerived,
} from '@delendai/core/lib/integration/land/land-bring-forward.helper';
import type { ILandPullRequest } from '@delendai/core/lib/integration/land/land.interface';

const pr = (headAuthor?: string): ILandPullRequest => ({
	number: 1,
	headRef: 'h',
	headSha: 'abc1234',
	draft: false,
	state: 'open',
	merged: false,
	labels: [],
	body: '',
	testedBase: 'def5678',
	headAuthor,
});
const BOT = 'github-actions[bot]';

describe('headNotBuilt', () => {
	const REQUIRED = ['ci'];
	it('[<5ms] is true for action_required, or no required check on a bot head', () => {
		expect(
			headNotBuilt(
				pr('ann'),
				[{ name: 'x', conclusion: 'action_required' }],
				[BOT],
				REQUIRED,
			),
		).toBe(true);
		expect(headNotBuilt(pr(BOT), [], [BOT], REQUIRED)).toBe(true);
	});
	it('[<5ms] is true for a bot head that only a third-party check reported on', () => {
		expect(
			headNotBuilt(
				pr(BOT),
				[{ name: 'GitGuardian', conclusion: 'success' }],
				[BOT],
				REQUIRED,
			),
		).toBe(true);
	});
	it('[<5ms] is false for a person with no run yet, or a head a required check reported on', () => {
		expect(headNotBuilt(pr('ann'), [], [BOT], REQUIRED)).toBe(false);
		expect(
			headNotBuilt(
				pr(BOT),
				[{ name: 'ci', conclusion: null }],
				[BOT],
				REQUIRED,
			),
		).toBe(false);
	});
});

describe('outsideDerived', () => {
	it('[<5ms] keeps only the paths no derived path covers', () => {
		expect(
			outsideDerived(
				['gen/a.md', 'src/x.ts', 'catalog.json'],
				['gen/', 'catalog.json'],
			),
		).toEqual(['src/x.ts']);
	});
});

describe('the two derived phases', () => {
	const ports = (
		merge: 'merged' | 'conflict',
		changed: string[],
		ok = true,
	) => ({
		merge: () => merge,
		regenerate: () => ok,
		result: () => ({ sha: 's1', changed }),
	});
	it('[<5ms] the tokenless phase refuses a conflict, a failure and a change outside the paths', () => {
		const run = (p: ReturnType<typeof ports>) =>
			prepareDerived({ ports: p, derivedPaths: ['gen/'], base: 'tip' })
				.kind;
		expect(run(ports('conflict', []))).toBe('conflict');
		expect(run(ports('merged', [], false))).toBe('failed');
		expect(run(ports('merged', ['src/x.ts']))).toBe('refused');
		expect(run(ports('merged', ['gen/a.md']))).toBe('ready');
	});
	it('[<5ms] the push phase pushes nothing if the head moved or the artifact reaches outside the paths', () => {
		const prepared = { kind: 'ready', sha: 's1', base: 'tip' } as const;
		const run = (head: string, changed: string[], push = true) => {
			const pushed: string[] = [];
			const verdict = pushDerived({
				prepared,
				expectedHead: 'h1',
				derivedPaths: ['gen/'],
				ports: {
					headNow: () => head,
					changedBy: () => changed,
					push: (sha) => {
						pushed.push(sha);
						return push;
					},
				},
			});
			return { verdict, pushed };
		};
		expect(run('h2', ['gen/a'])).toEqual({
			verdict: 'head-moved',
			pushed: [],
		});
		expect(run('h1', ['src/x'])).toEqual({
			verdict: 'refused',
			pushed: [],
		});
		expect(run('h1', ['gen/a'])).toEqual({
			verdict: 'pushed',
			pushed: ['s1'],
		});
		expect(run('h1', ['gen/a'], false).verdict).toBe('declined');
	});
});
