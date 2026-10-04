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

/**
 * The first-parent commit of `integration` that brought `commit` in: the
 * merge of its pull request, or `commit` itself when it was made there.
 */
export const landingOf = async (
	run: IGitRunner,
	integration: string,
	commit: string,
): Promise<string | undefined> => {
	const resolved = await run([
		'rev-parse',
		'-q',
		'--verify',
		`${commit}^{commit}`,
	]);
	if (!resolved.ok) return undefined;
	const full = resolved.output.trim();
	const path = await run([
		'rev-list',
		'--first-parent',
		'--ancestry-path',
		`${full}..${integration}`,
	]);
	if (!path.ok) return undefined;
	const oldest = path.output
		.split('\n')
		.filter((line) => line.length > 0)
		.at(-1);
	// Nothing after it on the chain: it is the tip, and its own landing.
	if (oldest === undefined) return full;
	// The oldest descendant's first parent is the commit itself when the
	// commit was made on the chain; otherwise that descendant merged it.
	const parent = await run(['rev-parse', '-q', '--verify', `${oldest}^1`]);
	return parent.ok && parent.output.trim() === full ? full : oldest;
};

/**
 * The delivery of `proposalId` that came after the one `commit` belongs
 * to and changed the same slice, or `undefined` when `commit` is the
 * newest. A reviewer approved a slice "at" its first commit two days after
 * a second pull request had reworked it: the verdict read as covering work
 * it had not looked at.
 *
 * Only deliveries of this proposal count: a refactor that crossed the
 * files for another reason is not a newer version of the slice.
 */
export const supersedingDelivery = async (
	run: IGitRunner,
	integration: string,
	proposalId: string,
	files: readonly string[],
	commit: string,
): Promise<string | undefined> => {
	if (files.length === 0) return undefined;
	const newest = await run([
		'log',
		'--first-parent',
		'-1',
		'--format=%H',
		'--fixed-strings',
		'--regexp-ignore-case',
		`--grep=${proposalId}`,
		integration,
		'--',
		...files,
	]);
	const delivery = newest.ok ? newest.output.trim() : '';
	if (delivery.length === 0) return undefined;
	const landing = await landingOf(run, integration, commit);
	if (landing === undefined || landing === delivery) return undefined;
	// Newer only if the commit's own landing came before it.
	const before = await run([
		'merge-base',
		'--is-ancestor',
		landing,
		delivery,
	]);
	return before.ok ? delivery : undefined;
};
