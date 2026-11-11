import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import {
	createGitRepoTemplate,
	createInMemoryGit,
	skipLockPauses,
	stubAbortSignalTimeout,
	useFakeClock,
} from '../../../src/public/index';
import { MEASURED_META_KEY } from '../../../src/contracts/constants/time-budget.constant';

describe('useFakeClock', () => {
	it('[<10ms] runs a timer when the clock moves, with no real wait', async () => {
		const clock = useFakeClock();
		let fired = false;
		setTimeout(() => {
			fired = true;
		}, 60_000);
		clock.advance(59_999);
		expect(fired).toBe(false);
		await clock.advanceAsync(1);
		expect(fired).toBe(true);
	});

	it('[<10ms] leaves the budget runner on the real clock', ({
		task,
		onTestFinished,
	}) => {
		const clock = useFakeClock();
		clock.advance(60_000);
		onTestFinished(() => {
			// The runner measured the body; the minute the fake clock moved is not in it.
			expect(task.meta[MEASURED_META_KEY]).toBeLessThan(1_000);
		});
	});
});

describe('stubAbortSignalTimeout', () => {
	it('[<7ms] hands out a signal the spec fires, and records the duration', () => {
		const deadlines = stubAbortSignalTimeout();
		const signal = AbortSignal.timeout(8_000);
		expect(signal.aborted).toBe(false);
		deadlines.fire(0);
		expect(signal.aborted).toBe(true);
		expect(deadlines.requested()).toEqual([8_000]);
	});
});

describe('skipLockPauses', () => {
	it('[<8ms] runs a pause of the named length at once and tells the spec', async () => {
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
	it('[<6ms] answers from its table, records calls and refuses the unknown', () => {
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

	it('[<47ms] copies a repository whose remote and worktree point at the copy', () => {
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
