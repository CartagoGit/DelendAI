/**
 * What another agent is currently holding.
 *
 * commit-policy and proposals are deliberately independent: either has
 * to run without the other, and neither imports the other. But on a
 * shared checkout they are two halves of one problem. proposals knows
 * which files an agent has claimed and is midway through editing.
 * commit-policy decides what goes into a commit and, with a push
 * trigger, straight onto the shared branch. Nothing connected them, so a
 * timer commit could sweep up a file another agent had open, commit it
 * half-written, and push it — and the shared branch goes red for a
 * reason nobody introduced deliberately. Every agent's closing gate then
 * refuses, and the swarm loops with work piling up.
 *
 * The connection is one injected function. commit-policy asks "is
 * anything here held by someone else?" and does not care who answers, so
 * it stays agnostic; a host with no proposals plugin passes nothing and
 * behaves exactly as before.
 */
export interface IForeignLockHolding {
	/** Repo-relative path the other agent claimed. */
	readonly file: string;
	/** Who holds it, for the refusal message. */
	readonly agent: string;
	/** Their task id, so the caller can wait on the right lock. */
	readonly taskId: string;
}

/**
 * Returns the live claims held by agents OTHER than `selfAgent`.
 * Expired and self-owned claims must already be filtered out by the
 * provider — the driver treats whatever comes back as authoritative.
 *
 * Must never throw and never block: a provider that cannot read the
 * lock file returns an empty list, which degrades to today's behaviour
 * rather than stopping the commit.
 */
export type ForeignLockProvider = (input: {
	readonly files: readonly string[];
	readonly selfAgent: string | undefined;
}) => Promise<readonly IForeignLockHolding[]>;
