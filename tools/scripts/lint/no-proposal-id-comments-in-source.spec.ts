/**
 * no-proposal-id-comments-in-source.spec.ts — c00141 (Track H).
 *
 * Verifies the lint that detects stale proposal-id comments (fNNNNN /
 * xNNNNN / etc.) in source code. The rule: proposal traceability lives
 * in git + the proposal graph, not in source comments. Legacy comments
 * are handled by a baseline; new ones should be flagged.
 */
import { describe, expect, it } from 'vitest';

import { scanText } from './no-proposal-id-comments-in-source.script';

const scan = (text: string): ReturnType<typeof scanText> =>
	scanText(text, '/abs/file.ts', 'file.ts');

describe('c00141 — no proposal-id comments in source', () => {
	it('flags a bare fNNNNN comment', () => {
		const findings = scan('// f00053\nconst x = 1;\n');
		expect(findings).toHaveLength(1);
		expect(findings[0]?.match).toBe('// f00053');
		expect(findings[0]?.proposalPrefix).toBe('f');
		expect(findings[0]?.proposalDigits).toBe('00053');
	});

	it('flags xNNNNN and cNNNNN prefixes', () => {
		expect(scan('// x00273\n').map((f) => f.proposalPrefix)).toEqual(['x']);
		expect(scan('// c00141\n').map((f) => f.proposalPrefix)).toEqual(['c']);
	});

	it('does not flag a TODO/FIXME marker referencing a proposal', () => {
		const findings = scan('// TODO f00053: fix this later\n');
		expect(findings).toHaveLength(0);
	});

	it('does not flag a @ts-* directive', () => {
		const findings = scan('// @ts-expect-error x00001\n');
		expect(findings).toHaveLength(0);
	});

	it('reports line and column', () => {
		const findings = scan('line one\n// f00053 here\n');
		expect(findings[0]?.line).toBe(2);
		expect(findings[0]?.column).toBe(1);
	});
});
