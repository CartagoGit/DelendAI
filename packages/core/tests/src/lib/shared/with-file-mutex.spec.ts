import {
	existsSync,
	mkdtempSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from 'node:fs';
import { utimesSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { LockContentionError, withFileMutex } from '@mcp-vertex/core/public';

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

	it('onContention:fail throws LockContentionError on a live holder instead of stealing (M28)', async () => {
		writeFileSync(target, '{}');
		// Simulate a live holder: a fresh sidecar that is NOT stale.
		const lockPath = `${target}.mutex`;
		writeFileSync(lockPath, `${process.pid}\n${Date.now()}\nmanual`);

		let ran = false;
		await expect(
			withFileMutex(
				target,
				async () => {
					ran = true;
				},
				{
					onContention: 'fail',
					timeoutMs: 120,
					staleMs: 30_000,
					pollMs: 20,
				},
			),
		).rejects.toBeInstanceOf(LockContentionError);
		expect(ran).toBe(false);
		// The live holder's lock was left intact (not stolen).
		expect(existsSync(lockPath)).toBe(true);
	});

	it('default (steal) still reclaims a live lock past the timeout', async () => {
		writeFileSync(target, '{}');
		writeFileSync(
			`${target}.mutex`,
			`${process.pid}\n${Date.now()}\nmanual`,
		);
		let ran = false;
		await withFileMutex(
			target,
			async () => {
				ran = true;
			},
			{ timeoutMs: 120, staleMs: 30_000, pollMs: 20 },
		);
		expect(ran).toBe(true);
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
			}),
		).rejects.toThrow('boom');
		expect(existsSync(sidecar)).toBe(false);
	});

	it('does NOT delete the lock if it was stolen by another holder', async () => {
		// Regression for the steal-and-delete race: A holds the lock, its
		// fn() overruns, B steals it (replacing the sidecar with B's token).
		// When A finally returns, its release must NOT remove B's lock.
		const sidecar = `${target}.mutex`;
		let release: () => void = () => undefined;
		const held = new Promise<void>((r) => {
			release = r;
		});

		const aDone = withFileMutex(target, async () => {
			await held;
		});

		// Wait until A has acquired (sidecar written), then simulate B stealing.
		while (!existsSync(sidecar)) await new Promise((r) => setTimeout(r, 5));
		const stolenToken = '12345\n0\nb-owns-this-now';
		writeFileSync(sidecar, stolenToken);

		release();
		await aDone;

		// B's lock must survive A's release.
		expect(existsSync(sidecar)).toBe(true);
		expect(readFileSync(sidecar, 'utf8')).toBe(stolenToken);
	});

	it('steals an abandoned (stale) lock instead of deadlocking', async () => {
		const sidecar = `${target}.mutex`;
		// Simulate a crashed holder: a stale sidecar left on disk.
		writeFileSync(sidecar, '99999\n0');
		const old = new Date(Date.now() - 60_000);
		utimesSync(sidecar, old, old);

		const result = await withFileMutex(target, async () => 'acquired', {
			staleMs: 1_000,
			timeoutMs: 200,
		});
		expect(result).toBe('acquired');
		expect(existsSync(sidecar)).toBe(false);
	});
});
