/**
 * subscription.spec.ts — a task routed to a subscription runs on the host
 * it belongs to: in context in that host, through its CLI from any other,
 * and refused where its host has no CLI to start.
 */
import type { IRoutingDecision } from '@delendai/core/public';
import { fakePartial } from '@delendai/test-kit/public';
import { describe, expect, it } from 'vitest';

import type {
	IInvokeRequest,
	IKindInvoker,
} from '../../../../src/lib/invoke/types';
import { createSubscriptionInvoker } from '../../../../src/lib/subprocess/subscription';

const routed = (tool: string): IInvokeRequest => ({
	invocationId: 'inv',
	decision: fakePartial<IRoutingDecision>({ mode: 'implement' }),
	invoke: { kind: 'subscription', tool },
	prompt: 'fix it',
});

const recordingCli = () => {
	const started: IInvokeRequest[] = [];
	const cli: IKindInvoker = {
		start: (request) => {
			started.push(request);
			return {
				promise: Promise.resolve({ text: 'ran' }),
				cancel: () => undefined,
			};
		},
	};
	return { cli, started };
};

describe('createSubscriptionInvoker', () => {
	it('handles its own host in context, starting nothing', async () => {
		const { cli, started } = recordingCli();
		const result = await createSubscriptionInvoker({
			cli,
			currentHost: () => 'claude-code',
		}).start(routed('claude-code')).promise;
		expect(result.text).toMatch(/^Passthrough/u);
		expect(started).toEqual([]);
	});

	it('starts another host through its CLI', async () => {
		const { cli, started } = recordingCli();
		const result = await createSubscriptionInvoker({
			cli,
			currentHost: () => 'Visual Studio Code',
		}).start(routed('codex')).promise;
		expect(result.text).toBe('ran');
		expect(started[0]?.invoke).toEqual({
			kind: 'cli',
			command: 'codex',
			args: ['exec'],
		});
		expect(started[0]?.prompt).toBe('fix it');
	});

	it('refuses a host with no CLI when this server is not in it', async () => {
		const { cli } = recordingCli();
		await expect(
			createSubscriptionInvoker({
				cli,
				currentHost: () => 'claude-code',
			}).start(routed('vscode-copilot')).promise,
		).rejects.toThrow(/has no CLI to start from here/u);
	});

	it('keeps the passthrough for a host it does not know, and refuses another kind', async () => {
		const invoker = createSubscriptionInvoker();
		expect((await invoker.start(routed('some-ide')).promise).text).toMatch(
			/^Passthrough/u,
		);
		await expect(
			invoker.start({
				...routed('x'),
				invoke: { kind: 'cli', command: 'claude' },
			}).promise,
		).rejects.toThrow(/got a cli decision/u);
	});
});
