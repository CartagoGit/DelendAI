/**
 * account-prompts.service.spec.ts — the offer's questions: add it,
 * unattended work, and who a finding is with and how it is paid.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { OFFER_MESSAGES } from '../../contracts/constants/offer-messages.constant';
import { accountPromptsOn, askLanguage } from './account-prompts.service';

const written = (): string =>
	vi
		.mocked(process.stderr.write)
		.mock.calls.map(([text]) => String(text))
		.join('');

const prompt = (replies: string[]) => {
	const asked: string[] = [];
	return {
		asked,
		rl: {
			question: (query: string, answer: (text: string) => void) => {
				asked.push(query);
				answer(replies.shift() ?? '');
			},
		},
	};
};

const finding = {
	key: 'seen-models:qwen',
	source: 'seen-models' as const,
	accountId: 'qwen-seen',
	displayName: 'qwen models your chats were served by',
	vendorHint: 'qwen',
	models: ['qwen3.8-max'],
	evidence: 'seen serving chats here: qwen3.8-max',
};

beforeEach(() => {
	vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
});
afterEach(() => {
	vi.restoreAllMocks();
});

describe('accountPromptsOn', () => {
	it('classifies a finding from the vendor named and how it is paid', async () => {
		const { rl, asked } = prompt(['', '3']);
		expect(await accountPromptsOn(rl).classify(finding)).toEqual({
			vendor: 'qwen',
			credentialMode: 'byok-api-key',
			billingMode: 'pay-as-you-go',
		});
		expect(asked[0]).toContain('Who bills you for it?');
		expect(asked[1]).toContain('How do you pay');
	});

	it('leaves a finding the person skips, by name or by choice', async () => {
		expect(
			await accountPromptsOn(prompt(['skip']).rl).classify(finding),
		).toBe(undefined);
		expect(
			await accountPromptsOn(prompt(['Alibaba', '5']).rl).classify(
				finding,
			),
		).toBe(undefined);
	});

	it('asks before going through many findings, and about each offer and its automation', async () => {
		const { rl, asked } = prompt(['n', 'y', 'n']);
		const prompts = accountPromptsOn(rl);
		expect(await prompts.beforeClassifying(14)).toBe(false);
		expect(written()).toContain('14 more found');
		expect(asked[0]).toContain('two short questions');
		const offer = {
			accountId: 'qwen-seen',
			vendor: 'qwen',
			credentialMode: 'byok-api-key' as const,
			billingMode: 'pay-as-you-go' as const,
			quotaGroups: ['qwen-seen'],
			permittedAutomation: false,
		};
		expect(await prompts.ask(offer)).toBe(true);
		expect(await prompts.askAutomation(offer)).toBe(false);
	});

	it('stops every later question at q, and says so', async () => {
		const { rl, asked } = prompt(['q']);
		const prompts = accountPromptsOn(rl);
		const offer = {
			accountId: 'qwen-seen',
			vendor: 'qwen',
			credentialMode: 'byok-api-key' as const,
			billingMode: 'pay-as-you-go' as const,
			quotaGroups: ['qwen-seen'],
			permittedAutomation: false,
		};
		expect(await prompts.beforeClassifying(3)).toBe(false);
		expect(prompts.stopped()).toBe(true);
		expect(await prompts.ask(offer)).toBeUndefined();
		expect(await prompts.askAutomation(offer)).toBe(false);
		expect(await prompts.classify(finding)).toBeUndefined();
		expect(asked).toHaveLength(1);
		expect(asked[0]).toContain('q to stop');
	});

	it('shows each offer as a numbered card with what it is and where it was seen', async () => {
		const prompts = accountPromptsOn(
			prompt(['y']).rl,
			() => undefined,
			OFFER_MESSAGES.en,
			100,
		);
		const login = {
			...finding,
			key: 'client-login:claude',
			source: 'client-login' as const,
			accountId: 'anthropic-claude',
			subject: 'Claude Code (CLI)',
			models: ['a', 'b', 'c', 'd', 'e', 'f'],
			evidence: 'authMethod claude.ai',
		};
		const offer = {
			accountId: 'anthropic-claude',
			vendor: 'anthropic',
			credentialMode: 'official-subscription-login' as const,
			billingMode: 'subscription-included' as const,
			quotaGroups: ['anthropic-claude'],
			permittedAutomation: false,
		};
		expect(
			await prompts.ask(offer, { index: 1, total: 3, finding: login }),
		).toBe(true);
		const text = written();
		expect(text).toContain('3 account(s) ready to add');
		expect(text).toContain('1/3');
		expect(text).toContain('AI client logged in here');
		expect(text).toContain('Claude Code (CLI)');
		expect(text).toContain(
			'logged in with a subscription · included in the subscription',
		);
		expect(text).toContain('Models: a, b, c, d and 2 more');
		expect(text).not.toContain('authMethod');
		expect(text).toContain('Account id: anthropic-claude');
	});

	it('titles an offer with no finding by its name', async () => {
		const prompts = accountPromptsOn(prompt(['n']).rl);
		expect(
			await prompts.ask({
				accountId: 'x-plan',
				vendor: 'x',
				displayName: 'X plan',
				credentialMode: 'provider-plan-token',
				billingMode: 'prepaid-token-plan',
				quotaGroups: ['x-plan'],
				permittedAutomation: false,
			}),
		).toBe(false);
		expect(written()).toContain('X plan');
	});

	it('asks in Spanish and takes Spanish answers', async () => {
		const { rl, asked } = prompt(['', '2', 's']);
		const prompts = accountPromptsOn(
			rl,
			() => undefined,
			OFFER_MESSAGES.es,
		);
		const key = {
			...finding,
			key: 'credential-variable:DASHSCOPE_API_KEY',
			source: 'credential-variable' as const,
			subject: 'Alibaba',
			credentialEnv: 'DASHSCOPE_API_KEY',
			vendorHint: 'alibaba',
			models: [],
		};
		expect(await prompts.classify(key, { index: 2, total: 5 })).toEqual({
			vendor: 'alibaba',
			credentialMode: 'provider-plan-token',
			billingMode: 'prepaid-token-plan',
		});
		expect(written()).toContain('Alibaba, clave en DASHSCOPE_API_KEY');
		expect(asked[0]).toContain('te la cobra');
		expect(
			await prompts.ask({
				accountId: 'alibaba-key',
				vendor: 'alibaba',
				credentialMode: 'byok-api-key',
				billingMode: 'pay-as-you-go',
				quotaGroups: ['alibaba-key'],
				permittedAutomation: false,
			}),
		).toBe(true);
		expect(asked[2]).toContain('(s/n, q para parar) [n]');
	});

	it('leaves a finding skipped in Spanish', async () => {
		const prompts = accountPromptsOn(
			prompt(['saltar']).rl,
			() => undefined,
			OFFER_MESSAGES.es,
		);
		expect(await prompts.classify(finding)).toBeUndefined();
		expect(prompts.stopped()).toBe(false);
	});

	it('asks which language to speak, in every language it speaks', async () => {
		const { rl, asked } = prompt(['2']);
		expect(await askLanguage(rl)).toBe('es');
		expect(asked[0]).toContain('Language / Idioma');
		expect(written()).toContain(OFFER_MESSAGES.es.languageQuestion);
	});

	it('stops at q given for the vendor too', async () => {
		const prompts = accountPromptsOn(prompt(['quit']).rl);
		expect(await prompts.classify(finding)).toBeUndefined();
		expect(prompts.stopped()).toBe(true);
	});
});
