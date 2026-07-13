import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
	buildQuotaSnapshot,
	httpHeaderSample,
	mergeQuotaSources,
	writeQuotaSnapshot,
	type IProviderQuotaSample,
} from '../../../src/lib/quota';
import { readQuotaSnapshot } from '../../../src/lib/quota/read-quota';

describe('mergeQuotaSources', () => {
	it('keeps hourly and monthly windows as DISTINCT entries — never averaged (I3)', () => {
		const samples: IProviderQuotaSample[] = [
			{
				providerId: 'openrouter',
				source: 'http-header',
				windows: [
					{ window: 'hourly', limit: 1000, used: 100, resetAt: null },
				],
			},
			{
				providerId: 'openrouter',
				source: 'auth-rpc',
				windows: [
					{
						window: 'monthly',
						limit: 50000,
						used: 40000,
						resetAt: null,
					},
				],
			},
		];
		const merged = mergeQuotaSources(samples);
		expect(merged.openrouter).toHaveLength(2);
		const hourly = merged.openrouter?.find((w) => w.window === 'hourly');
		const monthly = merged.openrouter?.find((w) => w.window === 'monthly');
		// Each window retains its own numbers; nothing is blended.
		expect(hourly).toEqual({
			window: 'hourly',
			limit: 1000,
			used: 100,
			resetAt: null,
		});
		expect(monthly).toEqual({
			window: 'monthly',
			limit: 50000,
			used: 40000,
			resetAt: null,
		});
	});

	it('shadows a lower-priority source for the SAME (provider, window)', () => {
		const samples: IProviderQuotaSample[] = [
			{
				providerId: 'claude',
				source: 'local-count',
				windows: [
					{ window: 'monthly', limit: 100, used: 99, resetAt: null },
				],
			},
			{
				providerId: 'claude',
				source: 'auth-rpc',
				windows: [
					{ window: 'monthly', limit: 100, used: 43, resetAt: 'x' },
				],
			},
		];
		const merged = mergeQuotaSources(samples);
		// auth-rpc (priority 1) shadows local-count (priority 2) for monthly.
		expect(merged.claude).toEqual([
			{ window: 'monthly', limit: 100, used: 43, resetAt: 'x' },
		]);
	});

	it('http-header outranks auth-rpc for the same window (cheapest wins)', () => {
		const merged = mergeQuotaSources([
			{
				providerId: 'p',
				source: 'auth-rpc',
				windows: [
					{ window: 'hourly', limit: 10, used: 9, resetAt: null },
				],
			},
			{
				providerId: 'p',
				source: 'http-header',
				windows: [
					{ window: 'hourly', limit: 10, used: 1, resetAt: null },
				],
			},
		]);
		expect(merged.p?.[0]?.used).toBe(1);
	});

	it('orders windows deterministically (hourly, weekly, monthly)', () => {
		const merged = mergeQuotaSources([
			{
				providerId: 'p',
				source: 'auth-rpc',
				windows: [
					{
						window: 'monthly',
						limit: null,
						used: null,
						resetAt: null,
					},
					{
						window: 'hourly',
						limit: null,
						used: null,
						resetAt: null,
					},
					{
						window: 'weekly',
						limit: null,
						used: null,
						resetAt: null,
					},
				],
			},
		]);
		expect(merged.p?.map((w) => w.window)).toEqual([
			'hourly',
			'weekly',
			'monthly',
		]);
	});
});

describe('httpHeaderSample', () => {
	it('derives used from limit − remaining and resetAt from resetSeconds', () => {
		const now = new Date('2026-07-04T00:00:00.000Z');
		const sample = httpHeaderSample('openrouter', {
			window: 'hourly',
			limit: 1000,
			remaining: 880,
			resetSeconds: 1620,
			now,
		});
		expect(sample.source).toBe('http-header');
		expect(sample.windows[0]).toEqual({
			window: 'hourly',
			limit: 1000,
			used: 120,
			resetAt: '2026-07-04T00:27:00.000Z',
		});
	});

	it('leaves used/resetAt null when inputs are absent', () => {
		const sample = httpHeaderSample('p', { window: 'monthly' });
		expect(sample.windows[0]).toEqual({
			window: 'monthly',
			limit: null,
			used: null,
			resetAt: null,
		});
	});
});

describe('writeQuotaSnapshot ↔ readQuotaSnapshot round-trip', () => {
	let dir: string;
	beforeEach(async () => {
		dir = await mkdtemp(join(tmpdir(), 'or-quota-write-'));
	});
	afterEach(async () => {
		await rm(dir, { recursive: true, force: true });
	});

	it('writes the exact shape read-quota parses back', async () => {
		const path = join(dir, 'quotas.json');
		const snapshot = buildQuotaSnapshot(
			[
				{
					providerId: 'claude',
					source: 'auth-rpc',
					windows: [
						{
							window: 'monthly',
							limit: 1000,
							used: 432,
							resetAt: '2026-08-01T00:00:00.000Z',
						},
					],
				},
			],
			new Date('2026-07-04T12:00:00.000Z'),
		);
		await writeQuotaSnapshot(path, snapshot);

		const read = await readQuotaSnapshot(path);
		expect(read.present).toBe(true);
		expect(read.updatedAt).toBe('2026-07-04T12:00:00.000Z');
		expect(read.providers.claude?.[0]).toEqual({
			window: 'monthly',
			limit: 1000,
			used: 432,
			resetAt: '2026-08-01T00:00:00.000Z',
		});
	});
});
