/**
 * unit-reconcile.service.ts — the reconciler's entry points for the
 * callers that live outside it: a unit entered again, and the end pass the
 * maintaining server runs. Neither caller names a step; the steps stay
 * the reconciler's own.
 */
import type { IInvariantResult } from '../contracts/interfaces/workflow-invariants.interface';
import {
	huskDirectories,
	husksInvariant,
	keepStrayFiles,
} from './husk-directories.service';
import { endFinishedUnits } from './finished-units-end.service';
import { reenteredUnit } from './kept-unit-hydration.service';

/** A unit entered again: brought forward when empty, given its dependencies. */
export const reconcileReentry = (
	...input: Parameters<typeof reenteredUnit>
): ReturnType<typeof reenteredUnit> => reenteredUnit(...input);

/** End every finished unit of a clone, keeping their tips. */
export const reconcileFinishedUnits = (
	...input: Parameters<typeof endFinishedUnits>
): ReturnType<typeof endFinishedUnits> => endFinishedUnits(...input);

/** The doctor's husk invariant: every directory beside the units is a unit. */
export const huskReport = async (input: {
	readonly root: string;
	readonly now: number;
	readonly windowSeconds: number;
}): Promise<IInvariantResult> =>
	husksInvariant(
		await huskDirectories({ root: input.root, now: input.now }),
		input.windowSeconds,
	);

/** Keep the stray files of the units' folder on the forge's side, deleting none. */
export const reconcileStrayFiles = (
	...input: Parameters<typeof keepStrayFiles>
): ReturnType<typeof keepStrayFiles> => keepStrayFiles(...input);
