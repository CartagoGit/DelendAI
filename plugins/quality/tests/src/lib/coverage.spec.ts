import { describe, expect, it } from 'vitest';

import { summarizeCoverage } from '../../../src/lib/tools/coverage';

describe('summarizeCoverage', () => {
	it('aggregates line, branch and function metrics from istanbul coverage json', () => {
		const raw = JSON.stringify({
			'src/a.ts': {
				statementMap: {
					1: { start: { line: 1 } },
					2: { start: { line: 2 } },
				},
				s: { 1: 1, 2: 0 },
				b: { 1: [1, 0] },
				f: { 1: 1, 2: 0 },
			},
		});
		const summary = summarizeCoverage(raw);
		expect(summary.lines).toEqual({ covered: 1, total: 2, pct: 50 });
		expect(summary.branches).toEqual({ covered: 1, total: 2, pct: 50 });
		expect(summary.functions).toEqual({ covered: 1, total: 2, pct: 50 });
	});
});
