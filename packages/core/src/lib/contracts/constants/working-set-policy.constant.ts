import type { IToolSurfaceWorkingSetPolicy } from '../interfaces/tool-surface.interface';

/**
 * The working set a managed surface keeps when the project configures
 * none of it: a plugin leaves after five idle minutes, at most eight stay
 * warm, and none is evicted within thirty seconds of becoming warm, so an
 * activation is never undone by the next one's pressure.
 */
export const DEFAULT_WORKING_SET_POLICY: Required<IToolSurfaceWorkingSetPolicy> =
	{
		idleTtlMs: 5 * 60_000,
		maxWarmPlugins: 8,
		minWarmMs: 30_000,
	};
