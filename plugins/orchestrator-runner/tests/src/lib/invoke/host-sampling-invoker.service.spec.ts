/**
 * host-sampling-invoker.service.spec.ts — a model the host serves on the person's key is
 * asked of the host, and every way the host can say no is a refusal,
 * never a quiet answer from another model.
 */
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { IRoutingDecision } from '@delendai/core/public';
import { fakePartial } from '@delendai/test-kit/public';
import { describe, expect, it } from 'vitest';

import type { IInvokeRequest } from '../../../../src/lib/invoke/types';
import { samplerOf } from '../../../../src/lib/services/host-sampler.service';
import {
	createHostSamplingInvoker,
	servedAsAsked,
	type IHostSampler,
} from '../../../../src/lib/invoke/host-sampling-invoker.service';

const request: IInvokeRequest = {
	invocationId: 'inv-1',
	decision: fakePartial<IRoutingDecision>({}),
	invoke: { kind: 'host-sampling', model: 'glm-5.3' },
	prompt: 'summarise the diff',
};

const answering =
	(model: string): IHostSampler =>
	async ({ prompt }) => ({
		model,
		text: `done: ${prompt}`,
		stopReason: 'endTurn',
	});

describe('createHostSamplingInvoker', () => {
	it('returns what the host answered with the model it was asked for', async () => {
		const result = await createHostSamplingInvoker({
			sampler: () => answering('customendpoint/glm-5.3'),
		}).start(request).promise;
		expect(result.text).toBe('done: summarise the diff');
		expect(result.structuredContent).toEqual({
			model: 'customendpoint/glm-5.3',
			stopReason: 'endTurn',
		});
	});

	it('refuses a reply from another model than the one asked for', async () => {
		await expect(
			createHostSamplingInvoker({
				sampler: () => answering('gpt-4.1'),
			}).start(request).promise,
		).rejects.toThrow(/host-substituted/u);
	});

	it('says so outside a host that samples, and refuses another kind', async () => {
		await expect(
			createHostSamplingInvoker({ sampler: () => undefined }).start(
				request,
			).promise,
		).rejects.toThrow(/host-unavailable/u);
		await expect(
			createHostSamplingInvoker({ sampler: () => answering('x') }).start({
				...request,
				invoke: { kind: 'cli', command: 'claude' },
			}).promise,
		).rejects.toThrow(/got a cli decision/u);
	});

	it('names the setting that allows a model when the host refuses', async () => {
		await expect(
			createHostSamplingInvoker({
				sampler: () => async () => {
					throw new Error('Sampling request denied');
				},
			}).start(request).promise,
		).rejects.toThrow(/host-refused.*chat\.mcp\.serverSampling/u);
	});

	it('aborts the request when cancelled', async () => {
		let aborted = false;
		const handle = createHostSamplingInvoker({
			sampler:
				() =>
				async ({ signal }) =>
					new Promise((_, reject) => {
						signal.addEventListener('abort', () => {
							aborted = true;
							reject(new Error('aborted'));
						});
					}),
		}).start(request);
		handle.cancel('user-cancel');
		await expect(handle.promise).rejects.toThrow('aborted');
		expect(aborted).toBe(true);
	});
});

describe('servedAsAsked', () => {
	it('accepts the host prefixing its vendor, and nothing else', () => {
		expect(servedAsAsked('glm-5.3', 'glm-5.3')).toBe(true);
		expect(servedAsAsked('glm-5.3', 'customendpoint/glm-5.3')).toBe(true);
		expect(servedAsAsked('minimax/m3', 'm3')).toBe(true);
		expect(servedAsAsked('glm-5.3', 'glm-5.3-flash')).toBe(false);
	});
});

describe('samplerOf', () => {
	const serverWith = (sampling: boolean, calls: unknown[] = []): McpServer =>
		fakePartial<McpServer>({
			server: fakePartial<McpServer['server']>({
				getClientCapabilities: () => (sampling ? { sampling: {} } : {}),
				createMessage: async (params: unknown) => {
					calls.push(params);
					return {
						role: 'assistant' as const,
						model: 'glm-5.3',
						content: { type: 'text' as const, text: 'ok' },
						stopReason: 'endTurn',
					};
				},
			}),
		});

	it('gives no sampler when the client does not offer sampling', () => {
		expect(samplerOf(serverWith(false))).toBeUndefined();
	});

	it('asks with the model as a hint and the prompt as the message', async () => {
		const calls: unknown[] = [];
		const sampler = samplerOf(serverWith(true, calls));
		const reply = await sampler?.({
			model: 'glm-5.3',
			prompt: 'hi',
			maxTokens: 10,
			signal: new AbortController().signal,
		});
		expect(reply).toEqual({
			model: 'glm-5.3',
			text: 'ok',
			stopReason: 'endTurn',
		});
		expect(calls[0]).toMatchObject({
			maxTokens: 10,
			modelPreferences: { hints: [{ name: 'glm-5.3' }] },
			messages: [{ role: 'user', content: { type: 'text', text: 'hi' } }],
		});
	});
});
