import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { utimesSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { withFileMutex } from '@cartago-git/mcp-core/public';

describe('withFileMutex — cross-process critical section', () => {
	let dir = '';
	let target = '';
	beforeEach(() => {
		dir = mkdtempSync(join(tmpdir(), 'mutex-'));
		target = join(dir, 'state.json');
	});
	afterEach(() => {
		rmSync(dir, { recursive: true, force: true });
	});

	it('serializes concurrent read → mutate → write (no lost updates)', async () => {
		writeFileSync(target, JSON.stringify({ items: [] as string[] }));

		// Without the mutex these interleave and lose updates; with it,
		// each append sees the previous writer's result.
		const append = (value: string): Promise<void> =>
			withFileMutex(target, async () => {
				const state = JSON.parse(readFileSync(target, 'utf8')) as {
					items: string[];
				};
				// Yield to force interleaving if the section were not exclusive.
				await new Promise((r) => setTimeout(r, 1));
				state.items.push(value);
				writeFileSync(target, JSON.stringify(state));
			});

		await Promise.all(['a', 'b', 'c', 'd', 'e'].map(append));

		const final = JSON.parse(readFileSync(target, 'utf8')) as {
			items: string[];
		};
		expect(final.items.sort()).toEqual(['a', 'b', 'c', 'd', 'e']);
	});

	it('removes the sidecar lock on success and on throw', async () => {
		const sidecar = `${target}.mutex`;
		await withFileMutex(target, async () => undefined);
		expect(existsSync(sidecar)).toBe(false);

		await expect(
			withFileMutex(target, async () => {
				throw new Error('boom');
			})
		).rejects.toThrow('boom');
		expect(existsSync(sidecar)).toBe(false);
	});

	it('steals an abandoned (stale) lock instead of deadlocking', async () => {
		const sidecar = `${target}.mutex`;
		// Simulate a crashed holder: a stale sidecar left on disk.
		writeFileSync(sidecar, '99999\n0');
		const old = new Date(Date.now() - 60_000);
		utimesSync(sidecar, old, old);

		const result = await withFileMutex(
			target,
			async () => 'acquired',
			{ staleMs: 1_000, timeoutMs: 200 }
		);
		expect(result).toBe('acquired');
		expect(existsSync(sidecar)).toBe(false);
	});
});
