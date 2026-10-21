/**
 * account-sources.service.spec.ts — every source of accounts, fed what
 * the owner's machine showed on 2026-10-21, and none by vendor.
 */
import { describe, expect, it } from 'vitest';

import { KNOWN_CLIENTS } from '../../../../src/lib/contracts/constants/known-clients.constant';
import type { IClientCommandRunner } from '../../../../src/lib/contracts/interfaces/known-client.interface';
import {
	brandOf,
	findingsFromClientProviders,
	findingsFromCredentialVariables,
	findingsFromLocalEndpoints,
	findingsFromPlanTools,
	findingsFromSeenModels,
	gatherFindings,
} from '../../../../src/lib/shared/account-sources.service';

const opencode = KNOWN_CLIENTS.find((client) => client.command === 'opencode');
if (opencode === undefined) throw new Error('no opencode client');

const answering =
	(answers: Record<string, string>): IClientCommandRunner =>
	async (command) =>
		answers[command] === undefined
			? { code: 1, output: '' }
			: { code: 0, output: answers[command] ?? '' };

describe('the sources', () => {
	it('reads each provider a multi-provider client reaches', async () => {
		const found = await findingsFromClientProviders(
			[
				{
					client: opencode,
					installed: true,
					path: '/bin/opencode',
					version: '1',
					verdict: 'usable',
					evidence: null,
				},
			],
			answering({
				[[opencode.command, ...(opencode.modelListArgs ?? [])].join(
					' ',
				)]:
					'minimax/MiniMax-M3\nminimax-coding-plan/MiniMax-M3\nminimax-coding-plan/MiniMax-M3.1\nnot a model line',
			}),
			'/ws',
		);
		expect(
			found.map((each) => [
				each.accountId,
				each.vendorHint,
				each.models.length,
			]),
		).toEqual([
			['minimax-via-opencode', 'minimax', 1],
			['minimax-coding-plan-via-opencode', 'minimax', 2],
		]);
		expect(found.every((each) => each.classification === undefined)).toBe(
			true,
		);
	});

	it('names credential variables without reading them, whatever the vendor', () => {
		const found = findingsFromCredentialVariables({
			MINIMAX_API_KEY: 'secret-value',
			XIAOMI_MIMO_API_TOKEN: 'secret-value',
			EMPTY_API_KEY: '',
			PATH: '/bin',
			GITHUB_SHA: 'abc',
		});
		expect(
			found.map((each) => [each.credentialEnv, each.vendorHint]),
		).toEqual([
			['MINIMAX_API_KEY', 'minimax'],
			['XIAOMI_MIMO_API_TOKEN', 'xiaomi-mimo'],
		]);
		expect(JSON.stringify(found)).not.toContain('secret-value');
	});

	it('groups the models chats were served by under the maker their id names', () => {
		const found = findingsFromSeenModels([
			'qwen3.8-max',
			'qwen3.8-flash',
			'glm-5.3',
			'llama-5-70b',
		]);
		expect(found.map((each) => [each.vendorHint, each.models])).toEqual([
			['qwen', ['qwen3.8-max', 'qwen3.8-flash']],
			['glm', ['glm-5.3']],
			['llama', ['llama-5-70b']],
		]);
		expect(brandOf('Phi-5-mini')).toBe('phi');
	});

	it('reads a plan tool login from its own answer', async () => {
		const found = await findingsFromPlanTools(
			answering({ 'mmx auth status': '{ "method": "oauth" }' }),
			'/ws',
		);
		expect(found[0]).toMatchObject({
			accountId: 'minimax-plan',
			classification: {
				vendor: 'minimax',
				credentialMode: 'official-subscription-login',
				billingMode: 'subscription-included',
			},
		});
		expect(await findingsFromPlanTools(answering({}), '/ws')).toEqual([]);
	});

	it('lists the models a local server answers, and skips one that is not there', async () => {
		const found = await findingsFromLocalEndpoints(async (url) =>
			url.includes(':11434/')
				? {
						ok: true,
						json: { data: [{ id: 'llama-5:8b' }, { nope: 1 }] },
					}
				: undefined,
		);
		expect(found).toEqual([
			expect.objectContaining({
				accountId: 'ollama-local',
				models: ['llama-5:8b'],
				classification: {
					vendor: 'ollama',
					credentialMode: 'local-none',
					billingMode: 'local',
				},
			}),
		]);
	});

	it('gathers every source in order, without reading the local network unless asked', async () => {
		const found = await gatherFindings({
			discoveries: [],
			run: answering({}),
			cwd: '/ws',
			env: { DEEPSEEK_API_KEY: 'x' },
			seen: ['gemini-3.8-flash'],
			planTools: [],
		});
		expect(found.map((each) => each.source)).toEqual([
			'credential-variable',
			'seen-models',
		]);
	});
});
