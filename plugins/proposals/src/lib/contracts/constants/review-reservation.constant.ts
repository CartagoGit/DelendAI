/** Where a review's reservation of a proposal lives on the forge. */
export const REVIEW_RESERVATION_NAMESPACE = 'refs/delendai/claims/review/';

/**
 * How long a reservation holds without being renewed, in seconds. A
 * reviewer that claimed and went away must not keep a proposal for ever;
 * four hours is the time a silent unit is given before it counts as left.
 */
export const REVIEW_RESERVATION_SECONDS = 4 * 60 * 60;
