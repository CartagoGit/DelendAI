import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import {
	detectUnclassifiedCandidates,
	renderInventoryMarkdown,
	scanCoreProposalsBoundary,
} from '../../../../../tools/scripts/inspect/core-proposals-boundary.script';
import {
	applyBoundaryExceptions,
	collectBoundaryMatches,
	CORE_PROPOSALS_BOUNDARY_EXCEPTIONS,
	EXPIRY_WARNING_DAYS,
	expiringSoon,
	formatExpiryWarnings,
	formatReport,
	scanCoreProposalsBoundaryLint,
} from '../../../../../tools/scripts/lint/core-proposals-boundary.script';
import { findLintScriptRegistration } from '../../../../../tools/scripts/lint/index';

const REPO_ROOT = join(
	fileURLToPath(new URL('.', import.meta.url)),
	'..',
	'..',
	'..',
	'..',
	'..',
);
const DOC_PATH = join(
	REPO_ROOT,
	'docs/delendai/CORE-PROPOSALS-BOUNDARY-INVENTORY.md',
);

describe('core -> proposals boundary inventory (r00043 S0)', () => {
	it('covers every required coupling category in the live tree', async () => {
		const result = await scanCoreProposalsBoundary(REPO_ROOT);
		expect(result.unclassified).toEqual([]);
		expect(result.missing).toEqual([]);
		expect(
			new Set(result.findings.map((finding) => finding.category)),
		).toEqual(
			new Set([
				'import',
				'path',
				'plugin-name',
				'type',
				'message',
				'index-access',
			]),
		);
	});

	it('renders the committed markdown inventory exactly', async () => {
		const result = await scanCoreProposalsBoundary(REPO_ROOT);
		const committed = await readFile(DOC_PATH, 'utf8');
		expect(renderInventoryMarkdown(result)).toBe(committed);
	});

	it('flags synthetic unclassified proposal-domain lines in a new file', () => {
		const text = [
			"const nextAction = 'delendai_proposals_auto_work';",
			"const section = 'proposals';",
		].join('\n');
		const result = detectUnclassifiedCandidates(
			'packages/core/src/lib/synthetic/new-boundary.ts',
			text,
		);
		// `\bproposals\b` does not match inside `delendai_proposals_auto_work`
		// (`_` is a word char), so only the quoted `'proposals'` literal is a
		// candidate, and it has no rule in this synthetic file -> unclassified.
		expect(result).toHaveLength(1);
		expect(result[0]).toMatchObject({
			file: 'packages/core/src/lib/synthetic/new-boundary.ts',
			line: 2,
		});
	});
});

