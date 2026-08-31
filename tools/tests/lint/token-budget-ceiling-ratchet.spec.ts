/**
 * token-budget-ceiling-ratchet.spec.ts — r00036 (AUD-B03).
 *
 * Exercises the pure ratchet helpers against synthetic snapshots so the
 * four required behaviours are each covered independently:
 *   - raising a `hard` ceiling with no exception -> fails
 *   - raising with an expired exception -> fails
 *   - raising with a valid, unexpired exception -> passes
 *   - lowering a ceiling -> always passes, exception or not
 *
 * The real contract is covered by the gate itself running as
 * `lint:token-budget-ceiling-ratchet`.
 */
import { describe, expect, it } from 'vitest';

import {
	buildRatchetReport,
	classifyUpdateViolations,
	flattenTokenBudgetCeilings,
	parseBudgetExceptions,
	isExceptionExpired,
	type IBudgetCeilingSnapshot,
} from '../../scripts/lint/token-budget-ceiling-ratchet.script';
import type { ITokenBudgetRegistry } from '@mcp-vertex/core/public';

const baseline: IBudgetCeilingSnapshot = {
	'presets.minimal.toolsList.hard': 64_000,
	'presets.minimal.toolsList.warning': 58_000,
};

describe('token-budget-ceiling-ratchet', () => {
	it('fails when a hard ceiling is raised with no documented exception', () => {
		const current: IBudgetCeilingSnapshot = {
			'presets.minimal.toolsList.hard': 70_000,
			'presets.minimal.toolsList.warning': 58_000,
		};
		const report = buildRatchetReport(current, baseline, []);
		expect(report.ok).toBe(false);
		expect(report.violations).toHaveLength(1);
		expect(report.violations[0]?.key).toBe(
			'presets.minimal.toolsList.hard',
		);
		expect(report.violations[0]?.kind).toBe('raised-without-exception');
	});

	it('fails when the matching exception has already expired', () => {
		const current: IBudgetCeilingSnapshot = {
			'presets.minimal.toolsList.hard': 70_000,
			'presets.minimal.toolsList.warning': 58_000,
		};
		const report = buildRatchetReport(
			current,
			baseline,
			[
				{
					key: 'presets.minimal.toolsList.hard',
					expiresOn: '2026-01-01',
				},
			],
			new Date('2026-08-27T00:00:00Z'),
		);
		expect(report.ok).toBe(false);
		expect(report.violations[0]?.kind).toBe('exception-expired');
	});

	it('passes when the exception is valid and not yet expired', () => {
		const current: IBudgetCeilingSnapshot = {
			'presets.minimal.toolsList.hard': 70_000,
			'presets.minimal.toolsList.warning': 58_000,
		};
		const report = buildRatchetReport(
			current,
			baseline,
			[
				{
					key: 'presets.minimal.toolsList.hard',
					expiresOn: '2026-12-31',
				},
			],
			new Date('2026-08-27T00:00:00Z'),
		);
		expect(report.ok).toBe(true);
	});

	it('always passes when a ceiling is lowered, exception or not', () => {
		const current: IBudgetCeilingSnapshot = {
			'presets.minimal.toolsList.hard': 60_000,
			'presets.minimal.toolsList.warning': 55_000,
		};
		const report = buildRatchetReport(current, baseline, []);
		expect(report.ok).toBe(true);
	});

	it('treats a key absent from the baseline as a first observation, not a raise', () => {
		const current: IBudgetCeilingSnapshot = {
			'presets.minimal.toolsList.hard': 64_000,
			'presets.minimal.toolsList.warning': 58_000,
			'presets.minimal.toolsList.marginalPluginHard': 7_000,
		};
		const report = buildRatchetReport(current, baseline, []);
		expect(report.ok).toBe(true);
	});

	it('holding a ceiling steady never requires an exception', () => {
		const report = buildRatchetReport(baseline, baseline, []);
		expect(report.ok).toBe(true);
	});

	it('classifies an expired exception as a blocking --update refusal', () => {
		const current: IBudgetCeilingSnapshot = {
			'presets.minimal.toolsList.hard': 70_000,
			'presets.minimal.toolsList.warning': 58_000,
		};
		const report = buildRatchetReport(
			current,
			baseline,
			[
				{
					key: 'presets.minimal.toolsList.hard',
					expiresOn: '2026-01-01',
				},
			],
			new Date('2026-08-27T00:00:00Z'),
		);
		const buckets = classifyUpdateViolations(report.violations);
		expect(buckets.expired).toHaveLength(1);
		expect(buckets.undocumented).toHaveLength(0);
		expect(buckets.expired[0]?.kind).toBe('exception-expired');
	});
});

