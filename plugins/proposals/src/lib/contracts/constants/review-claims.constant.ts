/**
 * The slice a reviewer's unit is entered under. The ref's kind says it is
 * a review (f00644); the unit covers the whole proposal. Units written
 * before the kind existed went by the slice names `review` and `close`,
 * and core still reads those as reviews.
 */
export const REVIEW_UNIT_SLICE = 'all';

/** The proposal segment of a review batch, from the naming scheme's one source. */
import { WORK_REF_NAMING } from '@delendai/core/public';

export const REVIEW_BATCH_ID = WORK_REF_NAMING.reviewBatchId;

/** The trailer a review batch claims a proposal with. */
export const REVIEW_CLAIM_TRAILER = 'Claims';
