import { describe, expect, it } from 'vitest';

import { formatStashPolicyError, parseStashList } from './no-stashes.script';

describe('no-stashes policy', () => {
	it('parses an empty stash list', () => {
		expect(parseStashList('')).toEqual([]);
	});

	it('parses stash references and subjects', () => {
		expect(
			parseStashList(
				'stash@{0}|lefthook auto backup\nstash@{1}|WIP on develop',
			),
		).toEqual([
			{ ref: 'stash@{0}', message: 'lefthook auto backup' },
			{ ref: 'stash@{1}', message: 'WIP on develop' },
		]);
	});

	it('formats an actionable policy error', () => {
		expect(
			formatStashPolicyError([
				{ ref: 'stash@{0}', message: 'lefthook auto backup' },
			]),
		).toContain('stash@{0}: lefthook auto backup');
	});
});
