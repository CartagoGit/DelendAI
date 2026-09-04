/**
 * proposal-hygiene.spec.ts — b00240.
 *
 * The cases that matter here are the ones the gate must NOT fire on. A
 * hygiene gate that reports a proposal for describing the defect it exists
 * to catch gets baselined into silence within a week, and then it is
 * decoration.
 */
import { describe, expect, it } from 'vitest';

import {
	checkProposal,
	findDuplicates,
	fingerprintProposal,
} from './proposal-hygiene.script';

const proposal = (body: string): string =>
	[
		'---',
		'id: x00001',
		'title: "t"',
		'---',
		'',
		'# x00001 — t',
		'',
		body,
	].join('\n');

describe('unfilled scaffold', () => {
	it('flags a placeholder left where the scaffold put it', () => {
		const findings = checkProposal(
			'p.md',
			proposal('## Goal\n\nTODO: describe the goal.\n'),
		);
		expect(findings).toHaveLength(1);
		expect(findings[0]?.rule).toBe('unfilled-scaffold');
	});

	it('flags a placeholder left as a list item', () => {
		const findings = checkProposal(
			'p.md',
			proposal(
				'## non-goals\n\n- TODO: what this proposal deliberately skips.\n',
			),
		);
		expect(findings).toHaveLength(1);
	});

	it('does NOT flag prose that quotes the placeholder', () => {
		// The real false positive: the proposal that documents this gate
		// names the placeholder in a sentence, and a substring search
		// reported it for the explanation.
		const findings = checkProposal(
			'p.md',
			proposal(
				'## Goal\n\nReal goal.\n\n## why\n\nAmbas se quedaron con `TODO: describe the goal.` en el cuerpo.\n',
			),
		);
		expect(findings).toEqual([]);
	});
});

describe('heading/id mismatch', () => {
	it('flags an H1 that names a different proposal', () => {
		const text = [
			'---',
			'id: x00424',
			'---',
			'',
			'# x00419 — something',
			'',
		].join('\n');
		const findings = checkProposal('p.md', text);
		expect(findings).toHaveLength(1);
		expect(findings[0]?.detail).toContain('x00424');
		expect(findings[0]?.detail).toContain('x00419');
	});

	it('passes when they agree', () => {
		expect(checkProposal('p.md', proposal('## Goal\n\nReal.\n'))).toEqual(
			[],
		);
	});
});

describe('duplicates', () => {
	const withFiles = (files: string) =>
		proposal(`## Slices\n\n### S1 — x\n- **Files**: ${files}\n`);

	it('flags two open proposals whose slices name the same files', () => {
		const findings = findDuplicates(
			new Map([
				['a.md', withFiles('`src/a.ts`, `src/a.spec.ts`')],
				['b.md', withFiles('`src/a.ts`, `src/a.spec.ts`')],
			]),
		);
		expect(findings).toHaveLength(1);
		expect(findings[0]?.file).toBe('b.md');
		expect(findings[0]?.detail).toContain('a.md');
	});

	it('reports the later one, so fixing it does not move the finding', () => {
		const findings = findDuplicates(
			new Map([
				['b.md', withFiles('`src/a.ts`')],
				['a.md', withFiles('`src/a.ts`')],
			]),
		);
		expect(findings.map((f) => f.file)).toEqual(['b.md']);
	});

	it('does not flag two proposals that merely touch one file each', () => {
		const findings = findDuplicates(
			new Map([
				['a.md', withFiles('`src/a.ts`')],
				['b.md', withFiles('`src/b.ts`')],
			]),
		);
		expect(findings).toEqual([]);
	});

	it('ignores a proposal with no slice files rather than matching it to another', () => {
		// Two proposals that both declare nothing are not the same
		// proposal; treating "unknown" as a value is how a fingerprint
		// starts pairing unrelated documents.
		expect(fingerprintProposal(proposal('## Goal\n\nx\n'))).toBeUndefined();
		expect(
			findDuplicates(
				new Map([
					['a.md', proposal('## Goal\n\nx\n')],
					['b.md', proposal('## Goal\n\ny\n')],
				]),
			),
		).toEqual([]);
	});
});
