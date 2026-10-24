import { describe, expect, it } from 'vitest';

import { lintFilenameAndFolder } from '@delendai/proposals/lib/proposals/filename-linter';

describe('lintFilenameAndFolder — the status folder', () => {
	const done = { id: 'x00001', status: 'done' };

	it('is the nearest status-named ancestor, not the first from the root', () => {
		expect(
			lintFilenameAndFolder(
				'/home/me/review/repo/docs/delendai/proposals/done/fixes/x00001-a.md',
				done,
			),
		).toEqual([]);
	});

	it('still flags a proposal in the wrong folder', () => {
		const issues = lintFilenameAndFolder(
			'/home/me/done/repo/docs/delendai/proposals/review/x00001-a.md',
			done,
		);
		expect(issues.map((issue) => issue.message).join(' ')).toContain(
			'nearest status ancestor is "review"',
		);
	});
});
