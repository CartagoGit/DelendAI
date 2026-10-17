import { existsSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type { IProviderAccount } from '@delendai/core/contracts';
import { describe, expect, it } from 'vitest';

import type { IQuotaGroupObservation } from '../../../../src/lib/contracts/interfaces/quota-reservation.interface';
import {
	quotaHoldFor,
	releaseQuota,
	reserveQuota,
} from '../../../../src/lib/services/quota-reservation.service';

const NOW = Date.parse('2026-10-17T10:00:00.000Z');
const dir = () => mkdtempSync(join(tmpdir(), 'quota-ledger-'));

const observed = (
	windows: IQuotaGroupObservation['windows'],
	observedAt = '2026-10-17T09:59:00.000Z',
): IQuotaGroupObservation => ({ observedAt, windows });

const requests = (limit: number | null, used: number | null) => ({
	window: 'hourly' as const,
	unit: 'requests' as const,
	limit,
	used,
	resetAt: null,
});

const reserve = (
	ledgerPath: string,
	invocationId: string,
	observation: IQuotaGroupObservation | undefined,
	now = NOW,
) =>
	reserveQuota({
		ledgerPath,
		invocationId,
		groups: ['work-5h'],
		observationOf: () => observation,
		ttlMs: 60_000,
		freshForMs: 15 * 60_000,
		now: () => now,
	});

describe('reserveQuota', () => {
	it('lets only as many concurrent invocations hold a pool as it has room for', async () => {
		const ledger = join(dir(), 'ledger.json');
		const oneLeft = observed([requests(10, 9)]);
		const outcomes = await Promise.all(
			['a', 'b', 'c'].map((id) => reserve(ledger, id, oneLeft)),
		);
		expect(outcomes.filter((o) => o.kind === 'reserved')).toHaveLength(1);
		expect(outcomes.filter((o) => o.kind === 'refused')).toHaveLength(2);
	});

	it('holds nothing twice for a retried invocation, and frees on release or expiry', async () => {
		const ledger = join(dir(), 'ledger.json');
		const oneLeft = observed([requests(10, 9)]);
		expect((await reserve(ledger, 'a', oneLeft)).kind).toBe('reserved');
		expect((await reserve(ledger, 'a', oneLeft)).kind).toBe('reserved');
		expect((await reserve(ledger, 'b', oneLeft)).kind).toBe('refused');
		await releaseQuota(ledger, 'a');
		expect((await reserve(ledger, 'b', oneLeft)).kind).toBe('reserved');
		expect((await reserve(ledger, 'c', oneLeft, NOW + 61_000)).kind).toBe(
			'reserved',
		);
	});

	it('never reads unknown, stale or exhausted as room', async () => {
		const ledger = join(dir(), 'ledger.json');
		const reasons = await Promise.all([
			reserve(ledger, 'a', undefined),
			reserve(ledger, 'b', observed([requests(null, 3)])),
			reserve(
				ledger,
				'c',
				observed([requests(10, 1)], '2026-10-17T09:00:00.000Z'),
			),
			reserve(
				ledger,
				'd',
				observed([
					requests(10, 1),
					{ ...requests(100, 100), window: 'weekly', unit: 'tokens' },
				]),
			),
			reserve(ledger, 'e', observed([])),
		]);
		expect(
			reasons.map((o) => (o.kind === 'refused' ? o.reason : o.kind)),
		).toEqual([
			'quota group "work-5h" has never been observed',
			'the hourly window of quota group "work-5h" is unknown',
			'quota group "work-5h" was last observed at 2026-10-17T09:00:00.000Z, too long ago to trust',
			'the weekly window of quota group "work-5h" has no room (0 tokens left, 0 invocation(s) holding it)',
			'quota group "work-5h" reports no window',
		]);
	});

	it('refuses and sets aside a ledger it cannot read', async () => {
		const root = dir();
		const ledger = join(root, 'ledger.json');
		writeFileSync(ledger, '{not json');
		const outcome = await reserve(ledger, 'a', observed([requests(10, 0)]));
		expect(outcome.kind).toBe('refused');
		expect(existsSync(ledger)).toBe(false);
	});
});

describe('quotaHoldFor', () => {
	const account = (quotaGroups: string[]): IProviderAccount => ({
		accountId: 'claude-work',
		vendor: 'anthropic',
		credentialMode: 'official-subscription-login',
		billingMode: 'subscription-included',
		quotaGroups,
		permittedAutomation: true,
	});
	const hold = (accounts: IProviderAccount[]) => {
		const root = dir();
		writeFileSync(
			join(root, 'quotas.json'),
			JSON.stringify({
				updatedAt: new Date().toISOString(),
				providers: {},
				groups: {
					'work-5h': observed(
						[requests(10, 0)],
						new Date().toISOString(),
					),
				},
			}),
		);
		return quotaHoldFor({
			accounts,
			ledgerPath: join(root, 'ledger.json'),
			quotasPath: join(root, 'quotas.json'),
			ttlMs: 60_000,
			freshForMs: 60_000,
		});
	};

	it('holds nothing for an entry with no account', async () => {
		expect(await hold([])('p', undefined, 'inv')).toBeUndefined();
	});

	it('refuses an account that declares no pool, and reserves one that does', async () => {
		const none = await hold([account([])])('p', 'claude-work', 'inv');
		expect(none?.kind === 'refused' && none.reason).toContain(
			'declares no quota group',
		);
		const some = await hold([account(['work-5h'])])(
			'p',
			'claude-work',
			'inv',
		);
		expect(some?.kind).toBe('reserved');
	});
});
