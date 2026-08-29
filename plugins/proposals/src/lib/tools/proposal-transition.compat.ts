/**
 * proposal-transition.compat.ts — f00152 S3 (L2 — compat window for proposal_transition).
 *
 * Wraps the existing `runProposalTransition` handler with a v1/v2
 * compat window. Today v1 and v2 are structurally identical (this is
 * a seed slice that exercises the framework) but the window is real:
 * if a future release adds a required field to v2, v1 callers will
 * keep working until `removedIn`, with a structured warning in the
 * response.
 *
 * SOLID notes:
 *   - **SRP**: this file owns the compat wrapper, not the handler.
 *   - **OCP**: future shape changes edit only `v2Schema` and the
 *     `translate` function. Existing callers do not change.
 *   - **DIP**: imports the underlying handler from the original tool
 *     module so the handler is the single source of truth.
 */
import z from 'zod';

import { VALIDATE_EVIDENCE_SCHEMA } from '@mcp-vertex/core/public';

import {
	defineCompatWindow,
	parseWithCompatWindow,
	type IDeprecatedShapeUsed,
} from '../contracts/compat-window';
import {
	PROPOSAL_STATUSES,
	type IProposalStatus,
} from '../contracts/constants/proposal-glossary.constant';
import type { IProposalTransitionArgs } from './proposal-transition.tool';
import { runProposalTransition } from './proposal-transition.tool';
import type { IProposalTransitionToolOptions } from './proposal-transition.tool';

const PROPOSAL_TRANSITION_STATUS_VALUES = Object.keys(PROPOSAL_STATUSES) as [
	IProposalStatus,
	...IProposalStatus[],
];

/** v2 — the canonical (today's) input schema. Mirrors `IProposalTransitionArgs`. */
const v2Schema = z
	.object({
		id: z.string().min(1),
		to: z.enum(PROPOSAL_TRANSITION_STATUS_VALUES),
		reason: z.string().min(1),
		agent: z.string().optional(),
		force: z.boolean().optional(),
		validateEvidence: VALIDATE_EVIDENCE_SCHEMA.optional(),
	})
	.strict();

/** v1 — legacy shape. Today v1 === v2 (seed slice). Future releases will narrow v2. */
const v1Schema = z
	.object({
		id: z.string().min(1),
		to: z.enum(PROPOSAL_TRANSITION_STATUS_VALUES),
		reason: z.string().min(1),
		agent: z.string().optional(),
		force: z.boolean().optional(),
		validateEvidence: VALIDATE_EVIDENCE_SCHEMA.optional(),
	})
	.strict();

/** The compat window for proposal_transition. */
export const PROPOSAL_TRANSITION_COMPAT =
	defineCompatWindow<IProposalTransitionArgs>({
		v2: {
			version: 'v2',
			schema: v2Schema,
			sinceVersion: '0.1.0',
			removedIn: 'never',
			migrationHint:
				'v2 is the canonical shape for proposal_transition. v1 is deprecated and will be removed in a future major release.',
			translate: () => ({ id: '', to: '', reason: '' }),
		},
		v1: {
			version: 'v1',
			schema: v1Schema,
			sinceVersion: '0.1.0',
			removedIn: '1.0.0',
			migrationHint:
				'v1 is the legacy shape for proposal_transition. Migrate to v2 before 1.0.0 — the shape will hard-fail then.',
			translate: (old) => old as IProposalTransitionArgs,
		},
	});

/**
 * Result envelope returned to MCP — the handler adds the
 * `deprecatedShapeUsed` warning to the structured response when the
 * call used the v1 shape.
 */
export type ProposalTransitionCompatResult =
	| {
			readonly ok: true;
			readonly payload: Awaited<ReturnType<typeof runProposalTransition>>;
			readonly deprecatedShapeUsed: IDeprecatedShapeUsed | null;
	  }
	| {
			readonly ok: false;
			readonly error: {
				readonly code: 'compat-window-invalid';
				readonly issues: ReadonlyArray<unknown>;
			};
	  };

/**
 * Run proposal_transition through the compat window. The handler
 * always sees the v2 shape (translated if necessary).
 */
export const runProposalTransitionCompat = async (
	args: unknown,
	options: IProposalTransitionToolOptions,
): Promise<ProposalTransitionCompatResult> => {
	const parsed = parseWithCompatWindow(PROPOSAL_TRANSITION_COMPAT, args);
	if (!parsed.ok) {
		return {
			ok: false,
			error: {
				code: 'compat-window-invalid',
				issues: parsed.error.issues,
			},
		};
	}
	const payload = await runProposalTransition(parsed.value, options);
	return {
		ok: true,
		payload,
		deprecatedShapeUsed: parsed.warning,
	};
};
