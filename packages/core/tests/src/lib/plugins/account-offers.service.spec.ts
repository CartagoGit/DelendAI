/**
 * account-offers.service.spec.ts — what a machine's logged-in clients
 * suggest, and the offer flow that asks, writes and remembers.
 */
import { mkdtempSync, readFileSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';

import { describe, expect, it } from 'vitest';

import { KNOWN_CLIENTS } from '../../../../src/lib/contracts/constants/known-clients.constant';
import type { IClientDiscovery } from '../../../../src/lib/contracts/interfaces/known-client.interface';
import { offerFoundAccounts } from '../../../../src/lib/plugins/account-offer-flow.service';
import {
	accountOffers,
	offeredAccountId,
} from '../../../../src/lib/plugins/account-offers.service';
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

describe('accountOffers', () => {
	it('offers each usable client whose login says how it bills, closed to unattended work', () => {
		const offers = accountOffers(
			[usable('claude', subscription), usable('opencode', undefined)],
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
	});

	it('does not offer what is declared, the same kind of login, or what was declined', () => {
		const found = [
			usable('claude', subscription),
			usable('codex', subscription),
		];
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
			}),
		).toEqual([]);
		expect(offeredAccountId(found[1] as IClientDiscovery)).toBe(
			'openai-codex',
		);
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
		const first = await offerFoundAccounts({
			workspace,
			personalRoot,
			run: runClientCommand,
			discovered,
			ask: async (offer) => {
				asked.push(offer.accountId);
				return offer.accountId === 'anthropic-claude';
			},
		});
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
			ask: async (offer) => {
				asked.push(offer.accountId);
				return true;
			},
		});
		expect(second.offered).toEqual([]);
		expect(asked).toEqual(['anthropic-claude', 'openai-codex']);
	});

	it('only lists the offers nobody answered, and writes nothing', async () => {
		const { workspace, personalRoot } = setUp();
		const outcome = await offerFoundAccounts({
			workspace,
			personalRoot,
			run: runClientCommand,
			discovered,
			ask: async () => undefined,
		});
		expect(outcome.offered.map((offer) => offer.accountId)).toEqual([
			'anthropic-claude',
			'openai-codex',
		]);
		expect(() => readFileSync(outcome.personalLayer, 'utf8')).toThrow();
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
