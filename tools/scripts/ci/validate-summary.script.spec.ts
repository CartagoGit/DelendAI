/**
 * validate-summary.script.spec.ts — x00534 S2.
 *
 * `delendai-validate` is the single required status check on `develop`, and
 * the whole point of the summarizer is that a job which never produced a
 * result must not be read as consent. The behaviour was already correct;
 * what was missing was a test pinning it, so a future "let's not be so
 * strict about skipped jobs" edit has something to break.
 */
import { describe, expect, it } from 'vitest';

import {
	summarizeValidateChecks,
	type IValidateSummaryInput,
} from './validate-summary.script';

const checks = (entries: Record<string, string>): IValidateSummaryInput =>
	Object.fromEntries(
		Object.entries(entries).map(([job, result]) => [job, { result }]),
	);

describe('summarizeValidateChecks (x00534 S2)', () => {
	it('passes only when every job succeeded', () => {
		const report = summarizeValidateChecks(
			checks({ tests: 'success', typecheck: 'success' }),
		);

		expect(report.ok).toBe(true);
		expect(report.total).toBe(2);
		expect(report.passed).toBe(2);
		expect(report.failed).toEqual([]);
	});

	it.each(['failure', 'skipped', 'cancelled'])(
		'fails when a dependency is %s, and names it',
		(result) => {
			const report = summarizeValidateChecks(
				checks({ tests: 'success', 'develop-protection-live': result }),
			);

			expect(report.ok).toBe(false);
			expect(report.failed).toEqual([
				`develop-protection-live=${result}`,
			]);
			expect(report.passed).toBe(1);
		},
	);

	it('reports a job with no result at all as missing rather than ignoring it', () => {
		const report = summarizeValidateChecks({
			tests: { result: 'success' },
			'pack-smoke': {},
		});

		expect(report.ok).toBe(false);
		expect(report.failed).toEqual(['pack-smoke=missing']);
	});

	it('refuses an empty dependency set instead of vacuously passing', () => {
		const report = summarizeValidateChecks({});

		expect(report.ok).toBe(false);
		expect(report.total).toBe(0);
	});

	it('names every failing job, sorted, so the log is stable', () => {
		const report = summarizeValidateChecks(
			checks({
				typecheck: 'skipped',
				'lint-biome': 'failure',
				tests: 'success',
			}),
		);

		expect(report.failed).toEqual([
			'lint-biome=failure',
			'typecheck=skipped',
		]);
	});
});
