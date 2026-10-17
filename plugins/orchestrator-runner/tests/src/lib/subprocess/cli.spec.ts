import type { IRoutingDecision } from '@delendai/core/public';
import { describe, expect, it } from 'vitest';

import type { IInvokeRequest } from '../../../../src/lib/invoke/types';
import {
	createCliInvoker,
	type CliSpawner,
} from '../../../../src/lib/subprocess/cli';

const request = {
	invocationId: 'inv-1',
	decision: {
		targetProvider: { id: 'claude-work', accountId: 'claude-work' },
	} as unknown as IRoutingDecision,
	invoke: { kind: 'cli', command: 'claude', args: ['-p'] },
	prompt: 'hello',
} as IInvokeRequest;

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
		await createCliInvoker({ spawner }).start(request).promise;
		expect(spawned).toEqual([{ command: 'claude', env: undefined }]);
	});
});
