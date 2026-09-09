/**
 * fetch-refs.ts — phase 3: make the local clone's view of the world
 * current before anything reasons about it.
 *
 * WHY the fetch is part of reconciliation and not a precondition: the
 * laptop pushed its work refs; the office machine's clone knows nothing
 * about them until somebody fetches. If that fetch were a manual step,
 * the entire promise ("open the editor, everything is reconstructed")
 * would be false. So it happens here, it fetches exactly two things — the
 * integration branch and the managed work-ref namespace — and it prunes,
 * so a ref deleted because it merged disappears locally too.
 *
 * WHY a failed fetch blocks READY without being dangerous: nothing is
 * corrupt and nothing needs repairing, but every later conclusion would
 * be drawn from a stale view. That is a DEGRADED that fixes itself on the
 * next boot with a network, and it deliberately generates no repair task.
 */

import type { IStartupFinding } from '../contracts';
import { finding } from '../finding-catalog';
import type { IObservedRef, IStartupGitSeam } from '../seams';
import { workRefNamespace } from '../work-ref-identity';

/** What phase 3 produced. */
export interface IFetchPhaseResult {
	readonly findings: readonly IStartupFinding[];
	readonly counters: { readonly gitFetches: number };
	/** The ref name later phases compare work against. */
	readonly integrationRef: string;
	readonly integrationSha: string;
	readonly refs: readonly IObservedRef[];
}

/**
 * Prefer the remote-tracking ref: it is what the forge currently says,
 * whereas the local branch is only what this machine last checked out.
 */
const resolveIntegration = async (
	git: IStartupGitSeam,
	branch: string,
): Promise<{ readonly ref: string; readonly sha: string }> => {
	const candidates = [
		`refs/remotes/origin/${branch}`,
		`refs/heads/${branch}`,
		branch,
	];
	for (const candidate of candidates) {
		const sha = await git.resolveRef(candidate);
		if (sha !== undefined) return { ref: candidate, sha };
	}
	return { ref: `refs/heads/${branch}`, sha: '' };
};

export const runFetchPhase = async (input: {
	readonly git: IStartupGitSeam;
	readonly integrationBranch: string;
	readonly workRefPrefix: string;
}): Promise<IFetchPhaseResult> => {
	const findings: IStartupFinding[] = [];
	const outcome = await input.git.fetch({
		integrationBranch: input.integrationBranch,
		workRefPrefix: input.workRefPrefix,
	});
	if (outcome.ok) {
		findings.push(
			finding({
				code: 'fetch.completed',
				phase: 'fetch',
				kind: 'note',
				subject: input.integrationBranch,
				message: `Fetched ${input.integrationBranch} and ${workRefNamespace(input.workRefPrefix) || '(no managed work refs)'}.`,
			}),
		);
	} else {
		findings.push(
			finding({
				code: 'fetch.failed',
				phase: 'fetch',
				kind: 'blocker',
				subject: input.integrationBranch,
				message: `Could not fetch: ${outcome.reason ?? 'unknown reason'}. Local state may be stale, so this boot is not READY.`,
			}),
		);
	}

	const integration = await resolveIntegration(
		input.git,
		input.integrationBranch,
	);
	if (integration.sha.length === 0) {
		findings.push(
			finding({
				code: 'fetch.failed',
				phase: 'fetch',
				kind: 'blocker',
				subject: input.integrationBranch,
				message: `The integration branch ${input.integrationBranch} does not resolve in this clone.`,
			}),
		);
	}

	const refs = await input.git.listRefs(input.workRefPrefix);
	return {
		findings,
		counters: { gitFetches: 1 },
		integrationRef: integration.ref,
		integrationSha: integration.sha,
		refs,
	};
};
