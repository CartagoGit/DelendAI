/**
 * Contract shapes for `./finding-catalog`.
 *
 * Split out of the implementation module so the repo's "types and
 * constants live in contracts" convention holds: `finding-catalog.ts` keeps
 * the behaviour, this file keeps the shapes. Re-exported from
 * `finding-catalog.ts`, so no import site changes.
 */

import type { IFindingDetail, IFindingKind, IStartupPhase } from './contracts';

/** Arguments for `finding` — narrow so a call site cannot lie about class. */
export interface IFindingInput {
	readonly code: string;
	readonly phase: IStartupPhase;
	readonly kind: IFindingKind;
	readonly subject: string;
	readonly message: string;
	readonly detail?: IFindingDetail | undefined;
}
