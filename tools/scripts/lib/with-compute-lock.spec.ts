/**
 * with-compute-lock.spec.ts
 *
 * Multiple agents in this swarm run `bun run test`/`typecheck`/`lint`
 * concurrently on the same machine; without serialization that spawns N
 * sets of heavy processes at once and can starve the machine's CPU/RAM.
 * These specs spawn the real script (matching the pattern in
 * quality-gate.spec.ts) so we exercise the same binary path
 * package.json's test/typecheck/lint scripts actually use.
 */
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

const HERE = new URL('.', import.meta.url).pathname;
const SCRIPT = join(HERE, 'with-compute-lock.script.ts');

describe('with-compute-lock.script.ts', () => {
	let lockDir = '';
	let lockPath = '';

	beforeEach(() => {
		lockDir = mkdtempSync(join(tmpdir(), 'compute-lock-test-'));
		lockPath = join(lockDir, 'heavy-compute.lock');
	});
	afterEach(() => rmSync(lockDir, { recursive: true, force: true }));

	// The real script hardcodes its own repo-relative lock path (every
	// invocation must contend for the SAME lock regardless of caller), so
	// these specs point it at a scratch lock via an env override rather
	// than asserting against the real repo lock (which other tests/agents
	// may be holding concurrently).
	const run = (
		args: readonly string[],
		env?: Record<string, string>,
	): ReturnType<typeof spawnSync> =>
		spawnSync('bun', [SCRIPT, ...args], {
			encoding: 'utf8',
			timeout: 15_000,
			env: {
				...process.env,
				DELENDAI_TEST_COMPUTE_LOCK_PATH: lockPath,
				...env,
			},
		});

	it('runs the wrapped shell command and forwards its exit code', () => {
		const ok = run(['smoke', '--', 'exit 0']);
		expect(ok.status).toBe(0);

		const failing = run(['smoke', '--', 'exit 7']);
		expect(failing.status).toBe(7);
	});

	it('rejects a missing command with usage and exit code 2', () => {
		const noDoubleDash = run(['smoke']);
		expect(noDoubleDash.status).toBe(2);
		expect(noDoubleDash.stderr).toMatch(/usage:/);
	});

	it('runs `&&`-joined compound shell commands correctly', () => {
		const outFile = join(lockDir, 'compound-output.txt');
		const result = run([
			'smoke',
			'--',
			`echo one >> ${outFile} && echo two >> ${outFile}`,
		]);
		expect(result.status).toBe(0);
		expect(readFileSync(outFile, 'utf8').trim().split('\n')).toEqual([
			'one',
			'two',
		]);
	});

	it('serializes two concurrent invocations — the second waits for the first', async () => {
		const outFile = join(lockDir, 'order.txt');
		const spawnAsync = (
			args: readonly string[],
		): Promise<{ status: number | null; stderr: string }> =>
			new Promise((resolvePromise) => {
				const child = spawn('bun', [SCRIPT, ...args], {
					env: {
						...process.env,
						DELENDAI_TEST_COMPUTE_LOCK_PATH: lockPath,
						DELENDAI_TEST_COMPUTE_WAIT_NOTICE_MS: '50',
					},
				});
				let stderr = '';
				child.stderr.on('data', (chunk: Buffer) => {
					stderr += chunk.toString('utf8');
				});
				child.on('exit', (status) =>
					resolvePromise({ status, stderr }),
				);
			});

		// The first invocation reports (in a file) that it holds the lock,
		// then keeps it past the waiter's notice threshold. Both are short
		// here: the threshold is set by the script's test-only variable.
		const heldFile = join(lockDir, 'held.txt');
		const first = spawnAsync([
			'first',
			'--',
			`echo held > ${heldFile} && sleep 0.6 && echo first >> ${outFile}`,
		]);
		// The second starts only once the first provably holds the lock, so
		// it cannot win the race for it.
		const deadline = Date.now() + 30_000;
		while (!existsSync(heldFile) && Date.now() < deadline) {
			await new Promise((r) => setTimeout(r, 10));
		}
		expect(existsSync(heldFile)).toBe(true);
		const second = spawnAsync([
			'second',
			'--',
			`echo second >> ${outFile}`,
		]);

		const [firstResult, secondResult] = await Promise.all([first, second]);
		expect(firstResult.status).toBe(0);
		expect(secondResult.status).toBe(0);
		// The second invocation must report that it waited — proof the lock
		// actually serialized it behind the first, not that it ran in parallel.
		expect(secondResult.stderr).toMatch(/is waiting/);
		expect(secondResult.stderr).toMatch(/got its turn/);

		const order = readFileSync(outFile, 'utf8').trim().split('\n');
		expect(order).toEqual(['first', 'second']);
	});
});
