/**
 * compute-slot.service.spec.ts — heavy compute on one machine takes turns:
 * a second caller waits (and says for whom), and a dead holder frees the slot.
 */
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterEach, describe, expect, it } from 'vitest';

import { COMPUTE_SLOT_ENV } from '@delendai/core/lib/contracts/constants/compute-slot.constant';
import { withComputeSlot } from '@delendai/core/lib/shared/compute-slot.service';

const dirs: string[] = [];
const lockIn = (): string => {
	const dir = mkdtempSync(join(tmpdir(), 'compute-slot-'));
	dirs.push(dir);
	return join(dir, 'heavy-compute.lock');
};

afterEach(() => {
	for (const dir of dirs.splice(0))
		rmSync(dir, { recursive: true, force: true });
});

describe('withComputeSlot', () => {
	it('runs two concurrent proofs one after the other and names the holder', async () => {
		const lockPath = lockIn();
		const events: string[] = [];
		const notices: string[] = [];
		let release: () => void = () => undefined;
		const held = new Promise<void>((resolve) => {
			release = resolve;
		});
		let waiterSpoke: () => void = () => undefined;
		const spoke = new Promise<void>((resolve) => {
			waiterSpoke = resolve;
		});
		const job = (
			name: string,
			label: string,
			hold: Promise<void> | undefined,
		) =>
			withComputeSlot({
				lockPath,
				label,
				waitNoticeMs: 20,
				notify: (message) => {
					notices.push(message);
					waiterSpoke();
				},
				run: async () => {
					events.push(`${name}:start`);
					await hold;
					events.push(`${name}:end`);
				},
			});
		const first = job('a', 'proof of aaa by agent-a', held);
		const second = job('b', 'proof of bbb by agent-b', undefined);
		await spoke;
		expect(events).toEqual(['a:start']);
		release();
		await Promise.all([first, second]);
		expect(events).toEqual(['a:start', 'a:end', 'b:start', 'b:end']);
		expect(notices.join('\n')).toMatch(
			/"proof of bbb by agent-b" is waiting.*proof of aaa by agent-a/u,
		);
		expect(notices.join('\n')).toMatch(/got its turn/u);
		expect(process.env[COMPUTE_SLOT_ENV]).toBeUndefined();
	});

	it('releases the slot when the work throws', async () => {
		const lockPath = lockIn();
		await expect(
			withComputeSlot({
				lockPath,
				label: 'x',
				run: () => {
					throw new Error('boom');
				},
			}),
		).rejects.toThrow('boom');
		await expect(
			withComputeSlot({ lockPath, label: 'y', run: () => 'ok' }),
		).resolves.toBe('ok');
	});

	it('reclaims the slot from a holder that died without releasing it', async () => {
		const lockPath = lockIn();
		const service = join(
			dirname(fileURLToPath(import.meta.url)),
			'../../../../src/lib/shared/compute-slot.service.ts',
		);
		const holder = spawn(
			'bun',
			[
				'-e',
				`import { withComputeSlot } from ${JSON.stringify(service)};
await withComputeSlot({ staleMs: 600, lockPath: ${JSON.stringify(lockPath)}, label: 'doomed', run: async () => { console.log('held'); await new Promise(() => {}); } });`,
			],
			{ stdio: ['ignore', 'pipe', 'inherit'] },
		);
		await new Promise<void>((resolve) =>
			holder.stdout.once('data', () => resolve()),
		);
		holder.kill('SIGKILL');
		await new Promise((resolve) => holder.once('exit', resolve));
		const started = Date.now();
		await expect(
			withComputeSlot({
				lockPath,
				label: 'next',
				staleMs: 600,
				run: () => 'got it',
			}),
		).resolves.toBe('got it');
		expect(Date.now() - started).toBeLessThan(10_000);
	});
});
