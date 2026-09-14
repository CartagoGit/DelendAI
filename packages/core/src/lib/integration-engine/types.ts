/**
 * types.ts — the vocabulary of the pull-request integration engine, kept
 * in one file so every step (`pull-request-step`, `validation-step`,
 * `merge-step`, `cleanup-step`) reads as pure mechanism.
 *
 * WHY the shapes look the way they do:
 *
 *  - Every operation returns a RESULT and never throws for an expected
 *    outcome. "The head moved", "CI is red", "the merge was refused
 *    because the base changed" are facts about the candidate that another
 *    component has to route on; a thrown error would flatten all three
 *    into "something went wrong" and lose the evidence.
 *  - A candidate carries its OWN base integration sha. That single field
 *    is what makes strict-latest checkable: the engine can always ask
 *    "was this validated against the head the branch has right now?"
 *    rather than trusting that it was recent.
 *  - Optional fields are written `readonly x?: T` and only ever assembled
 *    through an explicit spread — `exactOptionalPropertyTypes` is on.
 */

export type {
	IIntegrationRepositoryRef,
	IIntegrationCandidate,
	IValidationVerdict,
	IValidationReport,
	ICycleStatus,
	IIntegrationPullRequest,
	INextGenerationPlan,
	IWorkRefEvidence,
	IWorkRefDisposition,
	IIntegrationCycleResult,
} from './types.interface';
export {
	VALIDATION_VERDICTS,
	CYCLE_STATUSES,
} from './types.constant';
