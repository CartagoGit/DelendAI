/**
 * account-offers.service.spec.ts — what a machine's logged-in clients
 * suggest, and the offer flow that asks, writes and remembers.
 */
import { mkdtempSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';

import { describe, expect, it } from 'vitest';

import { KNOWN_CLIENTS } from '../../../../src/lib/contracts/constants/known-clients.constant';
import type { IClientDiscovery } from '../../../../src/lib/contracts/interfaces/known-client.interface';
import {
	offerFoundAccounts,
	setAccountAutomation,
} from '../../../../src/lib/plugins/account-offer-flow.service';
import {
	accountOffers,
	classificationFromAnswer,
} from '../../../../src/lib/plugins/account-offers.service';
import { findingsFromClients } from '../../../../src/lib/shared/account-sources.service';
import { runClientCommand } from '../../../../src/lib/shared/client-command-runner.service';

const client = (command: string) => {
	const found = KNOWN_CLIENTS.find((each) => each.command === command);
	if (found === undefined) throw new Error(`no client ${command}`);
	return found;
};

const usable = (
	command: string,
	login: IClientDiscovery['login'],
): IClientDiscovery => ({
	client: client(command),
	installed: true,
	path: `/bin/${command}`,
	version: '1',
	verdict: 'usable',
	evidence: null,
	...(login === undefined ? {} : { login }),
});

const subscription = {
	credentialMode: 'official-subscription-login',
	billingMode: 'subscription-included',
} as const;

/** No source reads this machine: no environment, models, plan tools, local servers or editor BYOK. */
const isolated = {
	env: {},
	seen: [],
	hostByok: [],
	planTools: [],
	fetchLocal: async () => undefined,
};

describe('accountOffers', () => {
	it('offers each usable client whose login says how it bills, and asks about one whose does not', () => {
		const { offers, unclassified } = accountOffers(
			findingsFromClients([
				usable('claude', subscription),
				usable('copilot', undefined),
				usable('opencode', undefined),
			]),
			{ accounts: [], declined: [] },
		);
		expect(offers).toEqual([
			{
				accountId: 'anthropic-claude',
				vendor: 'anthropic',
				displayName: 'Claude Code (CLI), as logged in on this machine',
				credentialMode: 'official-subscription-login',
				billingMode: 'subscription-included',
				quotaGroups: ['anthropic-claude'],
				permittedAutomation: false,
			},
		]);
		// Not dropped: the person is asked who it is with and how it is paid.
		// OpenCode reaches several vendors: its providers are the findings.
		expect(unclassified.map((finding) => finding.key)).toEqual([
			'client-login:copilot',
		]);
	});

	it('does not offer what is declared, the same kind of login, or what was declined', () => {
		const found = findingsFromClients([
			usable('claude', subscription),
			usable('codex', subscription),
		]);
		expect(
			accountOffers(found, {
				accounts: [
					{
						accountId: 'claude-work',
						vendor: 'anthropic',
						credentialMode: 'official-subscription-login',
					},
				],
				declined: ['openai-codex'],
			}).offers,
		).toEqual([]);
	});

	it('classifies a finding from what the person answered before', () => {
		const [opencode] = findingsFromClients([usable('copilot', undefined)]);
		if (opencode === undefined) throw new Error('no finding');
		const { offers, unclassified } = accountOffers(
			[opencode],
			{ accounts: [], declined: [] },
			{
				[opencode.key]: {
					vendor: 'github',
					credentialMode: 'byok-api-key',
					billingMode: 'pay-as-you-go',
				},
			},
		);
		expect(unclassified).toEqual([]);
		expect(offers[0]).toMatchObject({
			accountId: 'github-copilot',
			billingMode: 'pay-as-you-go',
		});
	});
});

describe('classificationFromAnswer', () => {
	it('derives the credential mode from how it is paid and whether a key holds it', () => {
		const key = { credentialEnv: 'MINIMAX_API_KEY' };
		expect(
			classificationFromAnswer(key, 'MiniMax', 'prepaid-token-plan'),
		).toEqual({
			vendor: 'minimax',
			credentialMode: 'provider-plan-token',
			billingMode: 'prepaid-token-plan',
		});
		expect(
			classificationFromAnswer(key, 'x', 'pay-as-you-go').credentialMode,
		).toBe('byok-api-key');
		expect(
			classificationFromAnswer({}, 'qwen', 'subscription-included')
				.credentialMode,
		).toBe('official-subscription-login');
		expect(
			classificationFromAnswer({}, 'qwen', 'prepaid-token-plan')
				.credentialMode,
		).toBe('provider-plan-token');
		expect(
			classificationFromAnswer({}, 'Meta Llama', 'pay-as-you-go'),
		).toMatchObject({
			vendor: 'meta-llama',
			credentialMode: 'byok-api-key',
		});
		expect(
			classificationFromAnswer({}, 'ollama', 'local').credentialMode,
		).toBe('local-none');
	});
});

describe('offerFoundAccounts', () => {
	const setUp = () => {
		const workspace = mkdtempSync(join(tmpdir(), 'offer-ws-'));
		const personalRoot = mkdtempSync(join(tmpdir(), 'offer-cfg-'));
		execFileSync('git', ['init', '-q', workspace]);
		return { workspace, personalRoot };
	};
	const discovered = [
		usable('claude', subscription),
		usable('codex', subscription),
	];

	it('writes a yes, remembers a no, and asks neither again', async () => {
		const { workspace, personalRoot } = setUp();
		const asked: string[] = [];
		const positions: string[] = [];
		const first = await offerFoundAccounts({
			workspace,
			personalRoot,
			run: runClientCommand,
			discovered,
			...isolated,
			ask: async (offer, position) => {
				asked.push(offer.accountId);
				positions.push(
					`${String(position?.index)}/${String(position?.total)} ${position?.finding?.source ?? ''}`,
				);
				return offer.accountId === 'anthropic-claude';
			},
		});
		expect(positions).toEqual(['1/2 client-login', '2/2 client-login']);
		expect(first.added).toEqual(['anthropic-claude']);
		expect(first.declined).toEqual(['openai-codex']);
		const file = JSON.parse(readFileSync(first.personalLayer, 'utf8')) as {
			accounts: { accountId: string; permittedAutomation: boolean }[];
			declinedOffers: string[];
		};
		expect(file.accounts).toEqual([
			expect.objectContaining({
				accountId: 'anthropic-claude',
				permittedAutomation: false,
			}),
		]);
		expect(file.declinedOffers).toEqual(['openai-codex']);
		if (process.platform !== 'win32')
			expect(statSync(first.personalLayer).mode & 0o777).toBe(0o600);
		const second = await offerFoundAccounts({
			workspace,
			personalRoot,
			run: runClientCommand,
			discovered,
			...isolated,
			ask: async (offer) => {
				asked.push(offer.accountId);
				return true;
			},
		});
		expect(second.offered).toEqual([]);
		expect(asked).toEqual(['anthropic-claude', 'openai-codex']);
	});

	it('asks what is ready before the findings that need classifying', async () => {
		const { workspace, personalRoot } = setUp();
		const events: string[] = [];
		await offerFoundAccounts({
			workspace,
			personalRoot,
			run: runClientCommand,
			discovered,
			...isolated,
			env: { MINIMAX_API_KEY: 'x' },
			beforeClassifying: async (count) => {
				events.push(`classify ${String(count)}?`);
				return true;
			},
			classify: async (finding) =>
				classificationFromAnswer(
					finding,
					'minimax',
					'prepaid-token-plan',
				),
			ask: async (offer, position) => {
				events.push(
					`${offer.accountId} ${String(position?.index)}/${String(position?.total)}`,
				);
				return undefined;
			},
		});
		expect(events).toEqual([
			'anthropic-claude 1/2',
			'openai-codex 2/2',
			'classify 1?',
			'minimax-key 1/1',
		]);
	});

	it('only lists the offers nobody answered, and writes nothing', async () => {
		const { workspace, personalRoot } = setUp();
		const outcome = await offerFoundAccounts({
			workspace,
			personalRoot,
			run: runClientCommand,
			discovered,
			...isolated,
			ask: async () => undefined,
		});
		expect(outcome.offered.map((offer) => offer.accountId)).toEqual([
			'anthropic-claude',
			'openai-codex',
		]);
		expect(() => readFileSync(outcome.personalLayer, 'utf8')).toThrow();
	});
});

describe('classifying what no source can', () => {
	it('asks once, offers what is answered, keeps the answer, and lists the rest', async () => {
		const workspace = mkdtempSync(join(tmpdir(), 'offer-classify-ws-'));
		const personalRoot = mkdtempSync(join(tmpdir(), 'offer-classify-cfg-'));
		execFileSync('git', ['init', '-q', workspace]);
		const counts: number[] = [];
		const first = await offerFoundAccounts({
			workspace,
			personalRoot,
			run: runClientCommand,
			discovered: [],
			...isolated,
			env: { MINIMAX_API_KEY: 'x' },
			seen: ['qwen3.8-max'],
			beforeClassifying: async (count) => {
				counts.push(count);
				return true;
			},
			classify: async (finding, position) =>
				position?.total === 2 &&
				finding.source === 'credential-variable'
					? classificationFromAnswer(
							finding,
							'minimax',
							'prepaid-token-plan',
						)
					: undefined,
			ask: async () => undefined,
		});
		expect(counts).toEqual([2]);
		expect(first.offered).toEqual([
			expect.objectContaining({
				accountId: 'minimax-key',
				credentialEnv: 'MINIMAX_API_KEY',
				credentialMode: 'provider-plan-token',
			}),
		]);
		expect(first.unclassified.map((each) => each.key)).toEqual([
			'seen-models:qwen',
		]);
		// The answer is kept: next time nothing about the key is asked.
		const second = await offerFoundAccounts({
			workspace,
			personalRoot,
			run: runClientCommand,
			discovered: [],
			...isolated,
			env: { MINIMAX_API_KEY: 'x' },
			beforeClassifying: async () => false,
			classify: async () => {
				throw new Error('must not ask');
			},
			ask: async () => undefined,
		});
		expect(second.offered.map((each) => each.accountId)).toEqual([
			'minimax-key',
		]);
	});
});

describe('a client only configuration knows', () => {
	it('is discovered and offered from one entry in the project config', async () => {
		const workspace = mkdtempSync(join(tmpdir(), 'offer-declared-ws-'));
		const personalRoot = mkdtempSync(join(tmpdir(), 'offer-declared-cfg-'));
		execFileSync('git', ['init', '-q', workspace]);
		writeFileSync(
			join(workspace, 'delendai.config.json'),
			JSON.stringify({
				clients: [
					{
						command: 'mimo',
						vendor: 'xiaomi',
						loginStatusArgs: ['status'],
						loginKinds: [
							{
								pattern: 'logged in with a plan',
								credentialMode: 'official-subscription-login',
								billingMode: 'subscription-included',
							},
						],
					},
				],
			}),
		);
		const answers: Record<string, string> = {
			'command -v mimo': '/opt/bin/mimo',
			'mimo --version': 'mimo 0.1',
			'mimo status': 'Logged in with a plan',
		};
		const outcome = await offerFoundAccounts({
			workspace,
			personalRoot,
			run: async (command) =>
				answers[command] === undefined
					? { code: 1, output: '' }
					: { code: 0, output: answers[command] ?? '' },
			...isolated,
			ask: async () => undefined,
		});
		expect(outcome.offered).toEqual([
			expect.objectContaining({
				accountId: 'xiaomi-mimo',
				vendor: 'xiaomi',
				billingMode: 'subscription-included',
			}),
		]);
	});
});

describe('unattended work', () => {
	const setUp = () => {
		const workspace = mkdtempSync(join(tmpdir(), 'offer-auto-ws-'));
		const personalRoot = mkdtempSync(join(tmpdir(), 'offer-auto-cfg-'));
		execFileSync('git', ['init', '-q', workspace]);
		return { workspace, personalRoot };
	};

	it('is on only for an added account the person said yes to', async () => {
		const { workspace, personalRoot } = setUp();
		const outcome = await offerFoundAccounts({
			workspace,
			personalRoot,
			run: runClientCommand,
			discovered: [
				usable('claude', subscription),
				usable('codex', subscription),
			],
			...isolated,
			ask: async () => true,
			askAutomation: async (offer) => offer.accountId === 'openai-codex',
		});
		const file = JSON.parse(
			readFileSync(outcome.personalLayer, 'utf8'),
		) as {
			accounts: { accountId: string; permittedAutomation: boolean }[];
		};
		expect(
			file.accounts.map((each) => [
				each.accountId,
				each.permittedAutomation,
			]),
		).toEqual([
			['anthropic-claude', false],
			['openai-codex', true],
		]);
	});

	it('is turned on and off by id, and refuses an account the file does not hold', async () => {
		const { workspace, personalRoot } = setUp();
		await offerFoundAccounts({
			workspace,
			personalRoot,
			run: runClientCommand,
			discovered: [usable('claude', subscription)],
			...isolated,
			ask: async () => true,
		});
		const on = { workspace, personalRoot, accountId: 'anthropic-claude' };
		expect((await setAccountAutomation({ ...on, on: true })).changed).toBe(
			true,
		);
		expect((await setAccountAutomation({ ...on, on: true })).changed).toBe(
			false,
		);
		expect((await setAccountAutomation({ ...on, on: false })).changed).toBe(
			true,
		);
		await expect(
			setAccountAutomation({ ...on, accountId: 'team-shared', on: true }),
		).rejects.toThrow(/holds no account "team-shared"/u);
	});
});

describe('runClientCommand', () => {
	it('runs a catalogue command line and returns its output and code', async () => {
		expect(await runClientCommand('printf ok', { cwd: tmpdir() })).toEqual({
			code: 0,
			output: 'ok',
		});
		expect(
			(
				await runClientCommand('exit 4', {
					cwd: tmpdir(),
					timeoutMs: 5_000,
				})
			).code,
		).toBe(4);
	});
});
