/** Constants for `../../lessons/confidence.helper`. */

/**
 * Below this many supporting observations a pattern is a coincidence
 * rather than a lesson. Two sightings of anything happen by chance in a
 * busy repository, and a store that turns every coincidence into advice
 * is worse than no store — a reader who cannot tell which half to
 * believe stops reading both.
 */
export const DEFAULT_MINIMUM_SUPPORT = 3;

/**
 * How recent an observation has to be to still count as recent.
 *
 * Fourteen days: long enough to survive a quiet week, short enough that
 * a lesson about a command nobody has run since June expires on its own
 * rather than waiting for somebody to notice it is wrong.
 */
export const DEFAULT_RECENCY_WINDOW_MS = 14 * 24 * 60 * 60 * 1000;
