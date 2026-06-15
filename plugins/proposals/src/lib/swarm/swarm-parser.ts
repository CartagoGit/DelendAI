/**
 * swarm-parser.ts
 *
 * parseSwarmFrontmatter — wraps the base parseProposalDocument and merges the
 * new ISwarmBudget and IContinuityPolicy blocks from the frontmatter.
 *
 * Throws ProposalParseError with:
 *   code: 'INVALID_SWARM_BUDGET'      — swarmBudget validation failure
 *   code: 'INVALID_CONTINUITY_POLICY' — continuityPolicy validation failure
 *
 * Design: the original design for base document parsing
 * (id, type, status, track, budget, acceptanceCriteria, etc.) and adds its
 * own Zod-validated extension on top. The raw YAML is re-read from disk once
 * (same file handle) using the shared frontmatter-parser utilities.
 */

import { readFile } from 'node:fs/promises';

import { z } from 'zod';

import {
	extractYamlBlock,
	parseFrontmatterBlock,
} from '../proposals/frontmatter-parser';
import { parseProposalDocument } from '../proposals/proposal-document';
import { ProposalParseError } from '../proposals/proposal-errors';
import type {
	IContinuityPolicy,
	ISwarmBudget,
	ISwarmProposalExtension,
} from './swarm-types';

// ---------------------------------------------------------------------------
// Zod schemas — all numeric swarm fields must be integers >= 1 when present.
// Zero (0) is intentionally rejected:
//   - swarmBudget: any zero value means "nothing allowed" which is a
//     configuration that cannot be satisfied, not a limit.
//   - continuityPolicy: maxToolRetriesPerTool: 0 disables retries without
//     expressing intent — must be >= 1 or omitted.
// ---------------------------------------------------------------------------

const swarmBudgetSchema = z.object({
	maxSessionsActive: z.number().int().min(1).optional(),
	maxAgentsPerSession: z.number().int().min(1).optional(),
	maxToolRetriesPerSession: z.number().int().min(1).optional(),
	maxCoreDocRereadsPerSession: z.number().int().min(1).optional(),
	maxTurnTokens: z.number().int().min(1).optional(),
});

const continuityPolicySchema = z.object({
	maxTasksPerSession: z.number().int().min(1).optional(),
	forbidNewProposals: z.boolean().optional(),
	maxAgentSpawnsPerSession: z.number().int().min(1).optional(),
	maxToolRetriesPerTool: z.number().int().min(1).optional(),
	requireCheckpointAfterTask: z.boolean().optional(),
	forbidReReadOnUnchangedDigest: z.boolean().optional(),
});

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Reads and parses a proposal markdown file, returning an ISwarmProposalExtension
 * that merges the base IProposalDocument validation (via parseProposalDocument)
 * with the new swarmBudget and continuityPolicy blocks.
 *
 * Throws `ProposalParseError` with:
 *   - 'INVALID_SWARM_BUDGET'      when swarmBudget fails Zod validation.
 *   - 'INVALID_CONTINUITY_POLICY' when continuityPolicy fails Zod validation.
 *   - (All base errors from parseProposalDocument are propagated unchanged.)
 *
 * @param absolutePath Absolute path to the `.md` proposal file.
 */
export const parseSwarmFrontmatter = async (
	absolutePath: string
): Promise<ISwarmProposalExtension> => {
	// Step 1: Run the base parser. This validates id, type, status, track,
	// budget, acceptanceCriteria, etc. and throws on any base-level error.
	// We do not use the returned document directly here — the goal is just
	// to guarantee base validation runs before we layer the swarm extension.
	await parseProposalDocument(absolutePath);

	// Step 2: Re-read the raw content and extract the YAML block ourselves
	// (same approach as sync-proposal-registry.script.ts) to access
	// swarmBudget / continuityPolicy which are not surfaced by IProposalFrontmatter.
	const raw = await readFile(absolutePath, 'utf8');
	const block = extractYamlBlock(raw);

	// If no YAML block, swarmBudget/continuityPolicy are absent → valid, return empty.
	if (block === null) {
		return {};
	}

	const parsed = parseFrontmatterBlock(block);

	// ---------------------------------------------------------------------------
	// swarmBudget extraction and validation
	// ---------------------------------------------------------------------------
	let swarmBudget: ISwarmBudget | undefined;
	const rawSwarmBudget = parsed['swarmBudget'];

	if (rawSwarmBudget !== undefined && rawSwarmBudget !== null) {
		const result = swarmBudgetSchema.safeParse(rawSwarmBudget);
		if (!result.success) {
			throw new ProposalParseError(
				'INVALID_SWARM_BUDGET',
				absolutePath,
				`Invalid swarmBudget in ${absolutePath}: ${result.error.message}`
			);
		}
		swarmBudget = result.data as ISwarmBudget;
	}

	// ---------------------------------------------------------------------------
	// continuityPolicy extraction and validation
	// ---------------------------------------------------------------------------
	let continuityPolicy: IContinuityPolicy | undefined;
	const rawContinuityPolicy = parsed['continuityPolicy'];

	if (rawContinuityPolicy !== undefined && rawContinuityPolicy !== null) {
		const result = continuityPolicySchema.safeParse(rawContinuityPolicy);
		if (!result.success) {
			throw new ProposalParseError(
				'INVALID_CONTINUITY_POLICY',
				absolutePath,
				`Invalid continuityPolicy in ${absolutePath}: ${result.error.message}`
			);
		}
		continuityPolicy = result.data as IContinuityPolicy;
	}

	return {
		...(swarmBudget !== undefined ? { swarmBudget } : {}),
		...(continuityPolicy !== undefined ? { continuityPolicy } : {}),
	};
};
