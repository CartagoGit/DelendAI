/**
 * proposal-readiness.spec.ts — each readiness rule, on pure inputs.
 * Every test names its time budget.
 */
import { describe, expect, it } from 'vitest';

import { checkProposalReadiness } from '../../../../src/lib/proposals/proposal-readiness';
import { guardTransitionToReady } from '../../../../src/lib/services/ready-guard.service';

const present = new Set(['src/a.ts', 'src/b.ts']);
const deps = {
	exists: (path: string): boolean => present.has(path),
	newMustBeAbsent: true,
};

const slice = (
	id: string,
	over: Partial<Record<string, string>> = {},
): string =>
	[
		`### ${id} — t`,
		`- **Status**: ${over.status ?? 'pending'}`,
		...(over.depends === undefined
			? []
			: [`- **DependsOn**: [${over.depends}]`]),
		`- **Files**: ${over.files ?? '`src/a.ts`'}`,
		...(over.decisions === 'omit'
			? []
			: [`- **Decisions**: ${over.decisions ?? 'none'}`]),
		'- acceptance:',
		`  - "${over.acceptance ?? 'Passes `bun run lint`.'}"`,
		'',
	].join('\n');

const proposal = (...slices: string[]): string =>
	['---', 'id: x00001', '---', '', '## slices', '', ...slices].join('\n');

const rules = (...slices: string[]): string[] =>
	checkProposalReadiness(proposal(...slices), deps).map(
		(item) => `${item.slice}:${item.rule}`,
	);

describe('a clean proposal', () => {
	it('[<50ms] has no findings', () => {
		expect(rules(slice('S1'))).toEqual([]);
	});
	it('[<50ms] skips a slice already delivered', () => {
		expect(
			rules(slice('S1', { status: 'done', files: '`gone.ts`' })),
		).toEqual([]);
	});
});

describe('rule 1: Files', () => {
	it('[<50ms] accepts new:<path> for an absent path', () => {
		expect(rules(slice('S1', { files: '`new:src/c.ts`' }))).toEqual([]);
	});
	it('[<50ms] refuses new:<path> for a path that exists, when it must be absent', () => {
		expect(rules(slice('S1', { files: '`new:src/a.ts`' }))).toEqual([
			'S1:files',
		]);
		const lenient = checkProposalReadiness(
			proposal(slice('S1', { files: '`new:src/a.ts`' })),
			{ ...deps, newMustBeAbsent: false },
		);
		expect(lenient).toEqual([]);
	});
	it('[<50ms] refuses a path that does not exist', () => {
		expect(rules(slice('S1', { files: '`src/c.ts`' }))).toEqual([
			'S1:files',
		]);
	});
	it.each(['none yet', 'TBD', 'may need `src/a.ts`'])(
		'[<50ms] refuses the guess %s',
		(files) => {
			expect(rules(slice('S1', { files }))).toContain('S1:files');
		},
	);
	it('[<50ms] refuses a glob and an empty list', () => {
		expect(rules(slice('S1', { files: '`src/*.ts`' }))).toContain(
			'S1:files',
		);
		expect(rules(slice('S1', { files: '' }))).toEqual(['S1:files']);
	});
	it('[<50ms] ignores backticked prose in a note', () => {
		expect(
			rules(slice('S1', { files: '`src/a.ts` (NEW; `private: true`)' })),
		).toEqual([]);
	});
});

describe('rule 2: acceptance', () => {
	it.each([
		'`bun run lint` exits 0.',
		'Covered by src/x.spec.ts.',
		'Scenario F6 is green.',
	])('[<50ms] accepts %s', (acceptance) => {
		expect(rules(slice('S1', { acceptance }))).toEqual([]);
	});
	it('[<50ms] refuses a line that names nothing checkable', () => {
		expect(rules(slice('S1', { acceptance: 'It works well.' }))).toEqual([
			'S1:acceptance',
		]);
	});
});

describe('rule 3: Decisions', () => {
	it.each([
		'omit',
		'TBD',
		'left to the implementer',
		'either way',
		'Which one?',
	])('[<50ms] refuses %s', (decisions) => {
		expect(rules(slice('S1', { decisions }))).toEqual(['S1:decisions']);
	});
	it('[<50ms] accepts none and a made decision', () => {
		expect(rules(slice('S1', { decisions: 'None.' }))).toEqual([]);
		expect(
			rules(slice('S1', { decisions: 'The baseline is keyed by id.' })),
		).toEqual([]);
	});
});

describe('rule 4: DependsOn', () => {
	it('[<50ms] refuses an id that is not a slice', () => {
		expect(rules(slice('S1', { depends: 'S9' }))).toEqual([
			'S1:depends-on',
		]);
	});
	it('[<50ms] refuses a cycle, naming both slices', () => {
		const found = rules(
			slice('S1', { depends: 'S2', files: '`src/a.ts`' }),
			slice('S2', { depends: 'S1', files: '`src/b.ts`' }),
		);
		expect(found).toEqual(['S1:depends-on', 'S2:depends-on']);
	});
	it('[<50ms] accepts a dependency on a delivered slice', () => {
		expect(
			rules(
				slice('S1', { status: 'done', files: '`src/b.ts`' }),
				slice('S2', { depends: 'S1' }),
			),
		).toEqual([]);
	});
});

describe('rule 5: slices sharing a file', () => {
	it('[<50ms] refuses two slices on one file with no DependsOn', () => {
		expect(rules(slice('S1'), slice('S2'))).toEqual(['S2:shared-file']);
	});
	it('[<50ms] accepts them when one depends on the other, even through a third', () => {
		expect(
			rules(
				slice('S1'),
				slice('S2', { depends: 'S1', files: '`src/b.ts`' }),
				slice('S3', { depends: 'S2' }),
			),
		).toEqual([]);
	});
});

describe('the finding', () => {
	it('[<50ms] names proposal, slice, rule and the offending text', () => {
		expect(
			checkProposalReadiness(
				proposal(slice('S1', { acceptance: 'It works well.' })),
				deps,
			),
		).toEqual([
			{
				proposal: 'x00001',
				slice: 'S1',
				rule: 'acceptance',
				text: 'It works well.',
			},
		]);
	});
});

describe('the move to ready', () => {
	it('[<50ms] refuses with the findings named and accepts a clean proposal', async () => {
		const bad = await guardTransitionToReady({
			markdown: proposal(slice('S1', { decisions: 'TBD' })),
			workspaceRoot: '/nonexistent-workspace',
		});
		expect(bad.ok).toBe(false);
		if (!bad.ok) expect(bad.reason).toContain('x00001 S1 [decisions] TBD');
		const good = await guardTransitionToReady({
			markdown: proposal(slice('S1', { files: '`new:src/z.ts`' })),
			workspaceRoot: '/nonexistent-workspace',
		});
		expect(good).toEqual({ ok: true });
	});
});
