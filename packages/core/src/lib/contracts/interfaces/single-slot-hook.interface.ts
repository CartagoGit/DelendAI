/**
 * A plugin's claim on one of the host's single-slot hooks.
 *
 * `logsSink` and `isAgentStuck` admit exactly one provider — the host
 * routes logs to one destination and gets one answer about stuckness —
 * so a second claimant is dropped. See `single-slot-hooks.ts` for why
 * the loser has to be named rather than silently ignored.
 */
export interface ISingleSlotClaim {
	readonly slot: 'logsSink' | 'isAgentStuck';
	readonly pluginName: string;
}

export interface ISingleSlotContention {
	readonly lines: readonly string[];
}
