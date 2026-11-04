import { execFileSync } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import type { IGitRunner } from '../../../../src/lib/contracts/interfaces/git-runner.interface';
import {
	fetchMakerNotes,
	makersOf,
	pushMakerNotes,
	recordCommitMaker,
} from '../../../../src/lib/work-units/commit-maker-notes.service';

const env = {
	...process.env,
	GIT_AUTHOR_NAME: 't',
	GIT_AUTHOR_EMAIL: 't@t',
	GIT_COMMITTER_NAME: 't',
	GIT_COMMITTER_EMAIL: 't@t',
};

const sh = (cwd: string, ...args: string[]): string =>
	execFileSync('git', args, { cwd, env, encoding: 'utf8' }).trim();

const runnerIn =
	(cwd: string): IGitRunner =>
	async (args) => {
		try {
			return { ok: true, output: sh(cwd, ...args) };
		} catch {
			return { ok: false, output: '' };
		}
	};

/** A bare remote and a clone of it with one commit on develop. */
const setup = () => {
	const base = mkdtempSync(join(tmpdir(), 'maker-notes-'));
	const remote = join(base, 'origin.git');
	execFileSync('git', ['init', '-q', '--bare', remote]);
	const clone = (name: string): string => {
		const dir = join(base, name);
		execFileSync('git', ['clone', '-q', remote, dir], { env });
		return dir;
	};
	const first = clone('a');
	sh(first, 'commit', '-q', '--allow-empty', '-m', 'base');
	sh(first, 'push', '-q', 'origin', 'HEAD:refs/heads/develop');
	return { clone, first };
};

describe('commit maker notes', () => {
	it('records the maker of a commit and reads it back', async () => {
		const { first } = setup();
		const git = runnerIn(first);
		expect(
			await recordCommitMaker(
				git,
				'glm-5.3-flash',
				'delendai/wip/glm-5.3-flash/review/x-all-g1/t',
			),
		).toBe(true);
		const head = sh(first, 'rev-parse', 'HEAD');
		expect(await makersOf(git, [head])).toEqual(
			new Map([
				[
					head,
					{
						agent: 'glm-5.3-flash',
						unit: 'delendai/wip/glm-5.3-flash/review/x-all-g1/t',
					},
				],
			]),
		);
	});

	it('merges two instances of one agent on push, and a fresh clone reads both', async () => {
		const { clone, first } = setup();
		const second = clone('b');
		sh(second, 'fetch', '-q', 'origin', 'develop');
		sh(second, 'checkout', '-q', '-B', 'develop', 'origin/develop');

		sh(first, 'commit', '-q', '--allow-empty', '-m', 'one');
		await recordCommitMaker(runnerIn(first), 'gemini-3.8-flash', 'u1');
		const one = sh(first, 'rev-parse', 'HEAD');
		sh(first, 'push', '-q', 'origin', 'HEAD:refs/heads/u1');
		expect(
			await pushMakerNotes(runnerIn(first), 'origin', 'gemini-3.8-flash'),
		).toBe(true);

		sh(second, 'commit', '-q', '--allow-empty', '-m', 'two');
		await recordCommitMaker(runnerIn(second), 'gemini-3.8-flash', 'u2');
		const two = sh(second, 'rev-parse', 'HEAD');
		sh(second, 'push', '-q', 'origin', 'HEAD:refs/heads/u2');
		// The first push of this instance is refused (the other pushed first):
		// the notes are merged and pushed again.
		expect(
			await pushMakerNotes(
				runnerIn(second),
				'origin',
				'gemini-3.8-flash',
			),
		).toBe(true);

		const third = clone('c');
		sh(third, 'fetch', '-q', 'origin', 'u1', 'u2');
		expect(await fetchMakerNotes(runnerIn(third), 'origin')).toBe(true);
		expect(await makersOf(runnerIn(third), [one, two])).toEqual(
			new Map([
				[one, { agent: 'gemini-3.8-flash', unit: 'u1' }],
				[two, { agent: 'gemini-3.8-flash', unit: 'u2' }],
			]),
		);
	});

	it('names no maker for a commit nobody recorded', async () => {
		const { first } = setup();
		expect(
			await makersOf(runnerIn(first), [sh(first, 'rev-parse', 'HEAD')]),
		).toEqual(new Map());
	});

	it('keeps both notes when two instances of one model write at once on one machine', async () => {
		const { first } = setup();
		const other = join(first, '..', 'a-second-worktree');
		sh(first, 'worktree', 'add', '-q', '-b', 'u2', other);
		sh(first, 'commit', '-q', '--allow-empty', '-m', 'instance one');
		sh(other, 'commit', '-q', '--allow-empty', '-m', 'instance two');
		const [okOne, okTwo] = await Promise.all([
			recordCommitMaker(runnerIn(first), 'qwen-3.8-flash', 'u1'),
			recordCommitMaker(runnerIn(other), 'qwen-3.8-flash', 'u2'),
		]);
		expect([okOne, okTwo]).toEqual([true, true]);
		const one = sh(first, 'rev-parse', 'HEAD');
		const two = sh(other, 'rev-parse', 'HEAD');
		const makers = await makersOf(runnerIn(first), [one, two]);
		expect(makers.get(one)?.unit).toBe('u1');
		expect(makers.get(two)?.unit).toBe('u2');
	});
});
