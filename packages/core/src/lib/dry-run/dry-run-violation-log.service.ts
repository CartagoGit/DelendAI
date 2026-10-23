/**
 * dry-run/dry-run-violation-log.ts — r00037 S1 (post-hoc detection, made
 * noisy and persistent).
 *
 * `enforce.ts`'s `enforceDryRunReturnContract` already refuses to
 * forward a malformed dry-run response; what it did not do is remember
 * WHO was responsible. This module is a bounded in-process ring buffer
 * of every such violation, keyed by the plugin/tool that caused it —
 * the same "record the bypass" idiom `shared/git-write.ts` uses for
 * authorized force pushes (`listForcePushAuthorizations` /
 * `clearForcePushAuthorizationsForTests`), copied here rather than
 * generalised because the two logs serve different consumers (git
 * audit vs. dry-run migration pressure) and coupling them would leak
 * git vocabulary into a module that has none today.
 *
 * This is explicitly the INTERMEDIATE step, not the fix: a violation
 * recorded here already happened — the handler ran, the effect (if
 * any) already occurred. What this buys is measurable, nameable
 * migration pressure (a host can surface `listDryRunViolations()` in
 * `report_status` and see exactly which plugin to fix next) while the
 * `EffectBroker` (S2/S3) makes the underlying mutation itself
 * impossible, independent of whether any plugin honours `dryRun`.
 */
import type { IDryRunContractViolationRecord } from '../contracts/interfaces/dry-run-violation.interface';

const MAX_RECORDED_DRY_RUN_VIOLATIONS = 200;
const dryRunViolations: IDryRunContractViolationRecord[] = [];

/** Append one violation, dropping the oldest once the buffer is full. */
export const recordDryRunViolation = (
	record: IDryRunContractViolationRecord,
): void => {
	dryRunViolations.push(record);
	if (dryRunViolations.length > MAX_RECORDED_DRY_RUN_VIOLATIONS) {
		dryRunViolations.shift();
	}
};

/** Recent dry-run contract violations, oldest first. For introspection/tests. */
export const listDryRunViolations =
	(): readonly IDryRunContractViolationRecord[] => [...dryRunViolations];

/** Test-only: clears the in-memory audit buffer between specs. */
export const clearDryRunViolationsForTests = (): void => {
	dryRunViolations.length = 0;
};
