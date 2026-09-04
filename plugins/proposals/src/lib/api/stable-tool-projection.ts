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

import {
	projectValue,
	type IArtifactHandle,
	type IHandleStore,
	type IProjectionResult,
	type IStableManifestTool,
} from '@delendai/core/public';

import { PROPOSALS_STABLE_TOOL_SURFACE } from './proposals-stable-tools';

export type {
	IProjectionRequest,
	IProjectionResult,
} from '@delendai/core/public';

export interface IProjectionArtifactHandle extends IArtifactHandle {
	readonly projectedBytes: number;
}

export interface IStableToolProjectionOptions {
	readonly handleStore?: IHandleStore<readonly IStableManifestTool[]>;
	readonly handleTtlMs?: number;
	readonly handleMaxBytes?: number;
	readonly handleLabel?: string;
}

export type IStableToolProjectionResult = IProjectionResult<
	readonly IStableManifestTool[]
> & {
	readonly artifact: IProjectionArtifactHandle | null;
};

export const projectProposalsStableTools = (
	request: Parameters<typeof projectValue>[1] = {},
	options: IStableToolProjectionOptions = {},
): IStableToolProjectionResult => {
	const projection = projectValue(PROPOSALS_STABLE_TOOL_SURFACE, request);
	if (!projection.truncatedByBytes || options.handleStore === undefined) {
		return Object.freeze({
			...projection,
			artifact: null,
		});
	}
	const fullProjection = projectValue(PROPOSALS_STABLE_TOOL_SURFACE, {
		...(request.mode !== undefined ? { mode: request.mode } : {}),
	});
	const handle = options.handleStore.open(
		fullProjection.value as readonly IStableManifestTool[],
		{
			...(options.handleTtlMs !== undefined
				? { ttlMs: options.handleTtlMs }
				: {}),
			...(options.handleMaxBytes !== undefined
				? { maxBytes: options.handleMaxBytes }
				: {}),
			label: options.handleLabel ?? 'proposals.stable-tool-projection',
		},
	);
	return Object.freeze({
		...projection,
		artifact: Object.freeze({
			...handle,
			projectedBytes: fullProjection.emittedBytes,
		}),
	});
};
