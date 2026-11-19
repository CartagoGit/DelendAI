/**
 * unit-reconcile.service.ts — the reconciler's entry points for the
 * callers that live outside it: a unit entered again, and the end pass the
 * maintaining server runs. Neither caller names a step; the steps stay
 * the reconciler's own.
 */
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
