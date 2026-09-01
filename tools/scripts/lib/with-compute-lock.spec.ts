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
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
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
				MCP_VERTEX_TEST_COMPUTE_LOCK_PATH: lockPath,
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
						MCP_VERTEX_TEST_COMPUTE_LOCK_PATH: lockPath,
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

		const first = spawnAsync([
			'first',
			'--',
			// The first invocation must hold the lock long enough for the
			// wrapper's 1s wait-notice threshold (line ~78 of the script) to
			// fire inside the second invocation. Under heavy CPU contention
			// (multiple parallel vitest workers / a peer agent), bun may take
			// 200-500ms just to spawn and reach `withFileMutex`, so 5s is
			// a comfortable margin that still completes well under the
			// test's own 10s timeout.
			`sleep 5 && echo first >> ${outFile}`,
		]);
		// Give the first invocation a head start so it reliably wins the
		// race for the lock before the second one starts. 250ms is enough
		// for `bun` to fork, exec, and reach `withFileMutex` even under load.
		await new Promise((r) => setTimeout(r, 250));
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
	}, 15_000);
});
