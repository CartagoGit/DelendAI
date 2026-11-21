/**
 * promotion-alerts.script.spec.ts — a promotion is refused while the
 * integration branch has an alert open, and says which.
 */
import { describe, expect, it, vi } from 'vitest';

import {
	analysisCoversTip,
	judge,
	type IForgeAsk,
	openAlertsOf,
	promotionAlertReport,
	uncoveredReport,
} from './promotion-alerts.script';

describe('promotionAlertReport', () => {
	it('[<5ms] passes a branch with no open alert', () => {
		const report = promotionAlertReport('develop', []);
		expect(report.ok).toBe(true);
		expect(report.lines.join('\n')).toContain('no open alert on develop');
	});

	it('[<5ms] refuses a branch with one, naming the rule and where it is', () => {
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
	it('[<5ms] reads the rule and the location of each row', () => {
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

	it('[<5ms] still lists a row the forge left incomplete', () => {
		expect(openAlertsOf([{ number: 8 }])).toEqual([
			{ number: 8, rule: 'unknown rule', path: 'unknown file', line: 0 },
		]);
	});
});

describe('the analysis that covers a tip', () => {
	it('[<5ms] covers the tip when it is the analysed commit or an ancestor of it', () => {
		expect(analysisCoversTip('identical')).toBe(true);
		expect(analysisCoversTip('ahead')).toBe(true);
		expect(analysisCoversTip('behind')).toBe(false);
		expect(analysisCoversTip('diverged')).toBe(false);
	});

	it('[<5ms] says what is missing when no analysis covers the tip', () => {
		expect(uncoveredReport('develop', 'a'.repeat(40), undefined)).toContain(
			'none yet',
		);
		expect(
			uncoveredReport('develop', 'a'.repeat(40), 'b'.repeat(40)),
		).toContain(`latest is ${'b'.repeat(12)}`);
	});
});

describe('judging a tip the latest analysis does not cover', () => {
	const tip = 'a'.repeat(40);
	const analysed = 'b'.repeat(40);
	const forge =
		(alerts: readonly object[]): IForgeAsk =>
		(path) => {
			if (path.startsWith('commits/'))
				return JSON.stringify({ sha: tip });
			if (path.startsWith('code-scanning/analyses'))
				return JSON.stringify([{ commit_sha: analysed }]);
			if (path.startsWith('compare/'))
				return JSON.stringify({ status: 'behind' });
			return JSON.stringify(alerts);
		};

	it('[<50ms] passes at the latest analysed commit with --latest-analysed, and refuses without it', () => {
		const log = vi
			.spyOn(console, 'log')
			.mockImplementation(() => undefined);
		const error = vi
			.spyOn(console, 'error')
			.mockImplementation(() => undefined);
		expect(judge('develop', forge([]), true)).toBe(0);
		expect(log).toHaveBeenCalledWith(
			`promotion-alerts: ${tip.slice(0, 12)} is not analysed yet; judged at the latest analysed commit ${analysed.slice(0, 12)}`,
		);
		expect(judge('develop', forge([]), false)).toBe(1);
		expect(error).toHaveBeenCalledWith(
			expect.stringContaining(
				'no completed code scanning analysis covers',
			),
		);
		log.mockRestore();
		error.mockRestore();
	});

	it('[<50ms] still fails with --latest-analysed when a high alert is open', () => {
		const log = vi
			.spyOn(console, 'log')
			.mockImplementation(() => undefined);
		const error = vi
			.spyOn(console, 'error')
			.mockImplementation(() => undefined);
		expect(
			judge(
				'develop',
				forge([{ number: 7, rule: { id: 'js/x' } }]),
				true,
			),
		).toBe(1);
		log.mockRestore();
		error.mockRestore();
	});
});
