/**
 * validation-step.ts — turning a forge's check report into the one
 * question the merge cares about: may this sha advance the integration
 * branch?
 *
 * The rule that matters is FAIL CLOSED. Only an explicit, complete set of
 * successes is green. A required context the forge has not reported at
 * all is `pending`, never "absent, therefore fine" — a check that has not
 * started yet and a check that does not exist are indistinguishable from
 * here, and treating either as a pass is how an unvalidated candidate
 * reaches the integration branch.
 *
 * When the policy names NO required contexts it has said "the forge
 * decides", so the forge's own roll-up is used. Its absence is still not
 * a pass: no verdict means `pending`.
 *
 * `neutral` counts as success, matching the forges' own semantics for a
 * check that ran and declined to have an opinion. `cancelled` and
 * `timed_out` count as failures, because a candidate whose validation was
 * abandoned has not been validated.
 */

import type { IResolvedDevelopmentPolicy } from '../contracts/interfaces/development-policy.interface';
import type { IForgeCheck, IForgeChecksReport } from './forge-port';
import type { IValidationReport } from './types';

const SUCCEEDED = new Set(['success', 'neutral']);
const FAILED = new Set(['failure', 'cancelled', 'timed_out']);

/** Latest reported state per context; later entries win. */
const byName = (
	checks: readonly IForgeCheck[],
): ReadonlyMap<string, IForgeCheck['state']> => {
	const states = new Map<string, IForgeCheck['state']>();
	for (const check of checks) states.set(check.name, check.state);
	return states;
};

/** Verdict when the policy names the contexts that must pass. */
const evaluateRequired = (
	required: readonly string[],
	report: IForgeChecksReport,
): IValidationReport => {
	const states = byName(report.checks);
	const failed = required.filter((name) =>
		FAILED.has(states.get(name) ?? ''),
	);
	const outstanding = required.filter(
		(name) => !SUCCEEDED.has(states.get(name) ?? ''),
	);
	if (failed.length > 0) {
		return {
			verdict: 'red',
			sha: report.sha,
			outstanding,
			failed,
			reason: `Required checks failed: ${failed.join(', ')}.`,
		};
	}
	if (outstanding.length > 0) {
		return {
			verdict: 'pending',
			sha: report.sha,
			outstanding,
			failed,
			reason: `Required checks have not succeeded yet: ${outstanding.join(', ')}.`,
		};
	}
	return {
		verdict: 'green',
		sha: report.sha,
		outstanding: [],
		failed: [],
		reason: `All ${String(required.length)} required checks succeeded.`,
	};
};

/** Verdict when the policy defers to the forge's own roll-up. */
const evaluateAggregate = (report: IForgeChecksReport): IValidationReport => {
	const failed = report.checks
		.filter((check) => FAILED.has(check.state))
		.map((check) => check.name);
	const outstanding = report.checks
		.filter((check) => !SUCCEEDED.has(check.state))
		.map((check) => check.name);
	const aggregate =
		report.aggregate ??
		(failed.length > 0
			? 'red'
			: report.checks.length > 0 && outstanding.length === 0
				? 'green'
				: 'pending');
	return {
		verdict: aggregate,
		sha: report.sha,
		outstanding,
		failed,
		reason:
			aggregate === 'green'
				? 'The forge reports the candidate as green.'
				: aggregate === 'red'
					? `The forge reports the candidate as red: ${failed.join(', ') || 'no passing verdict'}.`
					: 'The forge has not reported a conclusive verdict yet.',
	};
};

/**
 * The verdict for one candidate sha. Pure: the caller does the reading,
 * so the decision itself is testable without a forge at all.
 */
export const evaluateValidation = (
	policy: IResolvedDevelopmentPolicy,
	report: IForgeChecksReport,
): IValidationReport =>
	policy.integration.requiredChecks.length > 0
		? evaluateRequired(policy.integration.requiredChecks, report)
		: evaluateAggregate(report);

/** How a verdict is stored on the generation. */
export const validationStateOf = (
	report: IValidationReport,
): 'green' | 'red' | 'pending' => report.verdict;
