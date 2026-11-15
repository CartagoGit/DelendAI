/**
 * readiness.ts — whether a pull request is ready to land, and why not.
 */
import type { IPullRequestChecks } from './readiness.interface';

/**
 * Why a pull request is not ready to land, or `undefined` when it is:
 * a draft; a head the forge never built (pushed by an actor whose
 * pushes start no CI, and no required check reports on it: once the integrator's
 * reopen made the forge build it, its checks are the proof); no required
 * check where the policy did not opt in (nothing was proved); a required
 * check missing, pending or red on its head; or a label that blocks it.
 */
export const whyNotReady = (facts: IPullRequestChecks): string | undefined => {
	if (facts.draft) return 'a draft';
	if (
		!facts.required.some((name) =>
			facts.checks.some((check) => check.name === name),
		) &&
		facts.headAuthor !== undefined &&
		facts.unbuiltAuthors.includes(facts.headAuthor)
	)
		return `its head was pushed by ${facts.headAuthor}, whose pushes start no CI: it needs a head pushed by its author`;
	if (facts.required.length === 0 && !facts.withoutChecks)
		return 'no check is required, and the policy does not land unproved work';
	const conclusionOf = (name: string): string | null | undefined =>
		facts.checks.find((check) => check.name === name)?.conclusion;
	const red = facts.required.filter((name) => {
		const conclusion = conclusionOf(name);
		return (
			conclusion !== undefined &&
			conclusion !== null &&
			conclusion !== 'success'
		);
	});
	if (red.length > 0) return `${red.join(', ')} did not pass`;
	const waiting = facts.required.filter(
		(name) => conclusionOf(name) !== 'success',
	);
	if (waiting.length > 0) return `waiting for ${waiting.join(', ')}`;
	const blocking = facts.labels.filter((label) =>
		facts.blockingLabels.includes(label),
	);
	if (blocking.length > 0) return `labelled ${blocking.join(', ')}`;
	return undefined;
};

/** Whether a pull request is ready to land: nothing keeps it out (`whyNotReady`). */
export const pullRequestReady = (facts: IPullRequestChecks): boolean =>
	whyNotReady(facts) === undefined;
