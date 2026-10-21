/**
 * account-prompts.service.spec.ts — the offer's questions: add it,
 * unattended work, and who a finding is with and how it is paid.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { accountPromptsOn } from './account-prompts.service';

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
		expect(asked[0]).toContain('14 more possible account(s)');
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

	it('stops at q given for the vendor too', async () => {
		const prompts = accountPromptsOn(prompt(['quit']).rl);
		expect(await prompts.classify(finding)).toBeUndefined();
		expect(prompts.stopped()).toBe(true);
	});
});
