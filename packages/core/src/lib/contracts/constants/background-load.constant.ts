/**
 * background-load.constant.ts — how much of the machine background work
 * and proofs may take by default.
 */

/** Raise or lower the OS priority of background work; `off` leaves it alone. */
export const BACKGROUND_NICE_VARIABLE = 'DELENDAI_BACKGROUND_NICE';

/** Raise (or lower) the parallelism of background work and proofs. */
export const BACKGROUND_WORKERS_VARIABLE = 'DELENDAI_BACKGROUND_WORKERS';

/** The lowest priority: the owner's own work always wins. */
export const BACKGROUND_DEFAULT_NICE = 19;
