/**
 * journal-claim.helper.spec.ts — one drain per journal: a live owner's
 * claim is never taken, a dead one's is adopted, and a new claim never
 * lands on an existing file.
 */
import { mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { claimJournal, isProcessAlive } from './journal-claim.helper';

describe('claimJournal', () => {
	let dir = '';
	let journal = '';

	beforeEach(async () => {
		dir = await mkdtemp(join(tmpdir(), 'claim-'));
		journal = join(dir, 'j.ndjson');
	});

	afterEach(async () => {
		await rm(dir, { recursive: true, force: true });
	});

	it('takes the live journal under a name carrying its pid', async () => {
		await writeFile(journal, 'a\n');
		const claimed = await claimJournal(journal);
		expect(claimed).toContain(`.draining.${process.pid}.`);
		expect(await readFile(claimed ?? '', 'utf8')).toBe('a\n');
		expect(await claimJournal(journal)).toBeUndefined();
	});

	it('adopts an unowned leftover and keeps the live journal for later', async () => {
		await writeFile(`${journal}.draining`, 'old\n');
		await writeFile(journal, 'new\n');
		const claimed = await claimJournal(journal);
		expect(await readFile(claimed ?? '', 'utf8')).toBe('old\n');
		expect(await readFile(journal, 'utf8')).toBe('new\n');
	});

	it('adopts a dead owner only, never a live one', async () => {
		const owned = (pid: number) =>
			`${journal}.draining.${pid}.aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa`;
		await writeFile(owned(4242), 'held\n');
		expect(await claimJournal(journal, () => true)).toBeUndefined();
		const claimed = await claimJournal(journal, () => false);
		expect(await readFile(claimed ?? '', 'utf8')).toBe('held\n');
		expect((await readdir(dir)).length).toBe(1);
	});

	it('knows this process is alive and an impossible pid is not', () => {
		expect(isProcessAlive(process.pid)).toBe(true);
		expect(isProcessAlive(99_999_999)).toBe(false);
	});
});
