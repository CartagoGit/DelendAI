/**
 * spend-caps.interface.ts — the spend caps an operator configured.
 *
 * The caps are configuration, owned by `usage-tracking`
 * (`maxSessionSpendUsd`, `maxMonthlySpendUsd`). The usage summary only
 * projects what was spent against them. The guard reads the two
 * separately, because "is there a cap" and "how much has been spent" can
 * fail independently. When the summary cannot be read, the cap is still
 * known, and a known cap with unknown spend is not permission to spend.
 */
export interface ISpendCaps {
	/** Per-session cap in USD, or `null` when none is configured. */
	readonly sessionUsd: number | null;
	/** Per-month cap in USD, or `null` when none is configured. */
	readonly monthlyUsd: number | null;
}
