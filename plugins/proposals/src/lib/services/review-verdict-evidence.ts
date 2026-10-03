/**
 * review-verdict-evidence.ts — a verdict a reader can check.
 *
 * `approve` already demanded a commit, a validate exit code and a test
 * count, and then wrote `approved by <agent>` into the proposal: the
 * evidence went to a journal and the line a person reads said nothing. A
 * swarm left fourteen such lines in one night. And `request_changes`
 * needed no commit at all, so a reviewer that had inspected nothing sent
 * a slice merged two days earlier back to its implementer.
 *
 * Here: the approval's note carries its evidence; the commit it names is
 * one the integration branch has; and a change request for work that
 * history shows was delivered names the commit it objects to.
 */
import type { IGitRunner } from '../shared/git-runner';

/** Hex characters of a commit a person can still tell apart. */
const SHORT_COMMIT = 12;

/** The note an approval is recorded with: what was checked, then why. */
export const approvalNote = (
	evidence: {
		readonly commitHash: string;
		readonly testsPassing: number;
		readonly testsTotal: number;
	},
	note: string,
): string => {
	const checked = `verified at ${evidence.commitHash.slice(0, SHORT_COMMIT)}, validate exit 0, tests ${String(evidence.testsPassing)}/${String(evidence.testsTotal)}`;
	const reason = note.trim();
	return reason.length > 0 ? `${checked} — ${reason}` : checked;
};

/**
 * Whether the integration branch has `commit`: `undefined` when this
 * repository has no such branch to ask (a scratch directory, a fixture),
 * so nothing can be said either way.
 */
export const commitIsIntegrated = async (
	run: IGitRunner,
	integration: string,
	commit: string,
): Promise<boolean | undefined> => {
	const branch = await run([
		'rev-parse',
		'-q',
		'--verify',
		`${integration}^{commit}`,
	]);
	if (!branch.ok) return undefined;
	return (await run(['merge-base', '--is-ancestor', commit, integration])).ok;
};

/**
 * The commit that brought `proposalId` into the integration branch — the
 * newest first-parent commit whose message names it — or `undefined`.
 */
export const deliveredCommitOf = async (
	run: IGitRunner,
	integration: string,
	proposalId: string,
): Promise<string | undefined> => {
	const found = await run([
		'log',
		'--first-parent',
		'-1',
		'--format=%H',
		'--fixed-strings',
		`--grep=${proposalId}`,
		integration,
	]);
	const commit = found.ok ? found.output.trim() : '';
	return commit.length > 0 ? commit : undefined;
};
