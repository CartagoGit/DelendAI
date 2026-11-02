/**
 * circuit-breaker.spec.ts — rolling spend + breach detection (f00067 S7).
 *
 * The invariant under test: the session window and the calendar-month window
 * are computed and breached INDEPENDENTLY — never averaged into one number.
 */
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
	computeLimitsStatus,
	emptyLimitsStatus,
	isBreakerActive,
	recordDegradation,
	startOfCalendarMonth,
} from '../../../src/lib/circuit-breaker';
import type { IInvocationRecord } from '../../../src/lib/types';

const rec = (ts: string, costUsd: number | null): IInvocationRecord => ({
	ts,
	sessionId: 's',
	agent: { id: 'a', kind: 'unknown', extension: 'unknown' },
	plugin: 'orchestrator-runner',
	tool: 'invoke',
	model: { provider: 'openai', modelId: 'gpt', kind: 'api' },
	usage: null,
	costUsd,
	durationMs: null,
	outcome: 'success',
	fallbackFrom: null,
	error: null,
	autoBypassed: false,
});

// A fixed "now" mid-month so the calendar-month window is unambiguous.
const NOW = Date.parse('2026-07-15T12:00:00.000Z');
const sessionStartMs = Date.parse('2026-07-15T09:00:00.000Z');

describe('circuit-breaker', () => {
	it('isBreakerActive only when a cap is set', () => {
		expect(isBreakerActive({ sessionStartMs })).toBe(false);
		expect(isBreakerActive({ sessionStartMs, maxSessionSpendUsd: 1 })).toBe(
			true,
		);
		expect(isBreakerActive({ sessionStartMs, maxMonthlySpendUsd: 1 })).toBe(
			true,
		);
	});

	it('startOfCalendarMonth is the 1st at 00:00 UTC', () => {
		expect(new Date(startOfCalendarMonth(NOW)).toISOString()).toBe(
			'2026-07-01T00:00:00.000Z',
		);
	});

	it('emptyLimitsStatus never breaches and reports null caps', () => {
		const s = emptyLimitsStatus();
		expect(s.breached).toBeNull();
		expect(s.sessionLimitUsd).toBeNull();
		expect(s.monthlyLimitUsd).toBeNull();
	});

	it('counts session spend only since session start (never averaged)', () => {
		const records = [
			rec('2026-07-15T08:00:00.000Z', 5), // before session start
			rec('2026-07-15T10:00:00.000Z', 3), // in session
			rec('2026-07-15T11:00:00.000Z', 4), // in session
		];
		const status = computeLimitsStatus(
			records,
			{ sessionStartMs, maxSessionSpendUsd: 10 },
			NOW,
		);
		expect(status.sessionSpendUsd).toBe(7); // 3 + 4, NOT 12
		// Monthly counts all in-month records (5 + 3 + 4).
		expect(status.monthlySpendUsd).toBe(12);
		expect(status.sessionLimitPct).toBe(70);
		expect(status.breached).toBeNull();
	});

	it('breaches session independently of monthly', () => {
		const records = [rec('2026-07-15T10:00:00.000Z', 12)];
		const status = computeLimitsStatus(
			records,
			{ sessionStartMs, maxSessionSpendUsd: 10, maxMonthlySpendUsd: 100 },
			NOW,
		);
		expect(status.breached).toBe('session');
		expect(status.sessionLimitPct).toBe(120);
		expect(status.monthlyLimitPct).toBe(12);
	});

	it('breaches monthly when session cap is generous but month cap is hit', () => {
		const records = [
			rec('2026-07-02T10:00:00.000Z', 40), // in month, before session
			rec('2026-07-15T10:00:00.000Z', 15), // in session too
		];
		const status = computeLimitsStatus(
			records,
			{ sessionStartMs, maxSessionSpendUsd: 100, maxMonthlySpendUsd: 50 },
			NOW,
		);
		// Session spend is only 15 (< 100) but monthly is 55 (>= 50).
		expect(status.sessionSpendUsd).toBe(15);
		expect(status.monthlySpendUsd).toBe(55);
		expect(status.breached).toBe('monthly');
	});

	it('excludes prior-month spend from the monthly window', () => {
		const records = [
			rec('2026-06-30T23:59:59.000Z', 999), // last month — excluded
			rec('2026-07-01T00:00:00.000Z', 10), // this month
		];
		const status = computeLimitsStatus(
			records,
			{ sessionStartMs, maxMonthlySpendUsd: 50 },
			NOW,
		);
		expect(status.monthlySpendUsd).toBe(10);
		expect(status.breached).toBeNull();
	});

	it('leaves pct null when a cap is unset', () => {
		const status = computeLimitsStatus(
			[rec('2026-07-15T10:00:00.000Z', 5)],
			{ sessionStartMs, maxSessionSpendUsd: 10 },
			NOW,
		);
		expect(status.monthlyLimitUsd).toBeNull();
		expect(status.monthlyLimitPct).toBeNull();
	});

	describe('recordDegradation', () => {
		let dir = '';
		beforeEach(() => {
			dir = mkdtempSync(join(tmpdir(), 'ut-cb-'));
		});
		afterEach(() => rmSync(dir, { recursive: true, force: true }));

		it('appends a degradation event to a missing summary (durable)', async () => {
			const path = join(dir, 'usage-summary.json');
			await recordDegradation(path, {
				at: new Date(NOW).toISOString(),
				scope: 'session',
				fromProvider: 'openai',
				toProvider: 'local-cheap',
				observedUsd: 12,
				limitUsd: 10,
			});
			const doc = JSON.parse(readFileSync(path, 'utf8'));
			expect(doc.degradations).toHaveLength(1);
			expect(doc.degradations[0].toProvider).toBe('local-cheap');
		});

		it('preserves prior degradations when appending', async () => {
			const path = join(dir, 'usage-summary.json');
			const event = {
				at: new Date(NOW).toISOString(),
				scope: 'monthly' as const,
				fromProvider: 'a',
				toProvider: 'b',
				observedUsd: 1,
				limitUsd: 1,
			};
			await recordDegradation(path, event);
			await recordDegradation(path, { ...event, toProvider: 'c' });
			const doc = JSON.parse(readFileSync(path, 'utf8'));
			expect(
				doc.degradations.map(
					(d: { toProvider: string }) => d.toProvider,
				),
			).toEqual(['b', 'c']);
		});
	});
});
