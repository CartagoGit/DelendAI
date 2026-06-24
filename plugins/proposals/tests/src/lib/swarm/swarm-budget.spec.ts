/**
 * swarm-budget.spec.ts
 *
 * TDD specs for parseSwarmFrontmatter.
 *
 * 5 cases from the proposal:
 *  1. Valid swarmBudget + continuityPolicy → ISwarmProposalExtension
 *  2. swarmBudget.maxAgentsPerSession: -1 → INVALID_SWARM_BUDGET
 *  3. continuityPolicy.maxToolRetriesPerTool: 0 → INVALID_CONTINUITY_POLICY
 *  4. continuityPolicy.forbidReReadOnUnchangedDigest: false → valid (allow-list)
 *  5. Reuses parseProposalDocument (base errors propagate unchanged)
 */

import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { ProposalParseError } from '@mcp-vertex/proposals/lib/proposals/proposal-errors';
import { parseSwarmFrontmatter } from '@mcp-vertex/proposals/lib/swarm/swarm-parser';

let workdir: string;

beforeEach(() => {
	workdir = mkdtempSync(join(tmpdir(), 'mcp-vertex-swarm-budget-'));
	mkdirSync(join(workdir, 'docs', 'proposals'), { recursive: true });
});

afterEach(() => {
	rmSync(workdir, { recursive: true, force: true });
});

const writeProposal = (name: string, content: string): string => {
	const abs = join(workdir, 'docs', 'proposals', name);
	writeFileSync(abs, content, 'utf8');
	return abs;
};

const VALID_FRONTMATTER_BASE = [
	'---',
	'id: l99',
	'type: meta',
	'status: pending',
	'track: meta',
	'created: 2026-06-05',
].join('\n');

// ---------------------------------------------------------------------------
// Case 1: valid swarmBudget + continuityPolicy → ISwarmProposalExtension
// ---------------------------------------------------------------------------
describe('parseSwarmFrontmatter — case 1: valid swarmBudget + continuityPolicy', async () => {
	it('returns ISwarmProposalExtension with both blocks when both are valid', async () => {
		const path = writeProposal(
			'l99-valid.md',
			[
				VALID_FRONTMATTER_BASE,
				'swarmBudget:',
				'  maxAgentsPerSession: 3',
				'  maxToolRetriesPerSession: 5',
				'  maxCoreDocRereadsPerSession: 1',
				'  maxTurnTokens: 4096',
				'continuityPolicy:',
				'  maxTasksPerSession: 2',
				'  forbidNewProposals: true',
				'  maxToolRetriesPerTool: 2',
				'  requireCheckpointAfterTask: true',
				'  forbidReReadOnUnchangedDigest: true',
				'---',
				'',
				'# [PROPOSAL] Valid test',
			].join('\n'),
		);

		const result = await parseSwarmFrontmatter(path);

		expect(result.swarmBudget).toBeDefined();
		expect(result.swarmBudget?.maxAgentsPerSession).toBe(3);
		expect(result.swarmBudget?.maxToolRetriesPerSession).toBe(5);
		expect(result.swarmBudget?.maxCoreDocRereadsPerSession).toBe(1);
		expect(result.swarmBudget?.maxTurnTokens).toBe(4096);

		expect(result.continuityPolicy).toBeDefined();
		expect(result.continuityPolicy?.maxTasksPerSession).toBe(2);
		expect(result.continuityPolicy?.forbidNewProposals).toBe(true);
		expect(result.continuityPolicy?.maxToolRetriesPerTool).toBe(2);
		expect(result.continuityPolicy?.requireCheckpointAfterTask).toBe(true);
		expect(result.continuityPolicy?.forbidReReadOnUnchangedDigest).toBe(
			true,
		);
	});
});

