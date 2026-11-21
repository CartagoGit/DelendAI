/**
 * audit-findings.spec.ts — an audit's findings are records, and a plan's
 * ledger settles each one or leaves it open.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import {
	ledgerProblems,
	openAuditFindings,
	parseAuditFindings,
	parseAuditLedger,
} from '@delendai/proposals/lib/proposals/audit-findings';

const PROPOSALS = resolve(
	import.meta.dirname,
	'../../../../../../docs/delendai/proposals',
);

/** a00095 wherever its status puts it. */
const a00095 = (): string => {
	for (const entry of readdirSync(PROPOSALS, {
		recursive: true,
		withFileTypes: true,
	}))
		if (entry.isFile() && entry.name.startsWith('a00095-'))
			return readFileSync(join(entry.parentPath, entry.name), 'utf8');
	throw new Error('a00095 is not in docs/delendai/proposals');
};

describe('parseAuditFindings', () => {
	it("reads a00095's own findings as records", () => {
		const { findings } = parseAuditFindings(a00095());
		expect(findings.length).toBeGreaterThan(250);
		const g1 = findings.find((finding) => finding.id === 'G1');
		expect(g1).toMatchObject({
			classification: 'CONFIRMADO',
			zone: 'core',
		});
		expect(g1?.evidence).toContain('shell-status.tool.ts:195');
		expect(g1?.seenBy).toContain('glm-5.3-flash');
		expect(g1?.seenBy).toContain('claude-sonnet-5-5');
		expect(
			new Set(findings.map((finding) => finding.id)).size,
		).toBeGreaterThan(250);
	});

	it('reads English fields, continued values, and reports a finding without evidence', () => {
		const parsed = parseAuditFindings(
			[
				'## Findings',
				'### X1 — A thing',
				'- Classification: `CONFIRMED` · Zone: cli',
				'- Evidence: `a.ts:1` breaks',
				'  when run twice.',
				'- seenBy: model-a, model-b (second pass, with a comma)',
				'### X2 — Another',
				'- Clasificaci\u00f3n: `PARCIAL`',
				'## Next section',
			].join('\n'),
		);
		expect(parsed.findings).toEqual([
			{
				id: 'X1',
				title: 'A thing',
				classification: 'CONFIRMED',
				zone: 'cli',
				evidence: '`a.ts:1` breaks when run twice.',
				seenBy: ['model-a', 'model-b'],
			},
			{
				id: 'X2',
				title: 'Another',
				classification: 'PARCIAL',
				seenBy: [],
			},
		]);
		expect(parsed.withoutEvidence).toEqual(['X2']);
	});
});

const LEDGER = [
	'## Ledger',
	'',
	'| Finding | Settlement | Agreement |',
	'| --- | --- | --- |',
	'| a00095/G1 | settled-by: x00940, x00941 | confirmed: glm, claude; disputed: —; threshold: 8 |',
	'| a00095/G2 | same-as: a00094/G7 | confirmed: glm |',
	'| a00095/G3 | rejected: not reproducible on 2026-10-22 | disputed: qwen |',
	'| not a row |',
	'',
	'## Something else',
	'| a00095/G9 | settled-by: x1 | |',
].join('\n');

describe('parseAuditLedger', () => {
	it('reads each row as a finding, its settlement and its agreement', () => {
		expect(parseAuditLedger(LEDGER)).toEqual([
			{
				finding: 'a00095/G1',
				settlement: {
					kind: 'settled-by',
					proposals: ['x00940', 'x00941'],
				},
				confirmed: ['glm', 'claude'],
				disputed: [],
				threshold: 8,
			},
			{
				finding: 'a00095/G2',
				settlement: { kind: 'same-as', finding: 'a00094/G7' },
				confirmed: ['glm'],
				disputed: [],
			},
			{
				finding: 'a00095/G3',
				settlement: {
					kind: 'rejected',
					reason: 'not reproducible on 2026-10-22',
				},
				confirmed: [],
				disputed: ['qwen'],
			},
		]);
		expect(parseAuditLedger('# no ledger')).toEqual([]);
	});
});

describe('openAuditFindings and ledgerProblems', () => {
	const findingsByAudit = new Map([
		[
			'a00095',
			['G1', 'G2', 'G3', 'G4'].map((id) => ({
				id,
				title: id,
				seenBy: [],
			})),
		],
	]);
	const ledger = parseAuditLedger(LEDGER);

	it('leaves open an unsettled finding and one whose proposals are not done', () => {
		expect(
			openAuditFindings({
				findingsByAudit,
				ledger,
				statusOf: (id) => (id === 'x00940' ? 'done' : 'review'),
			}),
		).toEqual([
			{
				ref: 'a00095/G1',
				reason: 'settling-proposal-open',
				pending: ['x00941'],
			},
			{ ref: 'a00095/G4', reason: 'unsettled' },
		]);
	});

	it('names a row for a finding no audit has, and a finding settled twice', () => {
		expect(ledgerProblems({ findingsByAudit, ledger })).toEqual([]);
		expect(
			ledgerProblems({
				findingsByAudit,
				ledger: [
					...ledger,
					...ledger.slice(0, 1),
					{ ...ledger[0]!, finding: 'a00095/G99' },
				],
			}),
		).toEqual([
			'a00095/G1: settled more than once',
			'a00095/G99: no contained audit has this finding',
		]);
	});
});
