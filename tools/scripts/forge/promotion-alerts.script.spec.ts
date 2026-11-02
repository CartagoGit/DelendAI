/**
 * promotion-alerts.script.spec.ts — a promotion is refused while the
 * integration branch has an alert open, and says which.
 */
import { describe, expect, it } from 'vitest';

import { openAlertsOf, promotionAlertReport } from './promotion-alerts.script';

describe('promotionAlertReport', () => {
	it('passes a branch with no open alert', () => {
		const report = promotionAlertReport('develop', []);
		expect(report.ok).toBe(true);
		expect(report.lines.join('\n')).toContain('no open alert on develop');
	});

	it('refuses a branch with one, naming the rule and where it is', () => {
		const report = promotionAlertReport('develop', [
			{
				number: 439,
				rule: 'js/polynomial-redos',
				path: 'a/b.ts',
				line: 35,
			},
		]);
		expect(report.ok).toBe(false);
		expect(report.lines.join('\n')).toContain(
			'#439 js/polynomial-redos — a/b.ts:35',
		);
	});
});

describe('openAlertsOf', () => {
	it('reads the rule and the location of each row', () => {
		expect(
			openAlertsOf([
				{
					number: 7,
					rule: { id: 'js/x' },
					most_recent_instance: {
						location: { path: 'p.ts', start_line: 3 },
					},
				},
			]),
		).toEqual([{ number: 7, rule: 'js/x', path: 'p.ts', line: 3 }]);
	});

	it('still lists a row the forge left incomplete', () => {
		expect(openAlertsOf([{ number: 8 }])).toEqual([
			{ number: 8, rule: 'unknown rule', path: 'unknown file', line: 0 },
		]);
	});
});
