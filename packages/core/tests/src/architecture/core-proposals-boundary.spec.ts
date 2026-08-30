import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import {
	detectUnclassifiedCandidates,
	renderInventoryMarkdown,
	scanCoreProposalsBoundary,
} from '../../../../../tools/scripts/inspect/core-proposals-boundary.script';

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

	it('classifies synthetic proposal-domain lines instead of leaving them unclassified', () => {
		const text = [
			"const nextAction = 'mcp-vertex_proposals_auto_work';",
			"const section = 'proposals';",
		].join('\n');
		expect(
			detectUnclassifiedCandidates(
				'packages/core/src/lib/synthetic/new-boundary.ts',
				text,
			),
		).toEqual([]);
	});
});
