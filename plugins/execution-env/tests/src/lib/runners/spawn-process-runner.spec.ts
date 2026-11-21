import { describe, expect, it } from 'vitest';

import { createSpawnProcessRunner } from '../../../../src/lib/runners/spawn-process-runner.service';

describe('createSpawnProcessRunner', () => {
	it('passes each argument through as one argument, never as shell syntax', async () => {
		const runner = createSpawnProcessRunner(false);
		const result = await runner.run([
			process.execPath,
			'-e',
			'process.stdout.write(process.argv[1])',
			'--',
			'a; echo injected',
		]);
		expect(result.exitCode).toBe(0);
		expect(result.stdout).toBe('a; echo injected');
	});

	it('reports a missing binary as exit 127 instead of throwing', async () => {
		const runner = createSpawnProcessRunner(false);
		const result = await runner.run(['definitely-not-a-binary-xyz']);
		expect(result.exitCode).toBe(127);
		expect(result.stderr.length).toBeGreaterThan(0);
	});

	it('feeds stdin and captures the exit code', async () => {
		const runner = createSpawnProcessRunner(false);
		const result = await runner.run(
			[
				process.execPath,
				'-e',
				'process.stdin.on("data", (d) => { process.stdout.write(String(d)); process.exit(3); })',
			],
			{ stdin: 'hello' },
		);
		expect(result).toEqual({ exitCode: 3, stdout: 'hello', stderr: '' });
	});

	it('cuts a run off at its timeout', async () => {
		const runner = createSpawnProcessRunner(false);
		const result = await runner.run(
			[process.execPath, '-e', 'setTimeout(() => undefined, 10000)'],
			{ timeoutMs: 100 },
		);
		expect(result.exitCode).toBe(124);
	});

	it('refuses to start anything in a dry run', async () => {
		const runner = createSpawnProcessRunner(true);
		await expect(runner.run([process.execPath, '-v'])).rejects.toThrow(
			'dryRun is true',
		);
	});
});
