/** Where a review's reservation of a proposal lives on the forge. */
export const REVIEW_RESERVATION_NAMESPACE = 'refs/delendai/claims/review/';

/**
 * How long a reservation holds without being renewed, in seconds. A
 * reviewer that claimed and went away must not keep a proposal for ever;
 * four hours is the time a silent unit is given before it counts as left.
 */
export const REVIEW_RESERVATION_SECONDS = 4 * 60 * 60;

/**
 * How long a reservation's unit may be missing from the forge before the
 * reservation counts as ended. A unit is pushed by the durability
 * publisher every few minutes, so a fresh one is not there yet; one still
 * missing after this window has ended (published and merged, or dropped).
 */
export const REVIEW_RESERVATION_UNIT_GRACE_SECONDS = 15 * 60;
