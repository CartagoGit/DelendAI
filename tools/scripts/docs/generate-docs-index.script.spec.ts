#!/usr/bin/env bun
/**
 * generate-docs-index.script.spec.ts
 *
 * The index is copied prose: text written for one file, rendered inside
 * another. Every case here is about that move going wrong quietly.
 */
import { describe, expect, it } from 'vitest';

import {
	flattenMarkdown,
	relativeToIndex,
	renderDocsIndex,
	summaryOf,
	titleOf,
} from './generate-docs-index.script.ts';

describe('titleOf', () => {
	it('takes the first heading', () => {
		expect(titleOf('# Architecture\n\ntext', 'docs/A.md')).toBe(
			'Architecture',
		);
	});

	it('drops a trailing proposal id, in either shape', () => {
		expect(titleOf('# Docs manual vs generated — d00011', 'a.md')).toBe(
			'Docs manual vs generated',
		);
		expect(titleOf('# Deprecation policy (f00152)', 'a.md')).toBe(
			'Deprecation policy',
		);
	});

	it('names the file when it has no heading, rather than omitting it', () => {
		// A guide with no heading is still a guide. An index that
		// silently drops it is worse than one that names it plainly.
		expect(titleOf('no heading here', 'docs/delendai/ODD.md')).toBe(
			'ODD.md',
		);
	});
});

describe('summaryOf', () => {
	it('prefers the blockquote these files open with', () => {
		expect(summaryOf('# T\n\n> The one-line summary.\n\nBody.')).toBe(
			'The one-line summary.',
		);
	});

	it('falls back to the first ordinary sentence', () => {
		expect(summaryOf('# T\n\nFirst sentence. Second one.')).toBe(
			'First sentence.',
		);
	});

	it('skips html comments and rules rather than quoting them', () => {
		expect(summaryOf('# T\n\n<!-- note -->\n---\nReal prose.')).toBe(
			'Real prose.',
		);
	});

	it('is empty when the next thing is another heading', () => {
		expect(summaryOf('# T\n\n## Section\n\ntext')).toBe('');
	});
});

describe('flattenMarkdown', () => {
	it('keeps a link text and drops the target', () => {
		// The correctness case, not tidying: a relative link written for
		// docs/delendai/CODE-MAP.md resolves against a different
		// directory once copied here, so carrying it over would
		// manufacture a broken link on every regeneration.
		expect(flattenMarkdown('Track H of [q00006](proposals/x.md).')).toBe(
			'Track H of q00006.',
		);
	});

	it('escapes a pipe so one cell stays one cell', () => {
		expect(flattenMarkdown('a | b')).toBe('a \\| b');
	});

	it('flattens a line break, which would end the row', () => {
		expect(flattenMarkdown('one\ntwo')).toBe('one two');
	});
});

describe('relativeToIndex', () => {
	it('resolves a sibling guide from the index it lives in', () => {
		expect(relativeToIndex('docs/delendai/CI-GATES.md')).toBe(
			'CI-GATES.md',
		);
	});

	it('climbs out for a guide one directory up', () => {
		expect(relativeToIndex('docs/PRIVACY.md')).toBe('../PRIVACY.md');
	});
});

describe('renderDocsIndex', () => {
	it('renders a linked table', () => {
		const table = renderDocsIndex([
			{
				path: 'docs/delendai/CI-GATES.md',
				title: 'CI Gates',
				summary: 'What each gate asserts.',
			},
		]);

		expect(table).toContain('| [CI Gates](CI-GATES.md) |');
		expect(table).toContain('What each gate asserts.');
	});
});
