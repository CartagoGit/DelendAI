/**
 * Contract shapes for `./policy-gate`.
 *
 * Split out of the implementation module so the repo's "types and
 * constants live in contracts" convention holds: `policy-gate.ts` keeps
 * the behaviour, this file keeps the shapes. Re-exported from
 * `policy-gate.ts`, so no import site changes.
 */

/** Whether the integration engine may act, and why not when it may not. */
export interface IPolicyGateVerdict {
	readonly allowed: boolean;
	/** Empty when allowed; otherwise one sentence naming the axis. */
	readonly reason: string;
}
