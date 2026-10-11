import { describe, expect, it } from 'vitest';

import { summarizeValidateChecks } from '../../scripts/ci/validate-summary.script';

describe('summarizeValidateChecks', () => {
	it('passes only when every declared check succeeds', () => {
		expect(
			summarizeValidateChecks({
				tests: { result: 'success' },
				typecheck: { result: 'success' },
			}),
		).toEqual({
			ok: true,
			total: 2,
			passed: 2,
			failed: [],
		});
	});

	it('fails closed for skipped, cancelled, failed, and missing results', () => {
		expect(
			summarizeValidateChecks({
				cancelled: { result: 'cancelled' },
				failed: { result: 'failure' },
				missing: {},
				skipped: { result: 'skipped' },
			}),
		).toEqual({
			ok: false,
			total: 4,
			passed: 0,
			failed: [
				'cancelled=cancelled',
				'failed=failure',
				'missing=missing',
				'skipped=skipped',
			],
		});
	});

	it('honours a skip the scope plan explicitly decided', () => {
		// Zone scoping exists so a candidate runs what it can affect. A
		// change touching neither the site nor the SQLite package skips
		// those jobs, and failing it for not touching them made the whole
		// mechanism unusable: "FAILED (22/24); failures=site=skipped,
		// sqlite-cutover-ready=skipped".
		expect(
			summarizeValidateChecks({
				'plan-scope': {
					result: 'success',
					outputs: {
						plan: JSON.stringify({
							site: false,
							'sqlite-cutover-ready': false,
							tests: true,
						}),
					},
				},
				site: { result: 'skipped' },
				'sqlite-cutover-ready': { result: 'skipped' },
				tests: { result: 'success' },
			}).ok,
		).toBe(true);
	});

	it('still fails a skip the plan said was IN scope', () => {
		// This is the masked failure: a job the plan required, skipped
		// because its dependency collapsed. It reports the same word as a
		// scoped skip and must not be read the same way.
		expect(
			summarizeValidateChecks({
				'plan-scope': {
					result: 'success',
					outputs: { plan: JSON.stringify({ site: true }) },
				},
				site: { result: 'skipped' },
				tests: { result: 'success' },
			}).failed,
		).toEqual(['site=skipped']);
	});

	it('fails closed when the plan cannot be read', () => {
		// An unreadable plan justifies no skip at all. x00534 S2 is the
		// invariant here: a job that produced no result must not be read
		// as consent, and a corrupt plan is not a decision.
		for (const plan of ['not json at all', '[]', '']) {
			expect(
				summarizeValidateChecks({
					'plan-scope': { result: 'success', outputs: { plan } },
					site: { result: 'skipped' },
					tests: { result: 'success' },
				}).ok,
			).toBe(false);
		}
	});

	it('refuses a plan that excused every single job', () => {
		// Green having verified nothing is the shape of #100.
		const report = summarizeValidateChecks({
			'plan-scope': {
				result: 'skipped',
				outputs: {
					plan: JSON.stringify({ a: false, 'plan-scope': false }),
				},
			},
			a: { result: 'skipped' },
		});

		expect(report.ok).toBe(false);
		expect(report.failed[0]).toContain('nothing was verified');
	});

	it('fails closed when no checks are provided', () => {
		expect(summarizeValidateChecks({})).toEqual({
			ok: false,
			total: 0,
			passed: 0,
			failed: [],
		});
	});
});