// ---------------------------------------------------------------------------
// Case 2: swarmBudget.maxAgentsPerSession: -1 → INVALID_SWARM_BUDGET
// ---------------------------------------------------------------------------
describe('parseSwarmFrontmatter — case 2: negative swarmBudget value', async () => {
	it('throws ProposalParseError with INVALID_SWARM_BUDGET for negative maxAgentsPerSession', async () => {
		const path = writeProposal(
			'l99-negative-budget.md',
			[
				VALID_FRONTMATTER_BASE,
				'swarmBudget:',
				'  maxAgentsPerSession: -1',
				'---',
				'',
				'# [PROPOSAL] Negative budget',
			].join('\n'),
		);

		await expect(parseSwarmFrontmatter(path)).rejects.toThrow(
			ProposalParseError,
		);

		try {
			await parseSwarmFrontmatter(path);
		} catch (err) {
			expect(err).toBeInstanceOf(ProposalParseError);
			expect((err as ProposalParseError).code).toBe(
				'INVALID_SWARM_BUDGET',
			);
		}
	});
});

// ---------------------------------------------------------------------------
// Case 3: continuityPolicy.maxToolRetriesPerTool: 0 → INVALID_CONTINUITY_POLICY
// ---------------------------------------------------------------------------
describe('parseSwarmFrontmatter — case 3: zero maxToolRetriesPerTool', async () => {
	it('throws ProposalParseError with INVALID_CONTINUITY_POLICY for zero retries', async () => {
		const path = writeProposal(
			'l99-zero-retries.md',
			[
				VALID_FRONTMATTER_BASE,
				'continuityPolicy:',
				'  maxToolRetriesPerTool: 0',
				'---',
				'',
				'# [PROPOSAL] Zero retries',
			].join('\n'),
		);

		await expect(parseSwarmFrontmatter(path)).rejects.toThrow(
			ProposalParseError,
		);

		try {
			await parseSwarmFrontmatter(path);
		} catch (err) {
			expect(err).toBeInstanceOf(ProposalParseError);
			expect((err as ProposalParseError).code).toBe(
				'INVALID_CONTINUITY_POLICY',
			);
		}
	});
});

// ---------------------------------------------------------------------------
// Case 4: continuityPolicy.forbidReReadOnUnchangedDigest: false → valid
// ---------------------------------------------------------------------------
describe('parseSwarmFrontmatter — case 4: forbidReReadOnUnchangedDigest: false is valid', async () => {
	it('accepts forbidReReadOnUnchangedDigest: false without error', async () => {
		const path = writeProposal(
			'l99-forbidflag-false.md',
			[
				VALID_FRONTMATTER_BASE,
				'continuityPolicy:',
				'  forbidReReadOnUnchangedDigest: false',
				'---',
				'',
				'# [PROPOSAL] Forbid flag false',
			].join('\n'),
		);

		const result = await parseSwarmFrontmatter(path);

		expect(result.continuityPolicy).toBeDefined();
		expect(result.continuityPolicy?.forbidReReadOnUnchangedDigest).toBe(
			false,
		);
	});
});

// ---------------------------------------------------------------------------
// Case 5: base parseProposalDocument errors propagate (no swarmBudget/continuityPolicy keys)
// ---------------------------------------------------------------------------
describe('parseSwarmFrontmatter — case 5: reuses parseProposalDocument base validation', async () => {
	it('returns empty ISwarmProposalExtension for a valid proposal without swarm keys', async () => {
		const path = writeProposal(
			'l99-no-swarm.md',
			[
				VALID_FRONTMATTER_BASE,
				'---',
				'',
				'# [PROPOSAL] No swarm keys',
			].join('\n'),
		);

		const result = await parseSwarmFrontmatter(path);

		// No swarm keys → both optional fields must be absent
		expect(result.swarmBudget).toBeUndefined();
		expect(result.continuityPolicy).toBeUndefined();
	});

	it('propagates ProposalParseError from base parser when frontmatter is missing', async () => {
		const path = writeProposal(
			'l99-no-frontmatter.md',
			'# [PROPOSAL] No frontmatter at all\n\nSome content.',
		);

		await expect(parseSwarmFrontmatter(path)).rejects.toThrow(
			ProposalParseError,
		);
	});
});
