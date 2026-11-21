/**
 * delegation-rollup.interface.ts — delegations compared, per kind of task,
 * with and without a manifest.
 */
import type { IDelegationKind } from '@delendai/contracts';

export interface IDelegationRollupRow {
	/** The task's tags, sorted and joined: the kind of task. */
	readonly task: string;
	readonly delegation: IDelegationKind;
	readonly steps: number;
	/** Mean of the totals the host reported for each step. */
	readonly meanTokensUsed: number;
	/** Only the steps whose host observed input and output tokens. */
	readonly observed: {
		readonly steps: number;
		readonly meanInputTokens: number | null;
		readonly meanOutputTokens: number | null;
	};
	readonly meanManifestBytes: number | null;
	/** Steps whose subagent asked for more context than it was given. */
	readonly contextRequested: number;
}

export interface IDelegationRollup {
	readonly rows: readonly IDelegationRollupRow[];
}
