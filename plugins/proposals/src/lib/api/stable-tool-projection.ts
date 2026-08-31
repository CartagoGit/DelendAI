/**
 * proposals/src/lib/api/stable-tool-projection.ts — v00133 (S2)
 *
 * Adapter that applies the shared projection primitive
 * (packages/core/src/lib/contracts/output) over the proposals
 * stable tool surface so consumers can request a compact projection,
 * a fields allow-list, or a maxBytes budget on the tool catalog
 * without losing the full fallback.
 *
 * Source of truth is `PROPOSALS_STABLE_TOOL_SURFACE`, the
 * serializable representation exported by
 * `proposals-stable-tools.ts`; this is what the adaptive facade
 * and other callers consume, so the projection runs over the same
 * payload they will see.
 */

import { projectValue } from '@mcp-vertex/core/public';

import { PROPOSALS_STABLE_TOOL_SURFACE } from './proposals-stable-tools';

export type {
	IProjectionRequest,
	IProjectionResult,
} from '@mcp-vertex/core/public';

export const projectProposalsStableTools = (
	request: Parameters<typeof projectValue>[1] = {},
) => projectValue(PROPOSALS_STABLE_TOOL_SURFACE, request);
