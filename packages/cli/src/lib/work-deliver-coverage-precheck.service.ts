/**
 * work-deliver-coverage-precheck.service.ts — the coverage pre-check of
 * `work deliver`: the mirror specs of the changed modules only, with
 * coverage collected on the changed files only.
 *
 * Changed-file coverage was found missing after a full proof: the coverage
 * gate counts only the coverage mirror-named specs give, and the proof ran
 * every nearby spec first. The fast path is the proof's own gate
 * (`prove --only=coverage-precheck`: the mirror specs, then the coverage
 * script on their report), so it counts as the gate counts and refuses with
 * the gate's message; it runs after the static pre-check and before the slot.
 */

import { COVERAGE_PRECHECK_GATE } from '../contracts/constants/coverage-precheck.constant';

/** The flag that asks the proof for the coverage pre-check alone. */
export const coveragePrecheckFlag = (): string =>
	`--only=${COVERAGE_PRECHECK_GATE}`;
