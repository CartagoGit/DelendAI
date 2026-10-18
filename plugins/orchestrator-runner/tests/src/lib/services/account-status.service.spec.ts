import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type { IProviderAccount } from '@delendai/core/contracts';
import { describe, expect, it } from 'vitest';

import type { IProviderCapabilities } from '@delendai/core/public';

import {
	accountStatuses,
	inheritingEntries,
} from '../../../../src/lib/services/account-status.service';

const account: IProviderAccount = {
	accountId: 'claude-work',
	vendor: 'anthropic',
	credentialMode: 'byok-api-key',
	billingMode: 'pay-as-you-go',
	credentialEnv: 'WORK_KEY',
	profileDir: '/profiles/claude-work',
	quotaGroups: ['work-5h', 'work-week'],
	permittedAutomation: true,
};

const NOW = Date.parse('2026-10-17T10:00:00.000Z');

describe('accountStatuses', () => {
	it('says what each account is, what holds its pools and its last hop, never a secret', async () => {
		const dir = mkdtempSync(join(tmpdir(), 'account-status-'));
		const ledgerPath = join(dir, 'ledger.json');
		const journalPath = join(dir, 'invocations.jsonl');
		writeFileSync(
			ledgerPath,
			JSON.stringify({
				schema: 'delendai/orchestrator-runner/quota-reservations/1',
				reservations: [
					{
						invocationId: 'a',
						groups: ['work-5h'],
						expiresAt: '2026-10-17T10:05:00.000Z',
					},
					{
						invocationId: 'b',
						groups: ['work-5h'],
						expiresAt: '2026-10-17T09:00:00.000Z',
					},
				],
			}),
		);
		writeFileSync(
			journalPath,
			`${JSON.stringify({ invocationId: 'a', state: 'running', providerId: 'opus', accountId: 'claude-work', pid: 1, at: '2026-10-17T09:59:00.000Z' })}\n`,
		);
		const [status] = await accountStatuses({
			accounts: [account],
			ledgerPath,
			journalPath,
			now: NOW,
		});
		expect(status).toEqual({
			accountId: 'claude-work',
			vendor: 'anthropic',
			credentialMode: 'byok-api-key',
			billingMode: 'pay-as-you-go',
			credentialEnv: 'WORK_KEY',
			isolated: true,
			permittedAutomation: true,
			quotaGroups: [
				{ group: 'work-5h', held: 1 },
				{ group: 'work-week', held: 0 },
			],
			lastInvocation: {
				state: 'running',
				at: '2026-10-17T09:59:00.000Z',
				providerId: 'opus',
			},
		});
		expect(JSON.stringify(status)).not.toContain('/profiles/claude-work');
	});

	it('says a pool is unknown, not empty, when the ledger cannot be read', async () => {
		const dir = mkdtempSync(join(tmpdir(), 'account-status-'));
		const ledgerPath = join(dir, 'ledger.json');
		writeFileSync(ledgerPath, '{broken');
		const [status] = await accountStatuses({
			accounts: [account],
			ledgerPath,
			journalPath: join(dir, 'none.jsonl'),
			now: NOW,
		});
		expect(status?.quotaGroups).toEqual([
			{ group: 'work-5h', held: null },
			{ group: 'work-week', held: null },
		]);
		expect(status?.lastInvocation).toBeUndefined();
	});
});

describe('inheritingEntries', () => {
	const entry = (
		id: string,
		invoke: IProviderCapabilities['invoke'],
		accountId?: string,
	): IProviderCapabilities => ({
		id,
		kind: 'cli',
		invoke,
		modelId: 'm',
		contextWindow: 1,
		costTier: 1,
		strengths: [],
		weaknesses: [],
		...(accountId === undefined ? {} : { accountId }),
	});

	it('lists the CLI entries that name neither an account nor their variables', () => {
		expect(
			inheritingEntries([
				entry('legacy', { kind: 'cli', command: 'aider' }),
				entry('named', {
					kind: 'cli',
					command: 'aider',
					env: ['OPENAI_API_KEY'],
				}),
				entry(
					'on-account',
					{ kind: 'cli', command: 'claude' },
					'claude-work',
				),
				entry('api', { kind: 'api', url: 'https://x', envVar: 'K' }),
			]),
		).toEqual([{ providerId: 'legacy', command: 'aider' }]);
	});
});
