import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import {
	createGitRepoTemplate,
	createInMemoryGit,
	gitReadCacheOf,
	skipLockPauses,
	stubAbortSignalTimeout,
	useFakeClock,
} from '../../../src/public/index';

describe('useFakeClock', () => {
	it('[<30ms] runs a timer when the clock moves, with no real wait', async () => {
		const clock = useFakeClock();
		let fired = false;
		setTimeout(() => {
			fired = true;
		}, 20);
		// The time budget reads this clock too: a timer set further out
		// than the budget would measure as the test taking that long.
		clock.advance(19);
		expect(fired).toBe(false);
		await clock.advanceAsync(1);
		expect(fired).toBe(true);
	});
});

describe('stubAbortSignalTimeout', () => {
	it('[<12ms] hands out a signal the spec fires, and records the duration', () => {
		const deadlines = stubAbortSignalTimeout();
		const signal = AbortSignal.timeout(8_000);
		expect(signal.aborted).toBe(false);
		deadlines.fire(0);
		expect(signal.aborted).toBe(true);
		expect(deadlines.requested()).toEqual([8_000]);
	});
});

describe('skipLockPauses', () => {
	it('[<12ms] runs a pause of the named length at once and tells the spec', async () => {
		let paused = 0;
		const pauseMs = 1_000;
		skipLockPauses(pauseMs, () => {
			paused += 1;
		});
		// delendai:timing-is-the-subject — the pause under test is stubbed to run at once.
		await new Promise<void>((done) => setTimeout(done, pauseMs));
		expect(paused).toBe(1);
	});
});

describe('createInMemoryGit', () => {
	it('[<12ms] answers from its table, records calls and refuses the unknown', () => {
		const fake = createInMemoryGit({ 'rev-parse HEAD': 'abc' });
		expect(fake.run('/x', 'rev-parse', 'HEAD')).toBe('abc');
		expect(fake.calls).toEqual(['rev-parse HEAD']);
		expect(() => fake.run('/x', 'status')).toThrow(/no answer/u);
	});
});

describe('createGitRepoTemplate', () => {
	const template = createGitRepoTemplate({
		files: { 'a.txt': 'a\n' },
		remote: true,
		worktrees: { unit: 'wip/unit' },
	});

	it('[<150ms] copies a repository whose remote and worktree point at the copy', () => {
		const one = template.copy();
		const two = template.copy();
		expect(one.root).not.toBe(two.root);
		expect(readFileSync(join(one.root, 'a.txt'), 'utf8')).toBe('a\n');
		expect(one.git('remote', 'get-url', 'origin')).toBe(one.remote);
		const unit = one.worktrees.unit ?? '';
		expect(existsSync(join(unit, 'a.txt'))).toBe(true);
		expect(one.git('worktree', 'list', '--porcelain')).toContain(unit);
		// A commit in one copy is invisible in the other.
		one.git('commit', '--allow-empty', '-q', '-m', 'only here');
		expect(two.git('log', '--format=%s', '-1')).toBe('base');
	});
});

describe('gitReadCacheOf', () => {
	it('[<12ms] answers a read from the table and starts no process', () => {
		const git = createInMemoryGit({ 'status --porcelain': ' M a.txt' });
		const cache = gitReadCacheOf(git);
		expect(
			cache.recall({ cwd: '/x', args: ['status', '--porcelain'] }),
		).toEqual({ output: ' M a.txt' });
		expect(git.calls).toEqual(['status --porcelain']);
	});
});
