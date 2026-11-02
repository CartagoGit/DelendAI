/**
 * Contract shapes for `./policy-gate`.
 *
 * Split out of the implementation module so the repo's "types and
 * constants live in contracts" convention holds: `policy-gate.ts` keeps
 * the behaviour, this file keeps the shapes. Re-exported from
 * `policy-gate.ts`, so no import site changes.
 */

/** Why the gate opened or stayed shut, in words an operator can act on. */
export interface IStartupReconciliationGate {
	readonly required: boolean;
	readonly reason: string;
}
