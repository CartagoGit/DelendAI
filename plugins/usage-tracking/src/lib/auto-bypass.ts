/**
 * auto-bypass.ts — accounting for invocations that auto-bypassed the
 * `confirmBeforeExecute` prompt (f00067 S7).
 *
 * CRITICAL S7 invariant ("the counter is bypassable"): the count is NOT an
 * opt-in side channel. The orchestrator's {@link InvocationManager} stamps
 * `autoBypassed: true` on the SAME invoke result it issues whenever it
 * bypasses the signed-token gate; usage-tracking lifts that flag onto the
 * durable record here, and the summary counter is DERIVED from those records
 * (never mutated out-of-band). There is no code path that spends via a
 * bypass without also stamping — and every stamped row is counted — so the
 * number cannot be circumvented and survives a summary regeneration.
 *
 * Pure: no I/O, metadata only.
 */
import type { IInvocationRecord } from './types';

const asRecord = (value: unknown): Record<string, unknown> | null =>
	value && typeof value === 'object'
		? (value as Record<string, unknown>)
		: null;

/**
 * Read the `autoBypassed` flag off a tool result (checking `structuredContent`
 * first, then the bare object). Anything other than an explicit `true` is a
 * non-bypass (the safe default).
 */
export const extractAutoBypassed = (result: unknown): boolean => {
	const root = asRecord(result);
	if (!root) return false;
	const structured = asRecord(root.structuredContent) ?? root;
	return structured.autoBypassed === true;
};

/** Count the invocations in `records` that auto-bypassed confirmation. */
export const countAutoBypassed = (
	records: readonly IInvocationRecord[],
): number => records.reduce((acc, r) => acc + (r.autoBypassed ? 1 : 0), 0);
