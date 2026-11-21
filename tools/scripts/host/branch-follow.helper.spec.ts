import { describe, expect, it } from 'vitest';

import { followBranch } from './branch-follow.helper';

/** A git runner that answers from a table and records what it was asked to run. */
const git = (counts: string | undefined, mergeWorks = true) => {
	const calls: string[] = [];
	const run = (_c: string, args: readonly string[]): string | undefined => {
		calls.push(args.join(' '));
		if (args[0] === 'rev-list') return counts;
		if (args[0] === 'merge') return mergeWorks ? '' : undefined;
		return '';
	};
	return { run, calls };
};

describe('followBranch [<50ms]', () => {
	it('fast-forwards a tree that is only behind, saying nothing', () => {
		const { run, calls } = git('0\t3');
		expect(followBranch('/t', 'develop', 'abc', true, run)).toEqual({});
		expect(calls).toContain('merge --ff-only --quiet abc');
	});

	it('leaves a tree that is level alone', () => {
		const { run, calls } = git('0\t0');
		expect(followBranch('/t', 'develop', 'abc', true, run)).toEqual({});
		expect(calls.some((c) => c.startsWith('merge'))).toBe(false);
	});

	it('never resets or rebases a tree with local commits, and says the counts', () => {
		const { run, calls } = git('2\t3');
		const { note } = followBranch('/t', 'develop', 'abc', true, run);
		expect(note).toContain('ahead 2, behind 3');
		expect(note).toContain('NOT reset or rebased');
		expect(
			calls.every((c) => !/^(merge|reset|rebase|checkout)/u.test(c)),
		).toBe(true);
	});

	it('reports a fast-forward that git refuses, without forcing it', () => {
		const { run, calls } = git('0\t2', false);
		const { note } = followBranch('/t', 'develop', 'abc', true, run);
		expect(note).toContain('could not fast-forward 2 commit(s)');
		expect(calls.filter((c) => c.startsWith('merge'))).toEqual([
			'merge --ff-only --quiet abc',
		]);
	});

	it('serves what it has and says the fetch failed when offline', () => {
		const { run } = git('0\t0');
		const { note } = followBranch('/t', 'develop', 'abc', false, run);
		expect(note).toContain('fetching origin failed');
	});

	it('says so when the tree cannot be compared', () => {
		const { run } = git(undefined);
		expect(followBranch('/t', 'develop', 'abc', true, run).note).toContain(
			'could not compare',
		);
	});
});
