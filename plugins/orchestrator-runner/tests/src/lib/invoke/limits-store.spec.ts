/**
 * limits-store.spec.ts — the in-memory limits mirror (S7).
 */
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
	SpendLimitsStore,
	normalizeLimitsView,
} from '../../../../src/lib/invoke/limits-store';

describe('normalizeLimitsView', () => {
	it('does not call a summary with no limitsStatus a known budget', () => {
		const v = normalizeLimitsView(undefined);
		expect(v.breached).toBeNull();
		expect(v.observed).toBe('unknown');
		expect(v.observedReason).toContain('no limitsStatus');
	});

	it('ignores an unknown breach scope in a readable block', () => {
		const v = normalizeLimitsView({ breached: 'weekly' });
		expect(v.breached).toBeNull();
		expect(v.observed).toBe('known');
	});

	it('lifts the breach + spend numbers', () => {
		const v = normalizeLimitsView({
			sessionSpendUsd: 12,
			sessionLimitUsd: 10,
			monthlySpendUsd: 1,
			monthlyLimitUsd: 100,
			breached: 'session',
		});
		expect(v).toMatchObject({
			breached: 'session',
			sessionSpendUsd: 12,
			observed: 'known',
		});
	});
});

describe('SpendLimitsStore', () => {
	let dir = '';
	beforeEach(() => {
		dir = mkdtempSync(join(tmpdir(), 'or-limits-'));
	});
	afterEach(() => rmSync(dir, { recursive: true, force: true }));

	it('starts unknown, because nothing has been read', () => {
		expect(new SpendLimitsStore().snapshot().observed).toBe('unknown');
	});

	it('is unknown for a missing summary, and names the file', async () => {
		// It used to stay "neutral": nothing breached, so a configured cap
		// stopped applying whenever the file could not be read.
		const store = new SpendLimitsStore();
		const missing = join(dir, 'missing.json');
		await store.loadFrom(missing);
		expect(store.snapshot().observed).toBe('unknown');
		expect(store.snapshot().observedReason).toContain(missing);
	});

	it('is unknown for a corrupt summary', async () => {
		const path = join(dir, 'usage-summary.json');
		writeFileSync(path, '{"limitsStatus": {', 'utf8');
		const store = new SpendLimitsStore();
		await store.loadFrom(path);
		expect(store.snapshot().observed).toBe('unknown');
	});

	it('forgets a known view once the summary can no longer be read', async () => {
		// Spend may have grown since the last read; the old numbers are not
		// evidence of the current budget.
		const path = join(dir, 'usage-summary.json');
		writeFileSync(
			path,
			JSON.stringify({
				limitsStatus: { sessionSpendUsd: 1, breached: null },
			}),
			'utf8',
		);
		const store = new SpendLimitsStore();
		await store.loadFrom(path);
		expect(store.snapshot().observed).toBe('known');
		rmSync(path);
		await store.loadFrom(path);
		expect(store.snapshot().observed).toBe('unknown');
	});

	it('hydrates limitsStatus from the summary file', async () => {
		const path = join(dir, 'usage-summary.json');
		writeFileSync(
			path,
			JSON.stringify({
				limitsStatus: {
					sessionSpendUsd: 5,
					sessionLimitUsd: 10,
					monthlySpendUsd: 5,
					monthlyLimitUsd: 20,
					breached: 'monthly',
				},
			}),
			'utf8',
		);
		const store = new SpendLimitsStore();
		await store.loadFrom(path);
		expect(store.snapshot().breached).toBe('monthly');
		expect(store.snapshot().sessionSpendUsd).toBe(5);
		expect(store.snapshot().observed).toBe('known');
	});
});

describe('SpendLimitsStore — injection and refresh', () => {
	let dir = '';
	beforeEach(() => {
		dir = mkdtempSync(join(tmpdir(), 'or-limits-refresh-'));
	});
	afterEach(() => {
		vi.useRealTimers();
		rmSync(dir, { recursive: true, force: true });
	});

	it('serves a view a host injected', () => {
		const store = new SpendLimitsStore();
		const injected = normalizeLimitsView({ breached: 'session' });
		store.set(injected);
		expect(store.snapshot()).toBe(injected);
	});

	it('re-reads the summary on its interval, so a newly written one is seen', async () => {
		vi.useFakeTimers();
		const path = join(dir, 'usage-summary.json');
		const store = new SpendLimitsStore();
		store.startRefreshTimer(path, 1000);
		writeFileSync(
			path,
			JSON.stringify({ limitsStatus: { breached: 'monthly' } }),
			'utf8',
		);
		await vi.advanceTimersByTimeAsync(1000);
		vi.useRealTimers();
		await vi.waitFor(() => {
			expect(store.snapshot().breached).toBe('monthly');
		});
	});
});
