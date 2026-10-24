/**
 * advise-spend.spec.ts — the cost-analyst output shape + risk grading (S7).
 */
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
	buildSpendAdvice,
	emptyCurrentState,
	readSpendState,
	type ISpendCurrentState,
	type IUsageBucket,
} from '../../../../src/lib/tools/advise-spend.tool';

const bucket = (
	key: string,
	costUsd: number,
	autoBypassed = 0,
): IUsageBucket => ({
	key,
	calls: 1,
	inputTokens: 0,
	outputTokens: 0,
	totalTokens: 0,
	costUsd,
	errors: 0,
	autoBypassed,
});

const state = (over: Partial<ISpendCurrentState>): ISpendCurrentState => ({
	...emptyCurrentState(),
	...over,
});

describe('buildSpendAdvice', () => {
	it('is non-destructive and low-noise when there is nothing to say', () => {
		const advice = buildSpendAdvice(emptyCurrentState());
		expect(advice.recommendations).toEqual([]);
		expect(advice.observations[0]).toMatch(/No spend caps/);
	});

	it('raises a HIGH risk recommendation when a session cap is breached', () => {
		const advice = buildSpendAdvice(
			state({
				limitsStatus: {
					sessionSpendUsd: 12,
					sessionLimitUsd: 10,
					sessionLimitPct: 120,
					monthlySpendUsd: 12,
					monthlyLimitUsd: null,
					monthlyLimitPct: null,
					breached: 'session',
				},
			}),
		);
		const rec = advice.recommendations.find((r) =>
			/session/i.test(r.title),
		);
		expect(rec?.riskLevel).toBe('high');
	});

	it('warns at MEDIUM risk when approaching (>=80%) a monthly cap', () => {
		const advice = buildSpendAdvice(
			state({
				limitsStatus: {
					sessionSpendUsd: 0,
					sessionLimitUsd: null,
					sessionLimitPct: null,
					monthlySpendUsd: 45,
					monthlyLimitUsd: 50,
					monthlyLimitPct: 90,
					breached: null,
				},
			}),
		);
		const rec = advice.recommendations.find((r) =>
			/monthly/i.test(r.title),
		);
		expect(rec?.riskLevel).toBe('medium');
		expect(rec?.detail).toMatch(/\$5\.00/); // $50 - $45 remaining
	});

	it('flags a dominant provider at LOW risk', () => {
		const advice = buildSpendAdvice(
			state({ byProvider: [bucket('openai', 90), bucket('local', 10)] }),
		);
		const rec = advice.recommendations.find((r) =>
			/dominates/i.test(r.title),
		);
		expect(rec?.riskLevel).toBe('low');
	});

	it('flags auto-bypass at MEDIUM risk and observes the count', () => {
		const advice = buildSpendAdvice(
			state({ byProvider: [bucket('openai', 5, 3)] }),
		);
		const rec = advice.recommendations.find((r) =>
			/auto-bypass/i.test(r.title),
		);
		expect(rec?.riskLevel).toBe('medium');
		expect(advice.observations.join(' ')).toMatch(/3 invocation/);
	});
});

describe('readSpendState', () => {
	let dir = '';
	beforeEach(() => {
		dir = mkdtempSync(join(tmpdir(), 'or-advise-'));
	});
	afterEach(() => rmSync(dir, { recursive: true, force: true }));

	it('returns the empty state for a missing summary', async () => {
		const { state: s, windowDays } = await readSpendState(
			join(dir, 'nope.json'),
		);
		expect(s.byProvider).toEqual([]);
		expect(windowDays).toBe(0);
	});

	it('normalises a real summary file (buckets + limitsStatus)', async () => {
		const path = join(dir, 'usage-summary.json');
		writeFileSync(
			path,
			JSON.stringify({
				windowDays: 7,
				byProvider: [
					{
						key: 'openai',
						calls: 2,
						inputTokens: 0,
						outputTokens: 0,
						totalTokens: 0,
						costUsd: 9,
						errors: 0,
						autoBypassed: 1,
					},
				],
				limitsStatus: {
					sessionSpendUsd: 9,
					sessionLimitUsd: 10,
					sessionLimitPct: 90,
					monthlySpendUsd: 9,
					monthlyLimitUsd: null,
					monthlyLimitPct: null,
					breached: null,
				},
			}),
			'utf8',
		);
		const { state: s, windowDays } = await readSpendState(path);
		expect(windowDays).toBe(7);
		expect(s.byProvider[0]?.autoBypassed).toBe(1);
		expect(s.limitsStatus.sessionLimitPct).toBe(90);
	});
});
