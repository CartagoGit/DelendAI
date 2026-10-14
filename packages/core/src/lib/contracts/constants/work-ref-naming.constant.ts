/**
 * work-ref-naming.constant.ts — the naming scheme of work and publication
 * refs, as one public object (f00644).
 *
 * The scheme is one concept, so it crosses the public surface as one
 * name: the shape, the kinds of work, the review-batch id and the rule
 * that gives a ref written before the kind its kind. Plugins read it from
 * here and never spell any part of it.
 */
import {
	REVIEW_BATCH_ID,
	WORK_KINDS,
	WORK_REF_SHAPE,
} from '../../development-policy/profiles.constant';
import { legacyWorkKind } from '../../development-policy/work-ref-placeholders';

export const WORK_REF_NAMING = {
	shape: WORK_REF_SHAPE,
	kinds: WORK_KINDS,
	reviewBatchId: REVIEW_BATCH_ID,
	legacyKind: legacyWorkKind,
} as const;
