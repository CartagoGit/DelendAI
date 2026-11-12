/**
 * frontmatter.spec.ts — r00643 S1: proposal frontmatter is parsed once,
 * as YAML, and a block YAML refuses is read by the old tolerant parser
 * with the refusal reported.
 */
import { describe, expect, it } from 'bun:test';

import {
	extractYamlBlock,
	parseFrontmatterBlock,
	parseProposalFrontmatter,
} from '../../../src/lib/frontmatter.helper';

describe('parseProposalFrontmatter', () => {
	it('reads YAML: comments are not values, flow maps and inline arrays are data', () => {
		const parsed = parseProposalFrontmatter(
			[
				'id: q00005',
				'date: 2026-09-25',
				'shipped-in: ["58ef6288"]',
				'related:',
				'  - q00003 # predecessor',
				'contains:',
				'  proposals:',
				'    - { id: x00246, kind: fix, required: true }',
			].join('\n'),
		);

		expect(parsed.error).toBeUndefined();
		expect(parsed.value).toEqual({
			id: 'q00005',
			date: '2026-09-25',
			'shipped-in': ['58ef6288'],
			related: ['q00003'],
			contains: {
				proposals: [{ id: 'x00246', kind: 'fix', required: true }],
			},
		});
	});

	it('reads a block YAML refuses with the tolerant parser, and says why', () => {
		const parsed = parseProposalFrontmatter(
			'id: x00152\nclosed-evidence:\n  - S1: 7cbb8cfb feat(x00152): helper\n',
		);

		expect(parsed.error).toBeDefined();
		expect(parsed.value.id).toBe('x00152');
	});

	it('reads an empty block as no keys', () => {
		expect(parseProposalFrontmatter('')).toEqual({ value: {} });
		expect(parseFrontmatterBlock('')).toEqual({});
	});

	it('takes the block between the first pair of --- lines', () => {
		expect(extractYamlBlock('---\nid: a\n---\n# A\n')).toBe('id: a');
		expect(extractYamlBlock('# no frontmatter\n')).toBeNull();
	});
});
