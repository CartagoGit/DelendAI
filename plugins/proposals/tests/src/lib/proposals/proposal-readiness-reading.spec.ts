/**
 * proposal-readiness-reading.spec.ts — how the readiness rules read a
 * proposal as people write it: braces, sub-bullets, notes, quoted ids.
 * Every test names its time budget.
 */
import { describe, expect, it } from 'vitest';

import {
	expandDeclaredFiles,
	normalizeFileToken,
	readDeclaredSliceFiles,
	withoutNewMarker,
} from '../../../../src/lib/proposals/expand-declared-files';
import {
	checkProposalReadiness,
	describeReadinessFinding,
	readinessPaths,
} from '../../../../src/lib/proposals/proposal-readiness';
import { readReadinessSlices } from '../../../../src/lib/proposals/proposal-readiness-slices';

const present = new Set([
	'a/x.ts',
	'a/y.ts',
	'docs/delendai/proposals/ready/x00001-own.md',
]);
const deps = {
	exists: (path: string): boolean => present.has(path),
	newMustBeAbsent: true,
};

const doc = (slices: string): string =>
	['---', 'id: x00001', '---', '', '## slices', '', slices].join('\n');

describe('reading Files', () => {
	it('[<50ms] expands braces, keeps a new: marker and skips prose spans', () => {
		const slice = [
			'### S1 — t',
			'- **Files**: `a/{x,y}.ts`, `new:b/{p,q}.ts` (NEW; `private: true`)',
			'- **Decisions**: none',
			'- acceptance:',
			'  - "`bun run lint` exits 0."',
		].join('\n');
		expect(checkProposalReadiness(doc(slice), deps)).toEqual([]);
		expect(readinessPaths(doc(slice))).toEqual([
			'a/x.ts',
			'a/y.ts',
			'b/p.ts',
			'b/q.ts',
		]);
	});

	it('[<50ms] reads indented sub-bullets, drops their descriptions, and exempts its own document', () => {
		const slice = [
			'### S1 — t',
			'- **Files**:',
			'  - `a/x.ts` — writes `.cache/out.jsonl`',
			'  - `docs/delendai/proposals/ready/x00001-own.md`',
			'  - `docs/delendai/proposals/in-progress/x00001-own.md`',
			'- **Decisions**: none',
			'- acceptance:',
			'  - "Scenario F6 is green."',
		].join('\n');
		expect(checkProposalReadiness(doc(slice), deps)).toEqual([]);
	});

	it('[<50ms] reads an inline acceptance, quoted DependsOn and a Status with a note', () => {
		const slices = readReadinessSlices(
			doc(
				[
					'### S1 — t',
					'- **Status**: retired — plan changed',
					'### S2a — u',
					'- **DependsOn**: ["S1"]',
					'- acceptance: `bun run lint` exits 0.',
				].join('\n'),
			),
		);
		expect(slices.map((slice) => slice.status)).toEqual([
			'retired',
			'pending',
		]);
		expect(slices[1]?.dependsOn).toEqual(['S1']);
		expect(slices[1]?.acceptance).toEqual(['`bun run lint` exits 0.']);
	});

	it('[<50ms] describes a finding on one line', () => {
		expect(
			describeReadinessFinding({
				proposal: 'x00001',
				slice: 'S1',
				rule: 'files',
				text: 'a\n b',
			}),
		).toBe('x00001 S1 [files] a b');
	});
});

describe('the shared Files parser and the new: marker', () => {
	it('[<50ms] strips the marker from tokens, braces and bare lines', () => {
		expect(withoutNewMarker('new:a/b.ts')).toBe('a/b.ts');
		expect(withoutNewMarker('a/b.ts')).toBe('a/b.ts');
		expect(expandDeclaredFiles('`new:a/{x,y}.ts`')).toEqual([
			'a/x.ts',
			'a/y.ts',
		]);
		expect(normalizeFileToken('`new:a/b.ts`')).toBe('a/b.ts');
	});

	it('[<50ms] reads every declared form of a Files field', () => {
		const body = [
			'- files: a/one.ts',
			'- **Files**: [a/two.ts, a/three.ts]',
			'- **Files**: [a link](file:///work/tree/a/four.ts)',
			'- **Files**: `a/five.ts` (note)',
		].join('\n');
		expect(readDeclaredSliceFiles(body)).toEqual(
			expect.arrayContaining(['a/one.ts', 'a/two.ts', 'a/five.ts']),
		);
		expect(normalizeFileToken('[x](file:///w/plugins/p/src/a.ts#L3)')).toBe(
			'plugins/p/src/a.ts',
		);
		expect(normalizeFileToken('prose with spaces')).toBe('');
	});
});
