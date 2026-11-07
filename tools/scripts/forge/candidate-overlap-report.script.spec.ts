/**
 * candidate-overlap-report.script.spec.ts — the report counts the merges,
 * the ones that shared a file, and which files, derived or not.
 */
import { describe, expect, it } from 'vitest';

import { overlapReport } from './candidate-overlap-report.script';

describe('overlapReport', () => {
	it('counts merges, overlapping merges and shared files', () => {
		const report = overlapReport(
			[
				{ pullRequest: 1, shared: [] },
				{ pullRequest: 1, shared: ['docs/BUDGETS.md', 'src/a.ts'] },
				{
					pullRequest: 2,
					shared: ['docs/BUDGETS.md', 'docs/BUDGETS.md'],
				},
				{ pullRequest: 3, shared: [] },
			],
			(path) => path.startsWith('docs/'),
		);
		expect(report).toEqual({
			merges: 4,
			overlapping: 2,
			pullRequests: 3,
			files: [
				{ path: 'docs/BUDGETS.md', times: 2, derived: true },
				{ path: 'src/a.ts', times: 1, derived: false },
			],
		});
	});
});
