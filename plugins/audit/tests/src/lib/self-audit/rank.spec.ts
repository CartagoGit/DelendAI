/**
 * rank.spec.ts — f00139 S2 acceptance for the pure self-audit ranker.
 * Verifies deterministic scoring, truncation, tie-breaking, effort
 * buckets and weight overrides without invoking any scanners.
 */

import { describe, expect, it } from 'vitest';

import {
	DEFAULT_BACKLOG_WEIGHTS,
	rankFindings,
} from '../../../../src/lib/self-audit/rank';
import type { IFinding } from '@delendai/core/public';

const finding = (
	ruleId: string,
	severity: IFinding['severity'],
	overrides: Partial<IFinding> = {},
): IFinding => ({
	ruleId,
	severity,
	message: ruleId,
	...overrides,
});

describe('rankFindings', () => {
	it('returns an empty backlog for an empty findings list', () => {
		expect(rankFindings([])).toEqual([]);
	});

	it('orders findings by severity from highest to lowest', () => {
		const backlog = rankFindings([
			finding('info-note', 'info'),
			finding('critical-issue', 'critical'),
			finding('medium-issue', 'medium'),
		]);

		expect(backlog.map((item) => item.finding.ruleId)).toEqual([
			'critical-issue',
			'medium-issue',
			'info-note',
		]);
		expect(backlog[0]?.rank).toBe(1);
		expect(backlog.at(-1)?.finding.severity).toBe('info');
	});

	it('truncates the backlog to the requested limit', () => {
		const backlog = rankFindings(
			[
				finding('critical-issue', 'critical'),
				finding('high-issue', 'high'),
				finding('low-issue', 'low'),
			],
			{ limit: 2 },
		);

		expect(backlog).toHaveLength(2);
		expect(backlog.map((item) => item.finding.ruleId)).toEqual([
			'critical-issue',
			'high-issue',
		]);
	});

	it('breaks ties by lexicographic ruleId', () => {
		const backlog = rankFindings([
			finding('z-last', 'low'),
			finding('a-first', 'low'),
		]);

		expect(backlog.map((item) => item.finding.ruleId)).toEqual([
			'a-first',
			'z-last',
		]);
	});

	it('throws RangeError when limit is less than 1', () => {
		expect(() => rankFindings([], { limit: 0 })).toThrow(RangeError);
	});

	it('treats cve findings as cheaper than bundle findings', () => {
		const backlog = rankFindings([
			finding('bundle-size', 'medium', {
				location: { file: 'src/app.ts', line: 12 },
			}),
			finding('cve-2026-0001', 'medium', {
				location: { file: 'src/app.ts', line: 12 },
			}),
		]);

		expect(backlog.map((item) => item.finding.ruleId)).toEqual([
			'cve-2026-0001',
			'bundle-size',
		]);
		expect(backlog[0]?.score).toBeGreaterThan(backlog[1]?.score ?? 0);
	});

	it('honours weight overrides when ranking the backlog', () => {
		const findings = [
			finding('medium-cheap', 'medium', {
				location: { file: 'src/app.ts', line: 10 },
				message: 'medium cheap',
				ruleId: 'cve-2026-0002',
			}),
			finding('high-refactor', 'high', {
				message: 'high refactor',
				ruleId: 'bundle-high',
			}),
		];

		const defaultBacklog = rankFindings(findings);
		const weightedBacklog = rankFindings(findings, {
			weights: {
				...DEFAULT_BACKLOG_WEIGHTS,
				severity: DEFAULT_BACKLOG_WEIGHTS.severity * 2,
			},
		});

		expect(defaultBacklog.map((item) => item.finding.ruleId)).toEqual([
			'cve-2026-0002',
			'bundle-high',
		]);
		expect(weightedBacklog.map((item) => item.finding.ruleId)).toEqual([
			'bundle-high',
			'cve-2026-0002',
		]);
	});
});
