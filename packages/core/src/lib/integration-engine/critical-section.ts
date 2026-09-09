/**
 * critical-section.ts — mutual exclusion for the ONE window that cannot
 * tolerate concurrency, and for nothing else.
 *
 * The swarm's whole value is that workers keep producing checkpoints in
 * parallel. So this is not a queue in front of the engine: agents commit,
 * push, open pull requests and wait for CI concurrently and unserialised.
 * Only this sequence is exclusive:
 *
 *     read the latest integration head
 *   → bring the candidate up to that head
 *   → read the final verdict for the candidate
 *   → compare-and-swap the merge
 *   → record the integrated sha
 *
 * Everything in that list is a read-modify-write of the SAME resource —
 * the integration branch tip — and interleaving two of them is precisely
 * how two independently-green candidates combine into a red branch.
 *
 * The key is the integration branch, not the repository: two branches
 * advance independently and must not block each other.
 *
 * The in-memory implementation is a per-key promise chain, correct for
 * one process. A multi-machine deployment supplies a section backed by
 * the work model's leases instead; that is why this is a port.
 */

/** A named mutual-exclusion region. */
export interface ICriticalSection {
	run<T>(key: string, body: () => Promise<T>): Promise<T>;
}

/**
 * A per-key promise chain. `body` never runs concurrently with another
 * `body` under the same key, and a rejection does not poison the chain
 * for the next waiter — a failed merge must not wedge the branch.
 */
export const createInMemoryCriticalSection = (): ICriticalSection => {
	const chains = new Map<string, Promise<unknown>>();
	return {
		run: <T>(key: string, body: () => Promise<T>): Promise<T> => {
			const previous = chains.get(key) ?? Promise.resolve();
			const next = previous.then(body, body);
			chains.set(
				key,
				next.then(
					() => undefined,
					() => undefined,
				),
			);
			return next;
		},
	};
};

/** The section key for one integration branch of one repository. */
export const integrationSectionKey = (
	repositoryUid: string,
	branch: string,
): string => `${repositoryUid}#${branch}`;
