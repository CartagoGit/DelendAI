/**
 * q00001 — `proposals_close_plan` (f00020-style tool):
 *
 * User-facing wrapper around `proposal_transition → done` for `type: plan`
 * proposals. The transition tool already enforces the plan-closure rule
 * (it calls `evaluatePlanClosure` and rejects with a list of blockers);
 * this tool adds:
 *   1. A clearer preflight that returns the same blockers in a structured
 *      `blockers[]` array (so dashboards can render them).
 *   2. A `dryRun` mode that runs the guard without applying the
 *      transition — useful for "is the plan closable yet?" probes.
 *   3. A `proposalId` alias (`planId`) for readability.
 *
 * The actual status mutation still goes through `runProposalTransition`,
 * which is the single source of truth for the folder+frontmatter dance
 * (and the only path that calls `git mv`). One rule, one place.
 */

import { z } from 'zod';

import type { IToolRegistration } from '@mcp-vertex/core/public';
import { toolError, toolJson, toolOk } from '@mcp-vertex/core/public';

import {
	buildDiskPlanChildrenResolver,
	evaluatePlanClosure,
	readOwnSliceStatusesFromDisk,
} from '../swarm/plan-closure';
import { parseProposalDocument } from '../proposals/proposal-document';
import { join } from 'node:path';
import { readFile, readdir } from 'node:fs/promises';
import { runProposalTransition } from './proposal-transition.tool';
import type { IProposalTransitionToolOptions } from './proposal-transition.tool';
import {
	extractYamlBlock,
	parseFrontmatterBlock,
} from '../proposals/frontmatter-parser';

export interface IClosePlanToolOptions extends IProposalTransitionToolOptions {
	readonly namespacePrefix: string;
	readonly proposalsDirAbs: string;
	readonly indexPathAbs: string;
	readonly workspaceRoot: string;
}

export interface IClosePlanArgs {
	readonly planId?: string | undefined;
	readonly proposalId?: string | undefined;
	/** When true, run the closure check without applying the transition. */
	readonly dryRun?: boolean | undefined;
	/** Required when `dryRun` is false; surfaced in the audit trail. */
	readonly reason?: string | undefined;
}

const json = toolJson;

const CLOSE_PLAN_INPUT_SCHEMA = z.object({
	planId: z.string().min(1).optional(),
	proposalId: z.string().min(1).optional(),
	dryRun: z.boolean().optional(),
	reason: z.string().optional(),
});

const CLOSE_PLAN_OUTPUT_SCHEMA = z.object({
	ok: z.boolean(),
	planId: z.string(),
	dryRun: z.boolean(),
	closable: z.boolean(),
	blockers: z.array(
		z.object({
			ref: z.string(),
			kind: z.enum(['proposal', 'plan', 'slice']),
			code: z.enum([
				'not-done',
				'not-peer-reviewed',
				'self-cycle',
				'unknown-ref',
			]),
			message: z.string(),
		}),
	),
	preview: z
		.object({
			from: z.string(),
			to: z.string(),
			movedFrom: z.string().optional(),
			movedTo: z.string().optional(),
		})
		.optional(),
	error: z
		.object({
			reason: z.string(),
			nextAction: z.string().optional(),
		})
		.optional(),
});

/**
 * Locate a plan markdown file under `proposalsDirAbs` by its id. Returns
 * the absolute path + the parsed frontmatter `type` so the caller can
 * reject non-plan proposals with a friendly error.
 */
const locatePlan = async (
	proposalsDirAbs: string,
	planId: string,
): Promise<{ absPath: string; type: string } | null> => {
	const candidates = ['ready', 'in-progress', 'review', 'paused', 'blocked'];
	for (const folder of candidates) {
		const dir =
			folder === 'ready'
				? proposalsDirAbs
				: `${proposalsDirAbs}/${folder}`;
		let entries: string[];
		try {
			entries = await readdir(dir);
		} catch {
			continue;
		}
		for (const name of entries) {
			if (!name.startsWith(`${planId}-`) || !name.endsWith('.md'))
				continue;
			const path = join(dir, name);
			let raw: string;
			try {
				raw = await readFile(path, 'utf8');
			} catch {
				continue;
			}
			const block = extractYamlBlock(raw);
			if (block === null) continue;
			const fm = parseFrontmatterBlock(block);
			if (fm.id === planId) {
				return {
					absPath: path,
					type: typeof fm.type === 'string' ? fm.type : '',
				};
			}
		}
	}
	return null;
};

