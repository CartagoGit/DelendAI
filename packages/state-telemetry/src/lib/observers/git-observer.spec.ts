import { execFileSync } from 'node:child_process';
import {
	chmodSync,
	mkdirSync,
	mkdtempSync,
	rmSync,
	writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { asWorkItemId, type INewWorkEvent } from '../events/work-event';
import {
	GitObserver,
	hashGitObservation,
	parsePorcelainPaths,
} from './git-observer';

const git = (cwd: string, ...args: string[]): string =>
	execFileSync('git', args, { cwd, encoding: 'utf8' });

const initRepo = (dir: string): void => {
	git(dir, 'init', '-q', '-b', 'main');
	git(dir, 'config', 'user.email', 'test@example.com');
	git(dir, 'config', 'user.name', 'Test');
	git(dir, 'config', 'commit.gpgsign', 'false');
	writeFileSync(join(dir, 'seed.txt'), 'seed\n');
	git(dir, 'add', '-A');
	git(dir, 'commit', '-q', '-m', 'seed');
};

const makeSink = () => {
	const events: INewWorkEvent[] = [];
	return {
		events,
		append: async (event: INewWorkEvent): Promise<void> => {
			events.push(event);
		},
	};
};

describe('GitObserver (f00509 S2)', () => {
	let dir: string;

	beforeEach(() => {
		dir = mkdtempSync(join(tmpdir(), 'git-observer-'));
	});

	afterEach(() => {
		rmSync(dir, { recursive: true, force: true });
	});

	const observerFor = (cwd: string, sink = makeSink(), extra = {}) => ({
		sink,
		observer: new GitObserver({
			cwd,
			workItemId: asWorkItemId('f00509/S2'),
			actorId: 'agent:test',
			sink,
			...extra,
		}),
	});

	it('parses porcelain lines, keeping the new path of a rename', () => {
		expect(
			parsePorcelainPaths(' M a.ts\n?? b.ts\nR  old.ts -> new.ts\n'),
		).toEqual(['a.ts', 'b.ts', 'new.ts']);
	});

	it('emits one git_change per write with a distinct hash for each state', async () => {
		initRepo(dir);
		const { observer, sink } = observerFor(dir);
		const files = ['a.txt', 'b.txt', 'c.txt'];
		for (let i = 0; i < 5; i++) {
			writeFileSync(join(dir, files[i % 3]!), 'line\n'.repeat(i + 1));
			git(dir, 'add', '-A');
			observer.notify('write');
			await observer.idle();
		}
		expect(sink.events).toHaveLength(5);
		expect(sink.events.every((event) => event.kind === 'git_change')).toBe(
			true,
		);
		expect(
			new Set(sink.events.map((event) => event.payload_hash)).size,
		).toBe(5);
		expect(sink.events[0]!.work_item_id).toBe('f00509/S2');
		expect(sink.events[0]!.actor_id).toBe('agent:test');
	});

	it('hashes the changed paths, branch and diff stat of a write', async () => {
		initRepo(dir);
		writeFileSync(join(dir, 'seed.txt'), 'seed\nmore\n');
		const { observer, sink } = observerFor(dir);
		observer.notify('write');
		await observer.idle();
		expect(sink.events).toHaveLength(1);
		expect(sink.events[0]!.payload_hash).toBe(
			hashGitObservation({
				trigger: 'write',
				branch: 'main',
				paths: ['seed.txt'],
				diffStat: git(dir, 'diff', '--stat', 'HEAD').trim(),
			}),
		);
	});

	it('emits one event for a commit, describing the commit itself', async () => {
		initRepo(dir);
		writeFileSync(join(dir, 'new.txt'), 'x\n');
		git(dir, 'add', '-A');
		git(dir, 'commit', '-q', '-m', 'add new');
		const { observer, sink } = observerFor(dir);
		observer.notify('commit');
		await observer.idle();
		expect(sink.events).toHaveLength(1);
		expect(sink.events[0]!.payload_hash).toBe(
			hashGitObservation({
				trigger: 'commit',
				branch: 'main',
				paths: ['new.txt'],
				diffStat: git(
					dir,
					'show',
					'--stat',
					'--format=',
					'HEAD',
				).trim(),
			}),
		);
	});

	it('folds requests that arrive while one runs into a single repetition', async () => {
		initRepo(dir);
		const { observer, sink } = observerFor(dir);
		for (let i = 0; i < 10; i++) observer.notify('write');
		await observer.idle();
		expect(sink.events).toHaveLength(2);
	});

	it('emits nothing and does not throw outside a repository', async () => {
		const { observer, sink } = observerFor(dir);
		expect(() => observer.notify('write')).not.toThrow();
		await observer.idle();
		expect(sink.events).toEqual([]);
	});

	it('emits nothing when the git binary is missing', async () => {
		const { observer, sink } = observerFor(dir, makeSink(), {
			gitBinary: join(dir, 'no-such-git'),
		});
		observer.notify('write');
		await observer.idle();
		expect(sink.events).toEqual([]);
	});

	it('emits git_change_stale when git outlives the timeout, and keeps working', async () => {
		initRepo(dir);
		const slow = join(dir, 'slow-git.sh');
		writeFileSync(slow, '#!/bin/sh\nsleep 5\n');
		chmodSync(slow, 0o755);
		const { observer, sink } = observerFor(dir, makeSink(), {
			gitBinary: slow,
			timeoutMs: 50,
		});
		observer.notify('write');
		await observer.idle();
		expect(sink.events.map((event) => event.kind)).toEqual([
			'git_change_stale',
		]);
	});

	it('keeps two worktrees of one repo apart', async () => {
		initRepo(dir);
		const other = join(dir, 'wt');
		git(dir, 'worktree', 'add', '-q', '-b', 'other', other);
		mkdirSync(join(other, 'sub'), { recursive: true });
		writeFileSync(join(other, 'sub', 'only-here.txt'), 'x\n');
		const first = observerFor(dir);
		const second = observerFor(other);
		first.observer.notify('write');
		second.observer.notify('write');
		await Promise.all([first.observer.idle(), second.observer.idle()]);
		expect(first.sink.events).toHaveLength(1);
		expect(second.sink.events).toHaveLength(1);
		expect(second.sink.events[0]!.payload_hash).toBe(
			hashGitObservation({
				trigger: 'write',
				branch: 'other',
				paths: ['sub/'],
				diffStat: '',
			}),
		);
		expect(first.sink.events[0]!.payload_hash).not.toBe(
			second.sink.events[0]!.payload_hash,
		);
	});
});
