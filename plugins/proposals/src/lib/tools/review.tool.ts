import type { IToolRegistration } from '@mcp-vertex/core/public';

import type { IAuthoringToolOptions } from './authoring-options';
import {
	buildReviewRegistration as buildAuthoringReviewRegistration,
	REVIEW_INPUT_SCHEMA,
	REVIEW_OUTPUT_SCHEMA,
} from './authoring.tool';

/**
 * Dedicated entry point for `proposal_review`.
 *
 * The implementation remains shared with the existing authoring tool surface
 * so the same submit/approve/request_changes flow and identity checks apply
 * everywhere until the host wiring switches to this file directly.
 *
 * x00154 S4: schemas mirror `buildAuthoringReviewRegistration` in
 * `authoring.tool.ts` — the delegate owns the runtime handler; these
 * declarations exist so this wrapper satisfies the bootstrap §6 invariant
 * that every tool file carries an explicit inputSchema/outputSchema pair.
 * Keep the two in lock-step; the verify:tools gate asserts parity.
 */
export const buildReviewRegistration = (
	options: IAuthoringToolOptions,
): IToolRegistration => buildAuthoringReviewRegistration(options);

// Re-export so callers of the wrapper surface can introspect the
// schemas the delegate will register. The delegate is still the
// source of truth at runtime.
export const inputSchema = REVIEW_INPUT_SCHEMA;
export const outputSchema = REVIEW_OUTPUT_SCHEMA;
