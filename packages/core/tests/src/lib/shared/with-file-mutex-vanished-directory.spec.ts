/**
 * with-file-mutex-vanished-directory.spec.ts — a lock directory removed
 * between the `mkdir` and the `open` of the sidecar is made again. That
 * ENOENT lost the first event of a day from the error stream; one that
 * keeps vanishing still surfaces.
 */
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import {
	__resetWithFileMutexTestHooks,
	__setWithFileMutexTestHooks,
	withFileMutex,
} from '../../../../src/lib/shared/with-file-mutex';

describe('withFileMutex over a directory that vanishes', () => {
	afterEach(() => {
		__resetWithFileMutexTestHooks();
	});

	it('makes the directory again and takes the lock', async () => {
		const root = mkdtempSync(join(tmpdir(), 'mutex-vanish-'));
		const dir = join(root, 'logs');
		let removed = 0;
		__setWithFileMutexTestHooks({
			beforeCreate: () => {
				if (removed === 0) {
					removed += 1;
					rmSync(dir, { recursive: true, force: true });
				}
			},
		});
		const file = join(dir, '2026-10-25.jsonl');
		await expect(withFileMutex(file, async () => 'ran')).resolves.toBe(
			'ran',
		);
		expect(removed).toBe(1);
		expect(existsSync(dir)).toBe(true);
		expect(existsSync(`${file}.mutex`)).toBe(false);
	});

	it('surfaces a directory that keeps vanishing', async () => {
		const root = mkdtempSync(join(tmpdir(), 'mutex-vanish-'));
		const dir = join(root, 'logs');
		__setWithFileMutexTestHooks({
			beforeCreate: () => {
				rmSync(dir, { recursive: true, force: true });
			},
		});
		await expect(
			withFileMutex(join(dir, 'a.jsonl'), async () => 'ran'),
		).rejects.toMatchObject({ code: 'ENOENT' });
	});
});
