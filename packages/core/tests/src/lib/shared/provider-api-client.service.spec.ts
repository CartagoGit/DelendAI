/**
 * provider-api-client.service.spec.ts — a catalogue provider called
 * through its API family, with the key read from its variable.
 */
import { describe, expect, it } from 'vitest';

import type { ICatalogueProvider } from '../../../../src/lib/contracts/interfaces/account-finding.interface';
import type { IProviderHttp } from '../../../../src/lib/contracts/interfaces/provider-api.interface';
import {
	isReachable,
	listProviderModels,
	promptProvider,
	providerEndpoint,
} from '../../../../src/lib/shared/provider-api-client.service';

const zai: ICatalogueProvider = {
	id: 'zai',
	name: 'Z.AI',
	env: ['ZHIPU_API_KEY', 'ZAI_API_KEY'],
	models: ['glm-5'],
	api: 'https://api.z.test/v4/',
	npm: '@ai-sdk/openai-compatible',
};
const anthropic: ICatalogueProvider = {
	id: 'anthropic',
	name: 'Anthropic',
	env: ['ANTHROPIC_API_KEY'],
	models: [],
	npm: '@ai-sdk/anthropic',
};

const recording = (answer: { status: number; json: unknown }) => {
	const calls: {
		url: string;
		headers: Readonly<Record<string, string>>;
		body?: string | undefined;
	}[] = [];
	const http: IProviderHttp = async (url, init) => {
		calls.push({ url, headers: init.headers, body: init.body });
		return answer;
	};
	return { calls, http };
};

describe('providerEndpoint', () => {
	it('calls the catalogue URL through its family, with the first key that is set', () => {
		expect(providerEndpoint(zai, { ZAI_API_KEY: 'k' })).toEqual({
			providerId: 'zai',
			family: 'openai',
			baseUrl: 'https://api.z.test/v4',
			keyVariable: 'ZAI_API_KEY',
		});
		expect(
			providerEndpoint(anthropic, { ANTHROPIC_API_KEY: 'k' }),
		).toMatchObject({
			family: 'anthropic',
			baseUrl: 'https://api.anthropic.com/v1',
		});
	});

	it('says why a provider cannot be called', () => {
		const missing = providerEndpoint(zai, { ZHIPU_API_KEY: ' ' });
		expect(isReachable(missing)).toBe(false);
		expect(missing).toEqual({
			reason: 'no-key',
			variables: ['ZHIPU_API_KEY', 'ZAI_API_KEY'],
		});
		expect(
			providerEndpoint(
				{ ...zai, npm: '@ai-sdk/google' },
				{ ZAI_API_KEY: 'k' },
			),
		).toEqual({
			reason: 'unsupported-family',
			npm: '@ai-sdk/google',
		});
	});
});

describe('calling a provider', () => {
	const endpoint = providerEndpoint(zai, { ZAI_API_KEY: 'k' });
	const claude = providerEndpoint(anthropic, { ANTHROPIC_API_KEY: 'k' });
	if (!isReachable(endpoint) || !isReachable(claude))
		throw new Error('unreachable');

	it('lists models through the OpenAI-compatible API', async () => {
		const { calls, http } = recording({
			status: 200,
			json: { data: [{ id: 'glm-5' }, { x: 1 }] },
		});
		expect(
			await listProviderModels(endpoint, {
				env: { ZAI_API_KEY: 'k' },
				http,
			}),
		).toEqual(['glm-5']);
		expect(calls[0]?.url).toBe('https://api.z.test/v4/models');
		expect(calls[0]?.headers.authorization).toBe('Bearer k');
	});

	it('prompts the OpenAI-compatible API and reports usage', async () => {
		const { calls, http } = recording({
			status: 200,
			json: {
				choices: [{ message: { content: 'hola' } }],
				usage: { prompt_tokens: 3, completion_tokens: 2 },
			},
		});
		expect(
			await promptProvider(endpoint, {
				model: 'glm-5',
				prompt: 'hi',
				env: { ZAI_API_KEY: 'k' },
				http,
			}),
		).toEqual({ text: 'hola', usage: { inputTokens: 3, outputTokens: 2 } });
		expect(calls[0]?.url).toBe('https://api.z.test/v4/chat/completions');
		expect(JSON.parse(calls[0]?.body ?? '{}')).toMatchObject({
			model: 'glm-5',
			max_tokens: 1024,
		});
	});

	it('prompts the Anthropic API with its own headers and shape', async () => {
		const { calls, http } = recording({
			status: 200,
			json: {
				content: [{ type: 'text', text: 'hi' }, { type: 'tool_use' }],
				usage: { input_tokens: 4, output_tokens: 1 },
			},
		});
		expect(
			await promptProvider(claude, {
				model: 'm',
				prompt: 'x',
				env: { ANTHROPIC_API_KEY: 'k' },
				http,
			}),
		).toEqual({ text: 'hi', usage: { inputTokens: 4, outputTokens: 1 } });
		expect(calls[0]?.url).toBe('https://api.anthropic.com/v1/messages');
		expect(calls[0]?.headers['x-api-key']).toBe('k');
		expect(calls[0]?.headers['anthropic-version']).toBeDefined();
	});

	it('reports the provider refusal, and a key that is gone at call time', async () => {
		const { http } = recording({
			status: 401,
			json: { error: { message: 'bad key' } },
		});
		await expect(
			promptProvider(endpoint, {
				model: 'glm-5',
				prompt: 'x',
				env: { ZAI_API_KEY: 'k' },
				http,
			}),
		).rejects.toThrow('401: bad key');
		await expect(
			listProviderModels(endpoint, { env: {}, http }),
		).rejects.toThrow('ZAI_API_KEY is not set');
	});
});
