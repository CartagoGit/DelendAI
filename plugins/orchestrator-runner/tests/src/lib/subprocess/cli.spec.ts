import type { IRoutingDecision } from '@delendai/core/public';
import { fakePartial } from '@delendai/test-kit/public';
import { describe, expect, it, vi } from 'vitest';

import type { IInvokeRequest } from '../../../../src/lib/invoke/types';
import {
	createCliInvoker,
	type CliSpawner,
} from '../../../../src/lib/subprocess/cli';

const request: IInvokeRequest = {
	invocationId: 'inv-1',
	decision: fakePartial<IRoutingDecision>({}),
	invoke: { kind: 'cli', command: 'claude', args: ['-p'] },
	prompt: 'hello',
};

/** A spawner that records what it was asked to start and exits at once. */
const recording = () => {
	const spawned: { command: string; env: unknown }[] = [];
	const spawner: CliSpawner = (command, _args, env) => {
		spawned.push({ command, env });
		let exit: (code: number | null) => void = () => undefined;
		queueMicrotask(() => exit(0));
		return {
			on: (_event, listener) => {
				exit = listener;
			},
			onStdout: () => undefined,
			onStderr: () => undefined,
			kill: () => undefined,
		};
	};
	return { spawner, spawned };
};

describe('createCliInvoker — the account environment', () => {
	it('starts the process with only the environment the account is given', async () => {
		const { spawner, spawned } = recording();
		const invoker = createCliInvoker({
			workspaceRoot: '/work',
			spawner,
			environmentFor: () => ({
				kind: 'isolated',
				env: { PATH: '/usr/bin' },
			}),
		});
		await invoker.start(request).promise;
		expect(spawned).toEqual([
			{ command: 'claude', env: { PATH: '/usr/bin' } },
		]);
	});

	it('spawns nothing when the account is refused', async () => {
		const { spawner, spawned } = recording();
		const invoker = createCliInvoker({
			workspaceRoot: '/work',
			spawner,
			environmentFor: () => ({
				kind: 'refused',
				reason: 'not open to unattended work',
			}),
		});
		await expect(invoker.start(request).promise).rejects.toThrow(
			'not open to unattended work',
		);
		expect(spawned).toEqual([]);
	});

	it('keeps the inherited environment without an account seam', async () => {
		const { spawner, spawned } = recording();
		await createCliInvoker({ workspaceRoot: '/work', spawner }).start(
			request,
		).promise;
		expect(spawned).toEqual([{ command: 'claude', env: undefined }]);
	});
});

/** A child the spec drives: what it prints, how it ends, what killed it. */
const scripted = () => {
	const killed: string[] = [];
	let exit: (code: number | null) => void = () => undefined;
	let stdout: (chunk: string) => void = () => undefined;
	const spawner: CliSpawner = () => ({
		on: (_event, listener) => {
			exit = listener;
		},
		onStdout: (listener) => {
			stdout = listener;
		},
		onStderr: () => undefined,
		kill: (signal) => {
			killed.push(signal);
		},
	});
	return {
		spawner,
		killed,
		print: (chunk: string) => stdout(chunk),
		end: (code: number | null) => exit(code),
	};
};

describe('createCliInvoker — what a hop answers', () => {
	it('gathers streamed text and usage, a last line without a newline too', async () => {
		const child = scripted();
		const run = createCliInvoker({
			workspaceRoot: '/work',
			spawner: child.spawner,
		}).start(request);
		child.print('{"text":"he"}\n{"delta":{"text":"llo"}}\nnoise\n');
		child.print('{"usage":{"input_tokens":3,"output_tokens":"x"}}');
		child.end(0);
		expect(await run.promise).toEqual({
			text: 'hello',
			usage: { inputTokens: 3, outputTokens: 0, totalTokens: 3 },
		});
	});

	it('fails a non-zero exit, and an exit with no code (it never started)', async () => {
		const failed = scripted();
		const first = createCliInvoker({
			workspaceRoot: '/work',
			spawner: failed.spawner,
		}).start(request);
		failed.end(2);
		await expect(first.promise).rejects.toThrow('code 2');
		const missing = scripted();
		const second = createCliInvoker({
			workspaceRoot: '/work',
			spawner: missing.spawner,
		}).start(request);
		missing.end(null);
		await expect(second.promise).rejects.toThrow('without an exit code');
	});

	it('cancels with SIGTERM, then SIGKILL after the grace, once', async () => {
		const child = scripted();
		let fire: () => void = () => undefined;
		const run = createCliInvoker({
			workspaceRoot: '/work',
			spawner: child.spawner,
			sigkillGraceMs: 1,
			setTimer: (fn) => {
				fire = fn;
				return { clear: () => undefined };
			},
		}).start(request);
		run.cancel('user-cancel');
		run.cancel('user-cancel');
		fire();
		child.end(null);
		await expect(run.promise).rejects.toThrow('invocation-cancelled');
		expect(child.killed).toEqual(['SIGTERM', 'SIGKILL']);
	});

	it('escalates on the real timer when nothing is injected', async () => {
		const child = scripted();
		const run = createCliInvoker({
			workspaceRoot: '/work',
			spawner: child.spawner,
			sigkillGraceMs: 1,
		}).start(request);
		vi.useFakeTimers();
		try {
			run.cancel('timeout');
			vi.advanceTimersByTime(1);
		} finally {
			vi.useRealTimers();
		}
		child.end(null);
		await expect(run.promise).rejects.toThrow('invocation-cancelled');
		expect(child.killed).toEqual(['SIGTERM', 'SIGKILL']);
	});

	it('refuses a decision that is not a cli one', async () => {
		const { spawner, spawned } = recording();
		const run = createCliInvoker({ workspaceRoot: '/work', spawner }).start(
			{
				...request,
				invoke: {
					kind: 'mcp-server',
					server: 'srv',
					tool: 'run',
					args: {},
				},
			},
		);
		await expect(run.promise).rejects.toThrow('cli invoker got');
		run.cancel('user-cancel');
		expect(spawned).toEqual([]);
	});
});
