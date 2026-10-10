/**
 * dependency-advisories.script.spec.ts — what blocks, what an exception
 * waives, and when the waiver runs out.
 */
import { describe, expect, it } from 'vitest';

import { judgeAdvisories } from './dependency-advisories.script';

const advisory = (severity: string, id = 'GHSA-aaaa-bbbb-cccc') => ({
	url: `https://github.com/advisories/${id}`,
	title: 'a flaw',
	severity,
});
const exception = (until: string) => ({
	advisory: 'GHSA-aaaa-bbbb-cccc',
	package: 'braces',
	reason: 'no patched version',
	until,
});

describe('judgeAdvisories', () => {
	it('blocks an advisory of every severity, low included', () => {
		// The forge lists low alerts on the release branch too.
		for (const severity of ['low', 'moderate', 'high', 'critical']) {
			expect(
				judgeAdvisories(
					{ hono: [advisory(severity)] },
					[],
					'2026-10-07',
				).toFix,
			).toHaveLength(1);
		}
	});

	it('waives an advisory excepted for that package until a later date', () => {
		const verdict = judgeAdvisories(
			{ braces: [advisory('high')] },
			[exception('2026-11-07')],
			'2026-10-07',
		);
		expect(verdict.toFix).toEqual([]);
		expect(verdict.excepted).toHaveLength(1);
	});

	it('fails an exception once its date has passed', () => {
		expect(
			judgeAdvisories(
				{ braces: [advisory('high')] },
				[exception('2026-10-01')],
				'2026-10-07',
			).expired,
		).toHaveLength(1);
	});

	it('does not stretch an exception to another package', () => {
		expect(
			judgeAdvisories(
				{ micromatch: [advisory('high')] },
				[exception('2026-11-07')],
				'2026-10-07',
			).toFix,
		).toHaveLength(1);
	});
});
