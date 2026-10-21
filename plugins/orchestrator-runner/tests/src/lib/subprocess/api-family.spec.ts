/**
 * api-family.spec.ts — an api roster entry for a catalogue provider is
 * spoken to in its family's chat shape, and its usage comes back.
 */
import { describe, expect, it } from 'vitest';

import { fakePartial } from '@delendai/test-kit';

import { createApiInvoker } from '../../../../src/lib/subprocess/api';
import type { IInvokeRequest } from '../../../../src/lib/invoke/types';

const call = async (
	family: 'openai' | 'anthropic',
	answer: unknown,
): Promise<{
	url: string;
	headers: Record<string, string>;
	body: string;
	result: unknown;
}> => {
	const seen = { url: '', headers: {} as Record<string, string>, body: '' };
	const invoker = createApiInvoker({
		fetchFn: async (url, init) => {
			seen.url = url;
			seen.headers = { ...(init.headers as Record<string, string>) };
			seen.body = init.body ?? '';
			return {
				ok: true,
				status: 200,
				headers: { get: () => null },
				text: async () => JSON.stringify(answer),
			};
		},
		readEnv: () => 'k',
	});
	const invoke = {
		kind: 'api' as const,
		url: 'https://api.z.test/v4/',
		envVar: 'ZAI_API_KEY',
		family,
	};
	const request: IInvokeRequest = {
		invocationId: 'i',
		decision: fakePartial<IInvokeRequest['decision']>({
			targetProvider: fakePartial<
				IInvokeRequest['decision']['targetProvider']
			>({ id: 'zai-glm', modelId: 'glm-5' }),
		}),
		invoke,
		prompt: 'hi',
	};
	const result = await invoker.start(request).promise;
	return { ...seen, result };
};

describe('api hops on a catalogue provider', () => {
	it('sends an OpenAI-compatible chat for the entry model and reads its usage', async () => {
		const out = await call('openai', {
			choices: [{ message: { content: 'hola' } }],
			usage: { prompt_tokens: 2, completion_tokens: 1 },
		});
		expect(out.url).toBe('https://api.z.test/v4/chat/completions');
		expect(out.headers.authorization).toBe('Bearer k');
		expect(JSON.parse(out.body)).toMatchObject({
			model: 'glm-5',
			messages: [{ role: 'user', content: 'hi' }],
		});
		expect(out.result).toEqual({
			text: 'hola',
			usage: { inputTokens: 2, outputTokens: 1, totalTokens: 3 },
		});
	});

	it('sends an Anthropic messages call with its own headers', async () => {
		const out = await call('anthropic', {
			content: [{ type: 'text', text: 'hi' }],
		});
		expect(out.url).toBe('https://api.z.test/v4/messages');
		expect(out.headers['x-api-key']).toBe('k');
		expect(out.result).toEqual({ text: 'hi' });
	});
});