describe('core -> proposals boundary lint (r00043 S5)', () => {
	it('passes on the live core tree with only explicit time-boxed exceptions', async () => {
		const result = await scanCoreProposalsBoundaryLint(REPO_ROOT);
		expect(result.violations).toEqual([]);
		expect(result.expired).toEqual([]);
		expect(result.stale).toEqual([]);
		expect(result.allowed.length).toBeGreaterThan(0);
	});

	it('reports an exception nothing matches any more, so a removed coupling cannot come back excused', () => {
		const exception = CORE_PROPOSALS_BOUNDARY_EXCEPTIONS[0]!;

		const report = formatReport({
			scannedFiles: 1,
			allowed: [],
			violations: [],
			expired: [],
			stale: [exception],
		});

		expect(report).toContain('1 stale');
		expect(report).toContain(
			`${exception.file} stale-exception: nothing matches ${JSON.stringify(exception.needle)}`,
		);
	});

	it('permits a compat import only when it matches an explicit exception', () => {
		const matches = collectBoundaryMatches(
			"export { schema } from '../lib/proposals/validate-evidence.schema';\n",
			'/repo/packages/core/src/public/index.ts',
			'packages/core/src/public/index.ts',
		);
		const result = applyBoundaryExceptions(
			matches,
			undefined,
			new Date('2026-08-30T00:00:00Z'),
		);
		expect(result.violations).toEqual([]);
		expect(result.allowed).toHaveLength(1);
	});

	it('fails an expired exception even when the literal was once whitelisted', () => {
		const matches = collectBoundaryMatches(
			"const plugin = 'proposals';\n",
			'/repo/packages/core/src/lib/synthetic/expired.ts',
			'packages/core/src/lib/synthetic/expired.ts',
		);
		const result = applyBoundaryExceptions(
			matches,
			[
				{
					file: 'packages/core/src/lib/synthetic/expired.ts',
					needle: 'proposals',
					until: '2026-01-01',
					classification: 'compatibility',
					reason: 'synthetic expired waiver',
					kind: 'literal',
				},
			],
			new Date('2026-08-30T00:00:00Z'),
		);
		expect(result.violations).toHaveLength(1);
		expect(result.expired).toHaveLength(1);
		expect(result.violations[0]?.code).toBe('expired-exception');
	});

	it('registers the lint command in the local lint registry', () => {
		expect(findLintScriptRegistration('core-proposals-boundary')).toEqual({
			id: 'core-proposals-boundary',
			command: 'bun tools/scripts/lint/core-proposals-boundary.script.ts',
			scriptPath: 'tools/scripts/lint/core-proposals-boundary.script.ts',
			scope: 'packages/core/src',
			description:
				'Prevents new proposals-domain imports, path literals and workflow strings from entering packages/core/src without a time-boxed exception.',
			gate: 'manual',
		});
	});
});

describe('an exception close to its date warns before it fails', () => {
	const allowedFor = (until: readonly string[]) =>
		until.map((date, index) => ({
			match: {
				absPath: `/r/f${String(index)}.ts`,
				relPath: `f${String(index)}.ts`,
				line: 1,
				kind: 'literal' as const,
				token: 't',
				snippet: 's',
			},
			exception: {
				...CORE_PROPOSALS_BOUNDARY_EXCEPTIONS[0]!,
				until: date,
			},
		}));

	it('names each date inside the window, with how many exceptions expire on it', () => {
		expect(
			expiringSoon(
				allowedFor([
					'2027-03-31',
					'2027-03-31',
					'2027-03-10',
					'2027-06-30',
				]),
				new Date('2027-03-05T00:00:00Z'),
			),
		).toEqual([
			{ until: '2027-03-10', count: 1 },
			{ until: '2027-03-31', count: 2 },
		]);
	});

	it('says nothing while the date is further away than the window', () => {
		expect(
			expiringSoon(
				allowedFor(['2027-03-31']),
				new Date('2027-02-27T00:00:00Z'),
			),
		).toEqual([]);
		expect(EXPIRY_WARNING_DAYS).toBe(30);
	});

	it('warns on the live exceptions a month before their date', () => {
		const live = allowedFor(
			CORE_PROPOSALS_BOUNDARY_EXCEPTIONS.map(
				(exception) => exception.until,
			),
		);
		const latest = [...CORE_PROPOSALS_BOUNDARY_EXCEPTIONS]
			.map((exception) => exception.until)
			.sort()
			.at(-1)!;
		const monthBefore = new Date(
			Date.parse(`${latest}T00:00:00Z`) - 20 * 86_400_000,
		);
		expect(
			expiringSoon(live, monthBefore).some(
				(each) => each.until === latest,
			),
		).toBe(true);
	});

	it('writes a forge annotation in CI and a plain line elsewhere', () => {
		const expiring = [{ until: '2027-03-31', count: 3 }];
		expect(formatExpiryWarnings(expiring, true)[0]).toMatch(
			/^::warning title=core-proposals-boundary::3 core-proposals-boundary exception\(s\) expire on 2027-03-31/u,
		);
		expect(formatExpiryWarnings(expiring, false)[0]).toMatch(
			/^core-proposals-boundary: warning: 3 /u,
		);
	});
});
