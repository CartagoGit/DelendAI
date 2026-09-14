/**
 * Contract shapes for `./inspect-desired-vs-live`.
 *
 * Split out of the implementation module so the repo's "types and
 * constants live in contracts" convention holds: `inspect-desired-vs-live.ts` keeps
 * the behaviour, this file keeps the shapes. Re-exported from
 * `inspect-desired-vs-live.ts`, so no import site changes.
 */

import type {
	IDesiredForgeState,
	IForgeRepositoryRef,
} from './governance-contracts';
import type { ILiveForgeState } from './provider-contracts';

/** Inputs to `inspectDesiredVsLive`. */
export interface IInspectInput {
	readonly desired: IDesiredForgeState;
	readonly live: ILiveForgeState;
	readonly target: IForgeRepositoryRef;
}
