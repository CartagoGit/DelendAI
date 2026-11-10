/**
 * readiness.ts — whether a pull request is ready to land.
 */
import type { IPullRequestChecks } from './readiness.interface';

/**
 * Whether a pull request is ready to land: not a draft, every required
 * check green on its head (a missing or pending one is not green), and no
 * label that blocks it. No required check at all is not green: it means
 * nothing was proved, so it lands only where the policy says so
 * (`withoutChecks`).
 */
export const pullRequestReady = (facts: IPullRequestChecks): boolean =>
	!facts.draft &&
	(facts.required.length > 0 || facts.withoutChecks) &&
	facts.required.every((name) =>
		facts.checks.some(
			(check) => check.name === name && check.conclusion === 'success',
		),
	) &&
	!facts.labels.some((label) => facts.blockingLabels.includes(label));
