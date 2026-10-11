/**
 * The index says what each proposal is (x00738): its title is carried from
 * the frontmatter, so the agent catalog no longer shows an id as a title.
 */
import { describe, expect, it } from 'vitest';

import {
	registryEntryFrom,
	toIndexEntry,
} from '@delendai/proposals/lib/proposals/registry-entry.helper';

const entryFor = (parsed: Record<string, unknown>) => {
	const outcome = registryEntryFrom({
		name: 'f00538-forward-sync.md',
		relPath: 'ready/feats/f00538-forward-sync.md',
		parsed,
	});
	if (!outcome.ok) throw new Error(outcome.detail);
	return toIndexEntry(outcome.entry);
};

describe('an index entry carries the proposal title', () => {
	it('takes the title from the frontmatter, trimmed, right after the id', () => {
		const entry = entryFor({
			id: 'f00538',
			title: '  Forward-sync the release branch  ',
			status: 'ready',
			date: '2026-09-15',
		});
		expect(entry).toMatchObject({
			id: 'f00538',
			title: 'Forward-sync the release branch',
			date: '2026-09-15',
		});
		expect(Object.keys(entry).slice(0, 2)).toEqual(['id', 'title']);
	});

	it('writes no title for a proposal without one', () => {
		expect(
			'title' in entryFor({ id: 'f00538', status: 'ready', title: '  ' }),
		).toBe(false);
	});
});
