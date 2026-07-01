import { describe, expect, it } from 'vitest';

import { buildProposalWorkflow } from '../../../../src/lib/knowledge/proposal-workflow';
import { DEFAULT_KIND_ORDER } from '../../../../src/lib/cascade/cascade-priority';
import { PROPOSAL_KINDS } from '../../../../src/lib/contracts/constants/proposal-glossary.constant';

describe('buildProposalWorkflow (f00024 cascade families)', async () => {
	const workflow = buildProposalWorkflow(
		'docs/mcp-vertex/proposals',
		'index.json',
	);

	it('returns exactly 13 families: 12 active kinds + the legacy `p` alias', async () => {
		expect(workflow.families).toHaveLength(13);
	});

	it('orders families per §"Orden por defecto" (fix first, p alias last)', async () => {
		const prefixesInOrder = workflow.families.map((f) => f.prefix);
		const expectedKindPrefixes = DEFAULT_KIND_ORDER.map(
			(kind) => PROPOSAL_KINDS[kind].prefix,
		);
		expect(prefixesInOrder).toEqual([...expectedKindPrefixes, 'p']);
	});

	it('never describes `f` as "fixes" — descriptions are derived from the real kind', async () => {
		const feat = workflow.families.find((f) => f.prefix === 'f');
		expect(feat?.description).toContain('feat');
		expect(feat?.description).not.toContain('fixes');

		const fix = workflow.families.find((f) => f.prefix === 'x');
		expect(fix?.description).toContain('fix');
		expect(fix?.cascadePriority).toBe(0);
	});

	it('keeps the `p` alias one rank behind `legacy` and labels it as a back-compat alias', async () => {
		const legacy = workflow.families.find((f) => f.prefix === 'l');
		const alias = workflow.families.find((f) => f.prefix === 'p');
		expect(alias?.cascadePriority).toBe(
			(legacy?.cascadePriority as number) + 1,
		);
		expect(alias?.description).toMatch(/legacy alias/);
	});

	it('preserves the public signature: (proposalsDir, indexFile) -> IProposalWorkflow', async () => {
		expect(workflow.locations.proposalsDir).toBe(
			'docs/mcp-vertex/proposals',
		);
		expect(workflow.locations.indexFile).toBe('index.json');
		expect(typeof workflow.naming).toBe('string');
		expect(Array.isArray(workflow.rules)).toBe(true);
		expect(typeof workflow.template).toBe('string');
	});
});