describe('isExceptionExpired', () => {
	it('is expired the day of and after the expiry date (UTC)', () => {
		const today = new Date('2026-09-30T12:00:00Z');
		expect(isExceptionExpired('2026-09-30', today)).toBe(true);
		expect(isExceptionExpired('2026-10-01', today)).toBe(false);
	});

	it('treats a malformed date as expired', () => {
		expect(isExceptionExpired('not-a-date')).toBe(true);
	});
});

describe('parseBudgetExceptions', () => {
	it('parses a pending/expires pair into an exception entry', () => {
		const source = [
			'export const TOKEN_BUDGETS = {',
			'  swarm: {',
			'    toolsList: {',
			'      // budget-exception-pending: presets.swarm.toolsList.hard',
			'      // budget-exception-expires: 2026-09-30',
			'      hard: 210_000,',
			'    },',
			'  },',
			'};',
		].join('\n');
		const exceptions = parseBudgetExceptions(source);
		expect(exceptions).toEqual([
			{ key: 'presets.swarm.toolsList.hard', expiresOn: '2026-09-30' },
		]);
	});

	it('parses multiple comma-separated keys under one exception', () => {
		const source = [
			'// budget-exception-pending: presets.swarm.toolsList.hard, presets.swarm.toolsList.warning',
			'// budget-exception-expires: 2026-09-30',
			'hard: 210_000,',
		].join('\n');
		const exceptions = parseBudgetExceptions(source);
		expect(exceptions.map((e) => e.key)).toEqual([
			'presets.swarm.toolsList.hard',
			'presets.swarm.toolsList.warning',
		]);
	});

	it('ignores a pending comment with no matching expires line', () => {
		const source = [
			'// budget-exception-pending: presets.swarm.toolsList.hard',
			'hard: 210_000,',
		].join('\n');
		expect(parseBudgetExceptions(source)).toEqual([]);
	});
});

describe('flattenTokenBudgetCeilings', () => {
	it('extracts hard/warning/marginal fields with dotted paths, skipping non-ceiling fields', () => {
		const registry = {
			toolPayloads: {
				overviewFull: {
					hard: 100,
					warning: 90,
					releaseRelativePercent: 20,
				},
			},
			presets: {
				swarm: {
					toolsList: {
						hard: 210_000,
						warning: 204_000,
						releaseRelativePercent: 20,
						marginalPluginHard: 80_000,
						marginalPluginWarning: 70_000,
					},
					overviewCompact: {
						hard: 6_450,
						warning: 6_350,
						releaseRelativePercent: 20,
					},
				},
			},
		} as unknown as ITokenBudgetRegistry;
		const flat = flattenTokenBudgetCeilings(registry);
		expect(flat).toEqual({
			'toolPayloads.overviewFull.hard': 100,
			'toolPayloads.overviewFull.warning': 90,
			'presets.swarm.toolsList.hard': 210_000,
			'presets.swarm.toolsList.warning': 204_000,
			'presets.swarm.toolsList.marginalPluginHard': 80_000,
			'presets.swarm.toolsList.marginalPluginWarning': 70_000,
			'presets.swarm.overviewCompact.hard': 6_450,
			'presets.swarm.overviewCompact.warning': 6_350,
		});
	});
});
