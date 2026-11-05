import { describe, expect, it } from 'vitest';
import type {
	IChangeKind,
	IChangeTextInput,
} from '../../../../src/lib/contracts/interfaces/change-text.interface';
import {
	changeTypeOf,
	proposalScopeOf,
	renderChangeText,
	renderIssueText,
	scopeOfPaths,
	shapeSummary,
} from '../../../../src/lib/change-text/change-text-template.service';
import { SUMMARY_MAX_LENGTH } from '../../../../src/lib/contracts/constants/change-text.constant';

const SECTIONS = [
	'What',
	'Why',
	'Slices shipped',
	'Files and zones',
	'Proof',
	'Review notes',
];

const base = (kind: IChangeKind): IChangeTextInput => ({
	kind,
	type: changeTypeOf(kind, 'feat'),
	scope: 'core',
	summary: 'One generated format',
	units: [{ proposal: 'f00809', slices: ['S1'] }],
	why: 'Titles vary.',
	slices: [{ id: 'S1', title: 'Core template' }],
	verdicts: [{ proposal: 'D00418', verdict: 'approve' }],
	files: ['packages/core/src/a.ts'],
});

const headings = (body: string): string[] =>
	[...body.matchAll(/^## (.+)$/gmu)].map((m) => m[1] as string);

describe('proposalScopeOf', () => {
	it.each([
		[[{ proposal: 'x01003' }], 'x01003'],
		[[{ proposal: 'x01003', slices: ['S2'] }], 'x01003-S2'],
		[[{ proposal: 'x01003', slices: ['S3', 'S1', 'S2'] }], 'x01003-S1-S3'],
		[[{ proposal: 'x01003', slices: ['S1', 'S4'] }], 'x01003-S1+S4'],
		[[{ proposal: 'x01016' }, { proposal: 'x01004' }], 'x01004+x01016'],
	])('%j -> %s', (units, expected) => {
		expect(proposalScopeOf(units)).toBe(expected);
	});
});

describe('shapeSummary', () => {
	it('drops prefixes, counters and scope, and bounds the length', () => {
		expect(shapeSummary('feat(x): do it (+3 more)')).toBe('do it');
		expect(shapeSummary('do it (x01003-S2)')).toBe('do it');
		expect(shapeSummary('a'.repeat(200)).length).toBe(SUMMARY_MAX_LENGTH);
	});
});

describe('renderChangeText', () => {
	it.each<IChangeKind>(['implement', 'create', 'batch-close'])(
		'%s has the fixed sections in order',
		(kind) => {
			const { title, body } = renderChangeText(base(kind));
			expect(headings(body)).toEqual(SECTIONS);
			expect(title).toMatch(/^[a-z]+\(core\): .+ \(f00809-S1\)$/u);
			expect(body).toContain('not proved locally');
		},
	);

	it('review swaps Slices shipped for Verdicts and types as review', () => {
		const { title, body } = renderChangeText(base('review'));
		expect(headings(body)).toEqual(
			SECTIONS.map((name) =>
				name === 'Slices shipped' ? 'Verdicts' : name,
			),
		);
		expect(title.startsWith('review(core):')).toBe(true);
		expect(body).toContain('- d00418: approve');
	});

	it('an agent cannot open a section or set the shape through free text', () => {
		const { body } = renderChangeText({
			...base('implement'),
			summary: '# Injected\nplain',
			why: '## Another\nwhy',
		});
		expect(headings(body)).toEqual(SECTIONS);
	});

	it('two agents with different wording get the same shape', () => {
		const one = renderChangeText({
			...base('implement'),
			summary: 'feat(zzz): implement batch (+3 more)',
		});
		const two = renderChangeText({
			...base('implement'),
			summary: 'Implement the batch',
		});
		const shape = (text: string): string =>
			text.replace(/^[^\n]*\n/u, '').replace(/^[^#\n].*$/gmu, '');
		expect(headings(one.body)).toEqual(headings(two.body));
		expect(shape(one.body)).toBe(shape(two.body));
		expect(one.title).toMatch(/^feat\(core\): .+ \(f00809-S1\)$/u);
		expect(two.title).toMatch(/^feat\(core\): .+ \(f00809-S1\)$/u);
	});

	it('lists proof steps slowest first', () => {
		const { body } = renderChangeText({
			...base('implement'),
			proof: [
				{ name: 'a', seconds: 1, ok: true },
				{ name: 'b', seconds: 9, ok: false },
			],
		});
		expect(body.indexOf('9s FAIL b')).toBeLessThan(body.indexOf('1s ok a'));
	});
});

describe('renderIssueText', () => {
	it('uses the same title rule and the issue sections', () => {
		const { title, body } = renderIssueText({
			type: changeTypeOf('issue'),
			scope: 'Error Reporting',
			summary: 'Crash on start',
			where: 'a.ts:1',
			evidence: 'stack',
			expected: 'runs',
			actual: 'throws',
			units: [{ proposal: 'x01003' }],
		});
		expect(title).toBe('fix(error-reporting): Crash on start (x01003)');
		expect(headings(body)).toEqual([
			'Summary',
			'Where',
			'Evidence',
			'Expected and Actual',
			'Proposal link',
		]);
	});
});

describe('scopeOfPaths', () => {
	it('names the zone most paths live in', () => {
		expect(
			scopeOfPaths([
				'plugins/issues/a.ts',
				'plugins/issues/b.ts',
				'docs/x.md',
			]),
		).toBe('issues');
	});
});
