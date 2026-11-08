/**
 * How long a passing validate run stands as evidence about the tree.
 *
 * Twenty-four hours: long enough that an agent working through a
 * proposal does not have to re-run a ten-minute chain for every slice,
 * short enough that the evidence still describes something recognisably
 * like the current checkout.
 */
export const VALIDATE_EVIDENCE_MAX_AGE_MS = 24 * 60 * 60 * 1000;
