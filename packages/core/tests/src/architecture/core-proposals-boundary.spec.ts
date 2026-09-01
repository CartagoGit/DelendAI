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
	'docs/mcp-vertex/CORE-PROPOSALS-BOUNDARY-INVENTORY.md',
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
			"const nextAction = 'mcp-vertex_proposals_auto_work';",
			"const section = 'proposals';",
		].join('\n');
		const result = detectUnclassifiedCandidates(
			'packages/core/src/lib/synthetic/new-boundary.ts',
			text,
		);
		// `\bproposals\b` does not match inside `mcp-vertex_proposals_auto_work`
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
		expect(result.allowed.length).toBeGreaterThan(0);
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
