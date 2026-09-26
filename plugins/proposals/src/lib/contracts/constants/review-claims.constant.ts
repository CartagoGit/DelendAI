/**
 * The slice a reviewer's unit is entered under. The ref's kind says it is
 * a review (f00644); the unit covers the whole proposal. Units written
 * before the kind existed went by the slice names `review` and `close`,
 * and core still reads those as reviews.
 */
export const REVIEW_UNIT_SLICE = 'all';
