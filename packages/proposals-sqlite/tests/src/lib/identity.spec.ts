import { describe, expect, it } from 'vitest';

import { resolveProposalIdentity } from '../../../src/lib/identity';
import { parseProposalMarkdown } from '../../../src/lib/markdown-parser';

describe('identity (q00022 S2)', () => {
	it('resolves uid strictly from frontmatter id', () => {
		const parsed = parseProposalMarkdown(
			'ready/fixes/x00512.md',
			`---\nid: x00512\n---\n# title`,
		);
		expect(resolveProposalIdentity(parsed)).toEqual({
			uid: 'x00512',
			slug: 'x00512',
		});
	});

	it('quarantines markdown without frontmatter id', () => {
		const parsed = parseProposalMarkdown(
			'ready/fixes/unnamed.md',
			`---\ntitle: no id\n---\n# title`,
		);
		expect(resolveProposalIdentity(parsed)).toEqual({
			reason: 'missing-frontmatter-id',
			path: 'ready/fixes/unnamed.md',
		});
	});
});
