import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { runArgv } from '../../../../src/lib/shared/run-command';

const describeUnixOnly =
	process.platform === 'win32' ? describe.skip : describe;
const trackedPids = new Set<number>();

const isPidAlive = (pid: number): boolean => {
	try {
		process.kill(pid, 0);
		return true;
	} catch (error) {
		return (error as NodeJS.ErrnoException).code !== 'ESRCH';
	}
};

const waitForPidExit = async (pid: number): Promise<boolean> => {
	for (let attempt = 0; attempt < 20; attempt += 1) {
		if (!isPidAlive(pid)) return true;
		await new Promise((resolve) => setTimeout(resolve, 25));
	}
	return !isPidAlive(pid);
};

afterEach(() => {
	for (const pid of trackedPids) {
		try {
			process.kill(pid, 'SIGKILL');
		} catch {
			// best-effort cleanup for a failed assertion path
		}
	}
	trackedPids.clear();
});

describe('runArgv timeout handling (x00222)', () => {
	it('keeps the non-timeout path working with argv-first spawn', async () => {
		const result = await runArgv([
			process.execPath,
			'-e',
			"process.stdout.write('ok from x00222');",
		]);
		expect(result.code).toBe(0);
		expect(result.timedOut).toBe(false);
		expect(result.stdout).toBe('ok from x00222');
		expect(result.stderr).toBe('');
	});
});

describeUnixOnly(
	'runArgv kills the whole process tree on timeout (x00222)',
	() => {
		// Windows uses taskkill, but this assertion probes Unix pid liveness directly.
		it('reaps a long-lived descendant, not only the direct child', async () => {
			const script = [
				"const { spawn } = require('node:child_process');",
				"const child = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], { stdio: 'ignore' });",
				'process.stdout.write(String(child.pid));',
				'setInterval(() => {}, 1000);',
			].join('');
			const result = await runArgv([process.execPath, '-e', script], {
				timeoutMs: 150,
				maxOutputBytes: 64,
			});
			expect(result.code).toBe(124);
			expect(result.timedOut).toBe(true);
			const descendantPid = Number.parseInt(result.stdout.trim(), 10);
			expect(Number.isFinite(descendantPid)).toBe(true);
			trackedPids.add(descendantPid);
			expect(await waitForPidExit(descendantPid)).toBe(true);
			trackedPids.delete(descendantPid);
		});
	},
);

describeUnixOnly('runArgv abort handling (x00222)', () => {
	it('aborts promptly and reaps a long-lived descendant', async () => {
		const controller = new AbortController();
		// The leader announces its descendant's pid through a file, because
		// the test has to KNOW the descendant exists before it aborts.
		// Aborting on a fixed 100ms wall clock raced the spawn on a loaded
		// machine: the process was cancelled before the pid was emitted and
		// the spec failed on NaN while the reaping under test was fine.
		const dir = mkdtempSync(join(tmpdir(), 'process-tree-kill-'));
		const pidFile = join(dir, 'descendant-pid.txt');
		const script = [
			"const { spawn } = require('node:child_process');",
			"const { writeFileSync } = require('node:fs');",
			"const child = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], { stdio: 'ignore' });",
			`writeFileSync(${JSON.stringify(pidFile)}, String(child.pid));`,
			'process.stdout.write(String(child.pid));',
			'setInterval(() => {}, 1000);',
		].join('');
		const pending = runArgv([process.execPath, '-e', script], {
			signal: controller.signal,
			maxOutputBytes: 64,
		});
		try {
			let descendantPid = Number.NaN;
			for (let attempt = 0; attempt < 400; attempt += 1) {
				if (existsSync(pidFile)) {
					descendantPid = Number.parseInt(
						readFileSync(pidFile, 'utf8').trim(),
						10,
					);
					if (Number.isFinite(descendantPid)) break;
				}
				await new Promise((resolve) => setTimeout(resolve, 25));
			}
			expect(Number.isFinite(descendantPid)).toBe(true);
			trackedPids.add(descendantPid);
			// Promptness is measured from the abort — that is the contract.
			const abortedAt = Date.now();
			controller.abort();
			const result = await pending;
			expect(Date.now() - abortedAt).toBeLessThan(3000);
			expect(result.code).toBe(130);
			expect(result.aborted).toBe(true);
			expect(result.timedOut).toBe(false);
			expect(await waitForPidExit(descendantPid)).toBe(true);
			trackedPids.delete(descendantPid);
		} finally {
			rmSync(dir, { recursive: true, force: true });
		}
	});
});
