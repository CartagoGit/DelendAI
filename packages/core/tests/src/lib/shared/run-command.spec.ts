import { afterEach, describe, expect, it } from 'vitest';

import { runArgv, runCommand } from '../../../../src/lib/shared/run-command';

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

describe('runArgv stdin (x00169)', () => {
	// The default `stdio: ['ignore', ...]` closes stdin immediately — a
	// command shaped like `cat` (or `kubectl apply -f -`) reads EOF and
	// never sees anything the caller meant to pipe in.
	it('closes stdin when none is provided', async () => {
		const result = await runArgv(['cat']);
		expect(result.code).toBe(0);
		expect(result.stdout).toBe('');
	});

	it('pipes the given stdin to the child process', async () => {
		const result = await runArgv(['cat'], { stdin: 'hello from x00169' });
		expect(result.code).toBe(0);
		expect(result.stdout).toBe('hello from x00169');
	});

	it('pipes stdin through a real shell round-trip (wc -c)', async () => {
		const payload = 'apiVersion: v1\nkind: Pod\n';
		const result = await runArgv(['wc', '-c'], { stdin: payload });
		expect(result.code).toBe(0);
		expect(result.stdout.trim()).toBe(String(payload.length));
	});
});

describeUnixOnly('runCommand abort handling (x00239)', () => {
	it('aborts a shell command promptly and reaps its descendant tree', async () => {
		const controller = new AbortController();
		const leaderScript = [
			"const { spawn } = require('node:child_process');",
			"const child = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], { stdio: 'ignore' });",
			'process.stdout.write(String(child.pid));',
			'setInterval(() => {}, 1000);',
		].join(' ');
		const startedAt = Date.now();
		const pending = runCommand(
			`${process.execPath} -e ${JSON.stringify(leaderScript)}`,
			{
				cwd: process.cwd(),
				signal: controller.signal,
				maxOutputBytes: 64,
			},
		);
		setTimeout(() => {
			controller.abort();
		}, 100);
		const result = await pending;
		expect(Date.now() - startedAt).toBeLessThan(3000);
		expect(result.code).toBe(130);
		expect(result.aborted).toBe(true);
		expect(result.timedOut).toBe(false);
		const descendantPid = Number.parseInt(result.output.trim(), 10);
		expect(Number.isFinite(descendantPid)).toBe(true);
		trackedPids.add(descendantPid);
		expect(await waitForPidExit(descendantPid)).toBe(true);
		trackedPids.delete(descendantPid);
	});
});
