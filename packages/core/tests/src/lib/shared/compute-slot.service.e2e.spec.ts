/**
 * compute-slot.service.spec.ts — heavy compute on one machine takes turns:
 * a second caller waits (and says for whom), and a dead holder frees the slot.
 */
import { type ChildProcess, spawn, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
	mkdirSync,
	mkdtempSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

import { waitUntil } from '@delendai/test-kit';

import { COMPUTE_SLOT_ENV } from '@delendai/core/lib/contracts/constants/compute-slot.constant';
import {
	readComputeSlotLane,
	urgentLogPath,
} from '@delendai/core/lib/shared/compute-slot-lane.service';
import {
	computeSlotPath,
	withComputeSlot,
} from '@delendai/core/lib/shared/compute-slot.service';

const dirs: string[] = [];
const children: ChildProcess[] = [];
const lockIn = (): string => {
	const dir = mkdtempSync(join(tmpdir(), 'compute-slot-'));
	dirs.push(dir);
	return join(dir, 'heavy-compute.lock');
};

afterEach(() => {
	for (const proc of children.splice(0))
		if (proc.exitCode === null && proc.signalCode === null)
			proc.kill('SIGKILL');
	for (const dir of dirs.splice(0))
		rmSync(dir, { recursive: true, force: true });
});

describe('withComputeSlot', () => {
	it('[<80ms] runs two concurrent proofs one after the other and names the holder', async () => {
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

	it('[<200ms] tells a waiter each new holder once, then that it got its turn', async () => {
		const lockPath = lockIn();
		const gate = () => {
			let open: () => void = () => undefined;
			const promise = new Promise<void>((resolve) => {
				open = resolve;
			});
			return { promise, open };
		};
		const firstHolds = gate();
		const secondHolds = gate();
		const told: string[] = [];
		const heard = new Map<string, () => void>();
		const hear = (word: string) =>
			new Promise<void>((resolve) => heard.set(word, resolve));
		const toldOfFirst = hear('agent-a');
		const toldOfSecond = hear('agent-b');
		const quiet = () => undefined;
		const first = withComputeSlot({
			lockPath,
			label: 'proof of aaa by agent-a',
			notify: quiet,
			run: () => firstHolds.promise,
		});
		const second = withComputeSlot({
			lockPath,
			label: 'proof of bbb by agent-b',
			notify: quiet,
			run: () => secondHolds.promise,
		});
		const waiter = withComputeSlot({
			lockPath,
			label: 'proof of ccc by agent-c',
			waitNoticeMs: 0,
			notify: (message) => {
				told.push(message);
				for (const [word, resolve] of heard)
					if (message.includes(`by ${word}`)) resolve();
			},
			run: () => 'ran',
		});
		await toldOfFirst;
		firstHolds.open();
		await toldOfSecond;
		secondHolds.open();
		await Promise.all([first, second]);
		expect(await waiter).toBe('ran');
		const waits = told.filter((line) => line.includes('is waiting'));
		expect(waits).toHaveLength(2);
		expect(waits[0]).toMatch(/holds.*/u);
		expect(waits[0]).toContain('agent-a (pid');
		expect(waits[1]).toContain('agent-b (pid');
		expect(told.at(-1)).toMatch(/got its turn/u);
	});

	it('[<25ms] releases the slot when the work throws', async () => {
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

	it('[<1000ms] reclaims the slot from a holder that died without releasing it', async () => {
		const lockPath = lockIn();
		const service = join(
			dirname(fileURLToPath(import.meta.url)),
			'../../../../src/lib/shared/compute-slot.service.ts',
		);
		const holder = spawn(
			'bun',
			[
				'-e',
				`import {
	computeSlotPath,
	withComputeSlot,
} from ${JSON.stringify(service)};
await withComputeSlot({ staleMs: 600, lockPath: ${JSON.stringify(lockPath)}, label: 'doomed', run: async () => { console.log('held'); await new Promise(() => {}); } });`,
			],
			{ stdio: ['ignore', 'pipe', 'inherit'] },
		);
		children.push(holder);
		await new Promise<void>((resolve) =>
			holder.stdout.once('data', () => resolve()),
		);
		holder.kill('SIGKILL');
		await new Promise((resolve) => holder.once('exit', resolve));
		// No wall-clock bound: the reclaim is awaited, and the runner's own
		// case timeout turns a slot that never frees into a failure.
		await expect(
			withComputeSlot({
				lockPath,
				label: 'next',
				staleMs: 600,
				run: () => 'got it',
			}),
		).resolves.toBe('got it');
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

	it('[<120ms] joins a second caller on the same tip to the first wait', async () => {
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

	it('[<120ms] proves only the newer tip of one unit', async () => {
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
	/**
	 * A child process asking for the slot on one tip. The holder keeps the
	 * turn until the parent writes a line to its stdin, so it outlasts the
	 * second asker by construction, not by a sleep. It waits on the pipe, so
	 * it uses no CPU, and the pipe closes when the parent dies, so a child
	 * never outlives the spec that started it. A joiner raises no notice, so the asker
	 * says ASKING as it calls; the holder is released only after that, and
	 * the joiner's one read of the claim comes before the holder can have
	 * finished (it still has the release, its result and its claim to
	 * write). That ordering is the one thing here not enforced by a flag.
	 */
	const child = (lockPath: string, tip: string, marker: string) => {
		const script = `
			import { appendFileSync } from 'node:fs';
			const released = new Promise((resolve) => {
				process.stdin.on('data', resolve);
				process.stdin.on('end', () => process.exit(1));
			});
			const { withComputeSlot } = await import(${JSON.stringify(moduleUrl)});
			console.log('ASKING');
			const value = await withComputeSlot({
				lockPath: ${JSON.stringify(lockPath)}, label: 'child', unit: 'u1',
				tip: ${JSON.stringify(tip)}, notify: () => undefined,
				run: async () => {
					appendFileSync(${JSON.stringify(marker)}, ${JSON.stringify(tip)} + '\\n');
					console.log('HELD');
					await released;
					return 'proof-of-' + ${JSON.stringify(tip)};
				},
			});
			console.log('ANSWER ' + value);
			process.exit(0);
		`;
		const proc = spawn('bun', ['-e', script], {
			stdio: ['pipe', 'pipe', 'inherit'],
		});
		children.push(proc);
		let out = '';
		proc.stdout.on('data', (c: Buffer) => (out += c.toString()));
		const done = new Promise<string>((resolve, reject) => {
			proc.on('error', reject);
			proc.on('close', () => resolve(out));
		});
		return {
			done,
			release: () => proc.stdin?.write('go\n'),
			orphan: () => proc.stdin?.end(),
			exitCode: () => proc.exitCode,
			said: (word: string) =>
				waitUntil(`the child said ${word}`, () => out.includes(word), {
					timeoutMs: 60_000,
				}),
		};
	};

	it('[<250ms] joins two processes on one tip and proves it once', async () => {
		const lockPath = lockIn();
		const marker = `${lockPath}.ran`;
		const first = child(lockPath, 'aaa', marker);
		await first.said('HELD');
		const second = child(lockPath, 'aaa', marker);
		await second.said('ASKING');
		first.release();
		const [one, two] = await Promise.all([first.done, second.done]);
		expect(one).toContain('ANSWER proof-of-aaa');
		expect(two).toContain('ANSWER proof-of-aaa');
		expect(readFileSync(marker, 'utf8').trim().split('\n')).toEqual([
			'aaa',
		]);
	});

	it('[<200ms] ends a holder whose parent went away instead of waiting forever', async () => {
		const lockPath = lockIn();
		const holder = child(lockPath, 'bbb', `${lockPath}.ran`);
		await holder.said('HELD');
		holder.orphan();
		const out = await holder.done;
		expect(out).not.toContain('ANSWER');
		expect(holder.exitCode()).toBe(1);
	});
});

describe('withComputeSlot unit turns, failures', () => {
	it('[<120ms] gives a joiner the failure of the claimant, code included', async () => {
		const lockPath = lockIn();
		const ask = () =>
			withComputeSlot({
				lockPath,
				label: 'proof',
				unit: 'u2',
				tip: 'ccc',
				notify: () => undefined,
				run: () => {
					throw Object.assign(new Error('proof broke'), {
						code: 'proof-broke',
					});
				},
			});
		const first = ask();
		const second = ask();
		const settled = await Promise.allSettled([first, second]);
		for (const outcome of settled) {
			expect(outcome).toMatchObject({
				status: 'rejected',
				reason: { message: 'proof broke', code: 'proof-broke' },
			});
		}
	});

	it('[<20ms] takes over a claim whose process is gone', async () => {
		const lockPath = lockIn();
		const unitHash = createHash('sha1')
			.update('u3')
			.digest('hex')
			.slice(0, 16);
		const dir = `${lockPath}.units/${unitHash}`;
		mkdirSync(dir, { recursive: true });
		writeFileSync(
			join(dir, 'ddd.claim'),
			JSON.stringify({ pid: 2 ** 22 + 12345, id: 'gone' }),
		);
		await expect(
			withComputeSlot({
				lockPath,
				label: 'proof',
				unit: 'u3',
				tip: 'ddd',
				notify: () => undefined,
				run: () => 'mine',
			}),
		).resolves.toBe('mine');
	});

	it('[<240ms] runs again after a finished turn of the same tip', async () => {
		const lockPath = lockIn();
		let runs = 0;
		const ask = () =>
			withComputeSlot({
				lockPath,
				label: 'proof',
				unit: 'u4',
				tip: 'eee',
				notify: () => undefined,
				run: () => ++runs,
			});
		expect(await ask()).toBe(1);
		expect(await ask()).toBe(2);
	});
});

describe('withComputeSlot superseded turns', () => {
	it('[<450ms] proves its own tip when the turn it followed gave way and nothing newer answers', async () => {
		const lockPath = lockIn();
		const unitHash = createHash('sha1')
			.update('u5')
			.digest('hex')
			.slice(0, 16);
		const dir = `${lockPath}.units/${unitHash}`;
		mkdirSync(dir, { recursive: true });
		writeFileSync(
			join(dir, 'fff.claim'),
			JSON.stringify({ pid: process.pid, id: 'gave-way' }),
		);
		writeFileSync(
			join(dir, 'fff.gave-way.result'),
			JSON.stringify({ superseded: true }),
		);
		// A follower raises no notice and the claim's reads are not
		// observable from here, so the claim is dropped on the asker's own
		// poll clock: any moment after the first pass proves the same path.
		// delendai:timing-is-the-subject
		setTimeout(() => rmSync(join(dir, 'fff.claim'), { force: true }), 80);
		await expect(
			withComputeSlot({
				lockPath,
				label: 'proof',
				unit: 'u5',
				tip: 'fff',
				notify: () => undefined,
				run: () => 'own',
			}),
		).resolves.toBe('own');
	});
});

describe('computeSlotPath', () => {
	// The repository and the plain directory are made once for the file:
	// git init inside the case took up to 99 ms on CI against a 40 ms
	// budget, for a fact about where the path points.
	let plain = '';
	let repo = '';
	beforeAll(() => {
		plain = mkdtempSync(join(tmpdir(), 'compute-slot-plain-'));
		repo = mkdtempSync(join(tmpdir(), 'compute-slot-git-'));
		spawnSync('git', ['init', '-q', repo]);
	});
	afterAll(() => {
		for (const dir of [plain, repo]) {
			rmSync(dir, { recursive: true, force: true });
		}
	});

	it('[<40ms] lives in the shared git directory, and is absent outside a repository', () => {
		expect(computeSlotPath(plain)).toBeUndefined();
		expect(computeSlotPath(repo)).toMatch(
			/\.git[\\/]delendai[\\/]heavy-compute\.lock$/u,
		);
	});
});

describe('withComputeSlot urgent lane', () => {
	it('[<600ms] runs urgent callers ahead of waiting normals, in order, without interrupting the running proof', async () => {
		const lockPath = lockIn();
		const events: string[] = [];
		const owners: string[] = [];
		const notices: string[] = [];
		let release: () => void = () => undefined;
		const held = new Promise<void>((resolve) => {
			release = resolve;
		});
		const job = (name: string, urgent?: string, hold?: Promise<void>) =>
			withComputeSlot({
				lockPath,
				label: `proof ${name}`,
				waitNoticeMs: 20,
				notify: (message) => notices.push(message),
				...(urgent === undefined ? {} : { urgent }),
				run: async () => {
					events.push(`${name}:start`);
					if (urgent !== undefined) {
						owners.push(readFileSync(`${lockPath}.owner`, 'utf8'));
					}
					await hold;
					events.push(`${name}:end`);
				},
			});
		const waitingFor = (name: string) =>
			waitUntil(`proof ${name} is waiting`, () =>
				notices.some((notice) => notice.includes(`"proof ${name}"`)),
			);
		const all = [job('running', undefined, held)];
		await waitUntil('the running proof holds the slot', () =>
			events.includes('running:start'),
		);
		all.push(job('n1'));
		await waitingFor('n1');
		all.push(job('n2'));
		await waitingFor('n2');
		all.push(job('u1', 'develop is red'));
		await waitingFor('u1');
		all.push(job('u2', 'owner asked'));
		await waitingFor('u2');
		const lane = await readComputeSlotLane(lockPath);
		expect(lane.holder).toMatch(/proof running/u);
		expect(lane.urgent.map((ticket) => ticket.reason)).toEqual([
			'develop is red',
			'owner asked',
		]);
		// The running proof is untouched while urgent callers wait.
		expect(events).toEqual(['running:start']);
		release();
		await Promise.all(all);
		expect(events.slice(0, 5)).toEqual([
			'running:start',
			'running:end',
			'u1:start',
			'u1:end',
			'u2:start',
		]);
		expect(events.indexOf('n1:start')).toBeGreaterThan(
			events.indexOf('u2:end'),
		);
		expect(events.indexOf('n2:start')).toBeGreaterThan(
			events.indexOf('u2:end'),
		);
		expect(owners.map((owner) => JSON.parse(owner).urgent)).toEqual([
			'develop is red',
			'owner asked',
		]);
		const log = readFileSync(urgentLogPath(lockPath), 'utf8')
			.trim()
			.split('\n')
			.map(
				(line) => JSON.parse(line) as { reason: string; label: string },
			);
		expect(log.map((entry) => entry.reason)).toEqual([
			'develop is red',
			'owner asked',
		]);
		expect(notices.join('\n')).toMatch(/Urgent lane/u);
		expect((await readComputeSlotLane(lockPath)).urgent).toEqual([]);
	});
});
