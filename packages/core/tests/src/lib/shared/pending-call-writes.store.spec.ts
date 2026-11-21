/**
 * pending-call-writes.store.spec.ts — the record of tool writes still to
 * commit lives beside the worktree's git metadata, and an unreadable one
 * reads as nothing pending.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { createGitRunner } from '../../../../src/lib/shared/git-write';
import {
	readPendingCallWrites,
	writePendingCallWrites,
} from '../../../../src/lib/shared/pending-call-writes.store';

const dirs: string[] = [];
afterEach(() => {
	for (const dir of dirs.splice(0))
		rmSync(dir, { recursive: true, force: true });
});

const scratch = (): string => {
	const dir = mkdtempSync(join(tmpdir(), 'pending-writes-'));
	dirs.push(dir);
	return dir;
};

const repo = (): string => {
	const root = scratch();
	execFileSync('git', ['init', '-q', root]);
	return root;
};

const write = { subject: 'chore(delendai): t', paths: { 'a.md': 'M :1' } };

describe('pending call writes', () => {
	it('round-trips beside the git metadata, and an empty list removes it', async () => {
		const root = repo();
		const git = createGitRunner(root);
		await writePendingCallWrites(git, [write]);
		const file = join(root, '.git', 'delendai-pending-call-writes.json');
		expect(existsSync(file)).toBe(true);
		expect(await readPendingCallWrites(git)).toEqual([write]);

		await writePendingCallWrites(git, []);
		expect(existsSync(file)).toBe(false);
		expect(await readPendingCallWrites(git)).toEqual([]);
	});

	it('reads an unreadable or foreign record as nothing pending', async () => {
		const root = repo();
		const git = createGitRunner(root);
		const file = join(root, '.git', 'delendai-pending-call-writes.json');
		writeFileSync(file, '{ not json');
		expect(await readPendingCallWrites(git)).toEqual([]);
		writeFileSync(file, '{"subject":"x"}');
		expect(await readPendingCallWrites(git)).toEqual([]);
	});

	it('keeps nothing where there is no repository', async () => {
		const git = createGitRunner(scratch());
		await writePendingCallWrites(git, [write]);
		expect(await readPendingCallWrites(git)).toEqual([]);
	});
});
