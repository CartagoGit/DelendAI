import type { IToolRegistration } from '@mcp-vertex/core/public';

import type { IAuthoringToolOptions } from './authoring-options';
import { buildReviewRegistration as buildAuthoringReviewRegistration } from './authoring.tool';

/**
 * Dedicated entry point for `proposal_review`.
 *
 * The implementation remains shared with the existing authoring tool surface
 * so the same submit/approve/request_changes flow and identity checks apply
 * everywhere until the host wiring switches to this file directly.
 */
export const buildReviewRegistration = (
	options: IAuthoringToolOptions,
): IToolRegistration => buildAuthoringReviewRegistration(options);
