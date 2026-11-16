/**
 * The code a transition refusal carries when the proposal already stands
 * in the status it was asked to enter and that status is review. A caller
 * that hands a unit over reads this code, never the refusal's wording.
 */
export const ALREADY_IN_REVIEW_CODE = 'already-in-review' as const;