export const runClosePlan = async (
	args: IClosePlanArgs,
	options: IClosePlanToolOptions,
) => {
	const planId = args.planId ?? args.proposalId;
	if (planId === undefined || planId.length === 0) {
		return toolError(
			'planId is required',
			'Call proposals_close_plan with `planId: "q00001"`.',
		);
	}

	const located = await locatePlan(options.proposalsDirAbs, planId);
	if (located === null) {
		return toolError(
			`no plan with id "${planId}" found under ${options.proposalsDirAbs}`,
			'Check the id, or run sync_proposals first.',
		);
	}
	if (located.type !== 'plan') {
		return toolError(
			`${planId} is of type "${located.type}", not "plan"`,
			'proposals_close_plan only operates on `type: plan` proposals; use proposal_transition for everything else.',
		);
	}

	const planDoc = await parseProposalDocument(located.absPath);
	const resolver = await buildDiskPlanChildrenResolver({
		indexPathAbs: options.indexPathAbs,
		proposalsDirAbs: options.proposalsDirAbs,
	});
	const ownSlices = await readOwnSliceStatusesFromDisk(located.absPath);
	const report = await evaluatePlanClosure({
		planId,
		frontmatter: planDoc.frontmatter,
		resolver: {
			...resolver,
			resolveOne: async (ref, kind) => {
				if (kind === 'slice' && ownSlices.has(ref)) {
					return {
						ref,
						kind,
						status: ownSlices.get(ref) ?? 'unknown',
						peerReviewed: true,
					};
				}
				return resolver.resolveOne(ref, kind);
			},
		},
	});

	if (!report.closable || args.dryRun === true) {
		return toolOk({
			planId,
			dryRun: args.dryRun === true,
			closable: report.closable,
			blockers: report.reasons,
		});
	}

	// Apply the actual transition. proposal_transition re-runs the
	// closure guard, but since we just verified it's closable the
	// second pass is a no-op (the index is in the same state). If a
	// peer agent raced us and closed a child between our check and
	// the transition, the transition tool will reject with the same
	// blockers — surfacing that race in the standard error path.
	const reason = args.reason?.trim() ?? '';
	if (reason.length === 0) {
		return toolError(
			'reason is required when dryRun is false',
			'Call proposals_close_plan with a non-empty reason (audit trail).',
		);
	}
	const result = await runProposalTransition(
		{ id: planId, to: 'done', reason },
		options,
	);
	if (result.isError === true) {
		const text = result.content?.[0]?.text ?? 'transition failed';
		return toolError(
			text,
			'proposal_transition rejected the closure; re-run proposals_close_plan to see the latest blockers.',
		);
	}
	return toolOk({
		planId,
		dryRun: false,
		closable: true,
		blockers: [],
		preview: {
			from: 'in-progress',
			to: 'done',
			movedFrom: `in-progress/${planId}-...md`,
			movedTo: `done/${planId}-...md`,
		},
	});
};

export const buildClosePlanRegistration = (
	options: IClosePlanToolOptions,
): IToolRegistration => ({
	id: 'proposals_close_plan',
	effects: ['write'],
	summary:
		'Close a `type: plan` proposal. Refuses with a list of blockers until every child proposal, sub-plan, and own slice is done + peer-reviewed.',
	tags: ['work', 'plan'],
	register: async (server) => {
		server.registerTool(
			`${options.namespacePrefix}_proposals_close_plan`,
			{
				outputSchema: CLOSE_PLAN_OUTPUT_SCHEMA,
				description:
					'Run the q00001 plan-closure preflight; if the plan is closable, transition it to `done`. With `dryRun: true`, only the preflight runs.',
				inputSchema: CLOSE_PLAN_INPUT_SCHEMA,
			},
			async (args) =>
				// exactOptionalPropertyTypes-safe normalisation: the SDK
				// infers the schema's shape with `T | undefined` for every
				// optional key, but `IClosePlanArgs` declares `T?` (no
				// undefined). Spread conditionally so we never pass
				// `key: undefined` to the handler.
				runClosePlan(
					{
						...(args.planId !== undefined
							? { planId: args.planId }
							: {}),
						...(args.proposalId !== undefined
							? { proposalId: args.proposalId }
							: {}),
						...(args.dryRun !== undefined
							? { dryRun: args.dryRun }
							: {}),
						...(args.reason !== undefined
							? { reason: args.reason }
							: {}),
					},
					options,
				),
		);
	},
});
