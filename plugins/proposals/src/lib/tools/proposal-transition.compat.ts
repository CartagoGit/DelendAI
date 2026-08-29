/**
 * proposal-transition.compat.ts — f00152 S3 (L2 — compat window for proposal_transition).
 *
 * SOLID notes:
 *   - **SRP**: this file owns the compat wrapper, not the handler.
 *   - **OCP**: future shape changes edit only `v2Schema` and the
 *     `translate` function. Existing callers do not change.
 *   - **DIP**: imports the underlying handler from the original tool
 *     module so the handler is the single source of truth.
 */
import {
	defineCompatWindow,
	parseWithCompatWindow,
	type IDeprecatedShapeUsed,
} from '../contracts/compat-window';
import { runProposalTransition } from './proposal-transition.tool';
import {
	PROPOSAL_TRANSITION_INPUT_SCHEMA,
	type IProposalTransitionArgs,
} from '../contracts/proposal-transition-input.contract';
import type { IProposalTransitionToolOptions } from './proposal-transition.tool';

/** The compat window for proposal_transition. */
export const PROPOSAL_TRANSITION_COMPAT =
	defineCompatWindow<IProposalTransitionArgs>({
		v2: {
			version: 'v2',
			schema: PROPOSAL_TRANSITION_INPUT_SCHEMA,
			sinceVersion: '0.1.0',
			removedIn: 'never',
			migrationHint:
				'v2 is the canonical shape for proposal_transition. v1 is deprecated and will be removed in a future major release.',
			translate: () => ({ id: '', to: 'ready', reason: '' }),
		},
		v1: {
			version: 'v1',
			schema: PROPOSAL_TRANSITION_INPUT_SCHEMA,
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
