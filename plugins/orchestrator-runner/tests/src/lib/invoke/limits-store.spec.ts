/**
 * limits-store.spec.ts — the in-memory limits mirror (S7).
 */
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
	SpendLimitsStore,
	normalizeLimitsView,
} from '../../../../src/lib/invoke/limits-store';

describe('normalizeLimitsView', () => {
	it('returns a neutral view for junk', () => {
		expect(normalizeLimitsView(undefined).breached).toBeNull();
		expect(normalizeLimitsView({ breached: 'weekly' }).breached).toBeNull();
	});

	it('lifts the breach + spend numbers', () => {
		const v = normalizeLimitsView({
			sessionSpendUsd: 12,
			sessionLimitUsd: 10,
			monthlySpendUsd: 1,
			monthlyLimitUsd: 100,
			breached: 'session',
		});
		expect(v).toMatchObject({ breached: 'session', sessionSpendUsd: 12 });
	});
});

describe('SpendLimitsStore', () => {
	let dir = '';
	beforeEach(() => {
		dir = mkdtempSync(join(tmpdir(), 'or-limits-'));
	});
	afterEach(() => rmSync(dir, { recursive: true, force: true }));

	it('starts neutral and stays neutral for a missing summary', async () => {
		const store = new SpendLimitsStore();
		await store.loadFrom(join(dir, 'missing.json'));
		expect(store.snapshot().breached).toBeNull();
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
	});
});
