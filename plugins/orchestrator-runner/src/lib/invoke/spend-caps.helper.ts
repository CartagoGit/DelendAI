/**
 * spend-caps.helper.ts — the configured spend caps, read from where they
 * are configured.
 *
 * The caps belong to `usage-tracking` (`maxSessionSpendUsd`,
 * `maxMonthlySpendUsd`). The runner used to learn them only from the usage
 * summary that plugin writes, so when the summary could not be read the
 * runner did not even know a cap existed. It now reads them from the
 * configuration view every plugin receives (`ctx.pluginOptions`), which is
 * the authority; the summary still supplies what has been spent.
 *
 * Reading a sibling's options is the documented, read-only cross-plugin
 * view. It imports no code from `usage-tracking` and writes nothing.
 */
import type { ISpendCaps } from '../contracts/interfaces/spend-caps.interface';

/** A non-negative finite number, or `null`. A cap of 0 is a real cap. */
const capOrNull = (value: unknown): number | null =>
	typeof value === 'number' && Number.isFinite(value) && value >= 0
		? value
		: null;

/**
 * The caps configured for `usage-tracking`. With the plugin absent or no
 * caps set, both are `null`: there is nothing to exceed.
 */
export const spendCapsFrom = (
	usageTrackingOptions: Readonly<Record<string, unknown>> | undefined,
): ISpendCaps => ({
	sessionUsd: capOrNull(usageTrackingOptions?.maxSessionSpendUsd),
	monthlyUsd: capOrNull(usageTrackingOptions?.maxMonthlySpendUsd),
});
