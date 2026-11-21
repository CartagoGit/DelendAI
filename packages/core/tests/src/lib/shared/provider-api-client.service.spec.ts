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
		// Vertex signs in through Google Cloud, not with a key.
		expect(
			providerEndpoint(
				{ ...zai, npm: '@ai-sdk/google-vertex' },
				{ ZAI_API_KEY: 'k' },
			),
		).toEqual({
			reason: 'unsupported-family',
			npm: '@ai-sdk/google-vertex',
		});
	});
});

describe('the Google family', () => {
	const google: ICatalogueProvider = {
		id: 'google',
		name: 'Google',
		env: ['GOOGLE_GENERATIVE_AI_API_KEY', 'GEMINI_API_KEY'],
		models: ['gemini-2.5-pro'],
		npm: '@ai-sdk/google',
	};
	const endpoint = () => {
		const reached = providerEndpoint(google, { GEMINI_API_KEY: 'g' });
		if (!isReachable(reached)) throw new Error('google is unreachable');
		return reached;
	};

	it('reaches a provider whose npm is @ai-sdk/google at its default API', () => {
		expect(endpoint()).toEqual({
			providerId: 'google',
			family: 'google',
			baseUrl: 'https://generativelanguage.googleapis.com/v1beta',
			keyVariable: 'GEMINI_API_KEY',
		});
	});

	it('lists its models with the key in its own header', async () => {
		const { calls, http } = recording({
			status: 200,
			json: {
				models: [{ name: 'models/gemini-2.5-pro' }, { name: 'x' }],
			},
		});
		expect(
			await listProviderModels(endpoint(), {
				env: { GEMINI_API_KEY: 'g' },
				http,
			}),
		).toEqual(['gemini-2.5-pro', 'x']);
		expect(calls[0]?.url).toBe(
			'https://generativelanguage.googleapis.com/v1beta/models',
		);
		expect(calls[0]?.headers['x-goog-api-key']).toBe('g');
		expect(calls[0]?.headers.authorization).toBeUndefined();
	});

	it('prompts generateContent and reads the candidate and its usage', async () => {
		const { calls, http } = recording({
			status: 200,
			json: {
				candidates: [
					{ content: { parts: [{ text: 'hel' }, { text: 'lo' }] } },
				],
				usageMetadata: { promptTokenCount: 4, candidatesTokenCount: 2 },
			},
		});
		const answer = await promptProvider(endpoint(), {
			model: 'gemini-2.5-pro',
			prompt: 'hi',
			maxTokens: 8,
			env: { GEMINI_API_KEY: 'g' },
			http,
		});
		expect(answer).toEqual({
			text: 'hello',
			usage: { inputTokens: 4, outputTokens: 2 },
		});
		expect(calls[0]?.url).toBe(
			'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-pro:generateContent',
		);
		expect(JSON.parse(calls[0]?.body ?? '{}')).toEqual({
			contents: [{ role: 'user', parts: [{ text: 'hi' }] }],
			generationConfig: { maxOutputTokens: 8 },
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
