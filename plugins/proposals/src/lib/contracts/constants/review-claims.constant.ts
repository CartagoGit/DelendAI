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

/**
 * The proposals one review unit judges before it is published as a pull
 * request. The reviewer used to publish "when nothing waits", and with a
 * hundred proposals in review nothing ever stopped waiting: on 2026-09-28
 * nine units held their verdicts and none had a pull request, so nothing
 * reached the integration branch. A pack ends in a pull request.
 */
export const REVIEW_PACK_SIZE = 5;
