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

	it('fails closed for cancelled, failed and missing results', () => {
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
				// Flagged, not forgiven: beside a real failure a skip may
				// BE that failure's dependency collapse, and this input
				// cannot tell which.
				'skipped=skipped(unverified)',
			],
		});
	});

	it('accepts a skip when nothing else went wrong', () => {
		// Zone scoping exists so a candidate runs what it can affect. A
		// change that touches neither the site nor the SQLite package
		// SKIPS those jobs, and failing it for not touching them makes
		// the whole scoping mechanism unusable — which is exactly what
		// happened: every such candidate failed on `site=skipped,
		// sqlite-cutover-ready=skipped`.
		expect(
			summarizeValidateChecks({
				site: { result: 'skipped' },
				'sqlite-cutover-ready': { result: 'skipped' },
				tests: { result: 'success' },
				typecheck: { result: 'success' },
			}),
		).toEqual({ ok: true, total: 4, passed: 4, failed: [] });
	});

	it('does not let a skip stand in for a check that was never declared', () => {
		// Every job skipped and none run is not a scoped candidate, it is
		// a workflow that did nothing. `missing` is likewise not a skip:
		// a declared job that reported nothing did not run and did not
		// say why.
		const allSkipped = summarizeValidateChecks({
			a: { result: 'skipped' },
		});
		expect(allSkipped.ok).toBe(false);
		expect(allSkipped.failed[0]).toContain('nothing was verified');
		expect(summarizeValidateChecks({ a: {} }).ok).toBe(false);
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
