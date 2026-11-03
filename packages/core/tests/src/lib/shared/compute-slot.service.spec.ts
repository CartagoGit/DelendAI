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

describe('withComputeSlot per unit and tip', () => {
	const gate = () => {
		let open: () => void = () => undefined;
		const promise = new Promise<void>((resolve) => {
			open = resolve;
		});
		return { promise, open };
	};

	it('joins a second caller on the same tip to the first wait', async () => {
		const lockPath = lockIn();
		const blocker = gate();
		const holding = withComputeSlot({
			lockPath,
			label: 'holder',
			run: () => blocker.promise,
		});
		let runs = 0;
		const ask = () =>
			withComputeSlot({
				lockPath,
				label: 'proof',
				unit: 'u1',
				tip: 'aaa',
				notify: () => undefined,
				run: () => ++runs,
			});
		const first = ask();
		const second = ask();
		blocker.open();
		await holding;
		expect(await Promise.all([first, second])).toEqual([1, 1]);
		expect(runs).toBe(1);
	});

	it('proves only the newer tip of one unit', async () => {
		const lockPath = lockIn();
		const blocker = gate();
		const holding = withComputeSlot({
			lockPath,
			label: 'holder',
			run: () => blocker.promise,
		});
		const proved: string[] = [];
		const ask = (tip: string) =>
			withComputeSlot({
				lockPath,
				label: tip,
				unit: 'u1',
				tip,
				notify: () => undefined,
				run: () => {
					proved.push(tip);
					return tip;
				},
			});
		const older = ask('old');
		const newer = ask('new');
		blocker.open();
		await holding;
		expect(await Promise.all([older, newer])).toEqual(['new', 'new']);
		expect(proved).toEqual(['new']);
	});
});

describe('withComputeSlot across processes', () => {
	const moduleUrl = new URL(
		'../../../../src/lib/shared/compute-slot.service.ts',
		import.meta.url,
	).href;
	const child = (lockPath: string, tip: string, marker: string) => {
		const script = `
			import { appendFileSync } from 'node:fs';
			const { withComputeSlot } = await import(${JSON.stringify(moduleUrl)});
			const value = await withComputeSlot({
				lockPath: ${JSON.stringify(lockPath)}, label: 'child', unit: 'u1',
				tip: ${JSON.stringify(tip)}, notify: () => undefined,
				run: async () => {
					appendFileSync(${JSON.stringify(marker)}, ${JSON.stringify(tip)} + '\\n');
					await new Promise((r) => setTimeout(r, 1500));
					return 'proof-of-' + ${JSON.stringify(tip)};
				},
			});
			console.log('ANSWER ' + value);
		`;
		return new Promise<string>((resolve, reject) => {
			const proc = spawn('bun', ['-e', script], {
				stdio: ['ignore', 'pipe', 'inherit'],
			});
			let out = '';
			proc.stdout.on('data', (c: Buffer) => (out += c.toString()));
			proc.on('error', reject);
			proc.on('close', () => resolve(out));
		});
	};

	it('joins two processes on one tip and proves it once', async () => {
		const lockPath = lockIn();
		const marker = `${lockPath}.ran`;
		const [one, two] = await Promise.all([
			child(lockPath, 'aaa', marker),
			(async () => {
				await new Promise((r) => setTimeout(r, 600));
				return child(lockPath, 'aaa', marker);
			})(),
		]);
		expect(one).toContain('ANSWER proof-of-aaa');
		expect(two).toContain('ANSWER proof-of-aaa');
		const { readFileSync } = await import('node:fs');
		expect(readFileSync(marker, 'utf8').trim().split('\n')).toEqual([
			'aaa',
		]);
	}, 30_000);
});
