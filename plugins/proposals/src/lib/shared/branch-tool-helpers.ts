import { toolJson } from '@mcp-vertex/core/public';

export const DEFAULT_STALE_AFTER_MINUTES = 10;
export const DEFAULT_STRANDED_BEHIND_THRESHOLD = 10;
export const DECIMAL_RADIX = 10;

export const toolJsonWithErrorFlag = <T extends { ok: boolean }>(
	result: T,
) => ({
	...toolJson(result),
	...(result.ok ? {} : { isError: true }),
});

export const resolveBaseBranchAndStaleMinutes = (
	args: {
		readonly baseBranch?: string | undefined;
		readonly staleMinutes?: number | undefined;
	},
	defaults: {
		readonly baseBranch?: string | undefined;
		readonly staleMinutes?: number | undefined;
	},
) => ({
	...(args.baseBranch !== undefined
		? { baseBranch: args.baseBranch }
		: defaults.baseBranch !== undefined
			? { baseBranch: defaults.baseBranch }
			: {}),
	...(args.staleMinutes !== undefined
		? { staleMinutes: args.staleMinutes }
		: defaults.staleMinutes !== undefined
			? { staleMinutes: defaults.staleMinutes }
			: {}),
});
