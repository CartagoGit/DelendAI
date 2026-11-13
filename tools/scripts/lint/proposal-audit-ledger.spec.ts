/**
 * proposal-audit-ledger.spec.ts — the audits a plan contains are read
 * from its frontmatter, as a list or inline.
 */
import { describe, expect, it } from 'vitest';

import { containedAudits } from './proposal-audit-ledger.script';

describe('containedAudits', () => {
	it('reads a block list of ids or `{ id }` entries', () => {
		expect(
			containedAudits(
				'---\nid: q1\ncontains:\n  audits:\n    - id: a00095\n    - a00094\n  proposals:\n    - f00001\n---\n',
			),
		).toEqual(['a00095', 'a00094']);
	});

	it('reads an inline list, and nothing from a plan with no audits', () => {
		expect(
			containedAudits(
				'---\ncontains:\n  audits: [a00095, "a00094"]\n---\n',
			),
		).toEqual(['a00095', 'a00094']);
		expect(containedAudits('---\nid: q1\n---\n')).toEqual([]);
	});
});
