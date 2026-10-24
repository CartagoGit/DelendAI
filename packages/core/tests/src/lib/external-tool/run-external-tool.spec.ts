import { describe, expect, it, vi } from 'vitest';

import {
	makeRedactor,
	runExternalTool,
} from '../../../../src/lib/external-tool/run-external-tool';
import type {
	IArgvExec,
	IExternalTool,
} from '../../../../src/lib/contracts/interfaces/external-tool.interface';

const tool: IExternalTool = { id: 'demo', bin: 'demo' };

const fakeExec = (outcome: {
	code: number;
	stdout?: string;
	stderr?: string;
	timedOut?: boolean;
}): IArgvExec =>
	(async () => ({
		code: outcome.code,
		stdout: outcome.stdout ?? '',
		stderr: outcome.stderr ?? '',
		timedOut: outcome.timedOut ?? false,
	})) as IArgvExec;

describe('runExternalTool', () => {
	it('maps exit 0 to ok', async () => {
		const run = await runExternalTool(
			{ tool, args: ['scan'] },
			fakeExec({ code: 0, stdout: 'clean' }),
		);
		expect(run.ok).toBe(true);
		expect(run.unavailable).toBe(false);
		expect(run.stdout).toBe('clean');
	});

	it('flags a missing binary (exit 127) as unavailable', async () => {
		const run = await runExternalTool(
			{ tool, args: [] },
			fakeExec({ code: 127 }),
		);
		expect(run.ok).toBe(false);
		expect(run.unavailable).toBe(true);
	});

	it('passes through timedOut', async () => {
		const run = await runExternalTool(
			{ tool, args: [] },
			fakeExec({ code: 124, timedOut: true }),
		);
		expect(run.timedOut).toBe(true);
	});

	it('spawns bin + args as literal argv (no shell)', async () => {
		const exec = vi.fn(fakeExec({ code: 0 }));
		await runExternalTool({ tool, args: ['a', 'b c'] }, exec);
		expect(exec).toHaveBeenCalledWith(
			['demo', 'a', 'b c'],
			expect.objectContaining({ timeoutMs: 60_000 }),
		);
	});

	it('forwards the combined and per-stream byte budgets', async () => {
		const exec = vi.fn(fakeExec({ code: 0 }));
		await runExternalTool(
			{
				tool,
				args: ['scan'],
				maxOutputBytes: 512,
				maxStdoutBytes: 128,
				maxStderrBytes: 64,
			},
			exec,
		);
		expect(exec).toHaveBeenCalledWith(
			['demo', 'scan'],
			expect.objectContaining({
				maxOutputBytes: 512,
				maxStdoutBytes: 128,
				maxStderrBytes: 64,
			}),
		);
	});

	// x00169: `IRunExternalToolInput.stdin` used to not exist at all — a
	// tool shaped like `kubectl apply -f -` had no way to hand the
	// manifest to the child process's stdin.
	it('forwards stdin to the exec options', async () => {
		const exec = vi.fn(fakeExec({ code: 0 }));
		await runExternalTool(
			{ tool, args: ['apply', '-f', '-'], stdin: 'kind: Pod\n' },
			exec,
		);
		expect(exec).toHaveBeenCalledWith(
			['demo', 'apply', '-f', '-'],
			expect.objectContaining({ stdin: 'kind: Pod\n' }),
		);
	});

	it('omits stdin from the exec options when not provided', async () => {
		const exec = vi.fn(fakeExec({ code: 0 }));
		await runExternalTool({ tool, args: ['scan'] }, exec);
		const options = exec.mock.calls[0]?.[1];
		expect(options).not.toHaveProperty('stdin');
		expect(options).not.toHaveProperty('maxStdoutBytes');
		expect(options).not.toHaveProperty('maxStderrBytes');
	});

	it('redacts literal and regex patterns from output', async () => {
		const run = await runExternalTool(
			{
				tool,
				args: [],
				redact: ['sk-secret', /token=[a-z0-9]+/],
			},
			fakeExec({ code: 0, stdout: 'key sk-secret token=abc123 end' }),
		);
		expect(run.stdout).toBe('key *** *** end');
	});
});

describe('makeRedactor', () => {
	it('is the identity function when no patterns are given', () => {
		expect(makeRedactor(undefined)('unchanged')).toBe('unchanged');
		expect(makeRedactor([])('unchanged')).toBe('unchanged');
	});

	it('replaces every occurrence of a literal', () => {
		expect(makeRedactor(['x'])('xax x')).toBe('***a*** ***');
	});
});
