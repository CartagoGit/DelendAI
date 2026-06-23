/**
 * close-plan.tool.ts
 *
 * `proposals_close_plan` — user-facing wrapper around
 * `proposal_transition → done` for `type: plan` proposals (q00001).
 *
 * Post-SOLID-refactor:
 *   - Discovery (finding the plan file) delegates to
 *     `proposals/locate.ts#locateProposal`, which both index- and
 *     scan-resolves in one call. The previous inline `locatePlan`
 *     helper is gone (DRY).
 *   - Closure evaluation delegates to `evaluatePlanClosure` from the
 *     engine module. The previous hand-built wrapper around
 *     `buildDiskPlanChildrenResolver` is gone — the disk resolver
 *     now accepts the own-slice Map directly via its `ownSlices`
 *     option, no casting, no ad-hoc decorator (ISP).
 *   - The actual status mutation still goes through
 *     `runProposalTransition`, which is the single source of truth
 *     for the folder+frontmatter dance (and the only path that
 *     calls `git mv`). One rule, one place.
 */

import { z } from 'zod';

import type { IToolRegistration } from '@mcp-vertex/core/public';
import { toolError, toolOk } from '@mcp-vertex/core/public';

import { parseProposalDocument } from '../proposals/proposal-document';
import { locateProposal } from '../proposals/locate';
import { evaluatePlanClosure } from '../swarm/plan-closure.engine';
import {
	buildDiskPlanChildrenResolver,
	readOwnSliceStatusesFromDisk,
} from '../swarm/plan-closure.resolvers';
import { runProposalTransition } from './proposal-transition.tool';
import type { IProposalTransitionToolOptions } from './proposal-transition.tool';

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
 * Build a resolver + evaluate closure for a given plan. Extracted
 * from `runClosePlan` so the SRP is obvious: this function does
 * nothing but "given a plan file, run the preflight".
 *
 * The own-slice status Map is read once and passed straight into the
 * disk resolver's `ownSlices` option — no wrapper resolver, no
 * duck-typed cast. This is the same shape the test resolver uses, so
 * the engine treats both identically.
 */
const runPreflight = async (
	planId: string,
	absPath: string,
	options: IClosePlanToolOptions,
) => {
	const planDoc = await parseProposalDocument(absPath);
	const ownSlices = await readOwnSliceStatusesFromDisk(absPath);
	const resolver = await buildDiskPlanChildrenResolver({
		indexPathAbs: options.indexPathAbs,
		proposalsDirAbs: options.proposalsDirAbs,
		ownSlices,
	});
	return evaluatePlanClosure({
		planId,
		frontmatter: planDoc.frontmatter,
		resolver,
	});
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

	const located = await locateProposal(planId, {
		indexPathAbs: options.indexPathAbs,
		proposalsDirAbs: options.proposalsDirAbs,
	});
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

	const report = await runPreflight(planId, located.absPath, options);

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

/**
 * Normalise MCP schema args → `IClosePlanArgs` without passing
 * `key: undefined` (which would violate the strict
 * `exactOptionalPropertyTypes` setting).
 */
const normaliseArgs = (
	args: z.infer<typeof CLOSE_PLAN_INPUT_SCHEMA>,
): IClosePlanArgs => ({
	...(args.planId !== undefined ? { planId: args.planId } : {}),
	...(args.proposalId !== undefined ? { proposalId: args.proposalId } : {}),
	...(args.dryRun !== undefined ? { dryRun: args.dryRun } : {}),
	...(args.reason !== undefined ? { reason: args.reason } : {}),
});

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
			async (args) => runClosePlan(normaliseArgs(args), options),
		);
	},
});
