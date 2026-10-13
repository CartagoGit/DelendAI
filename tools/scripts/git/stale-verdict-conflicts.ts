/**
 * stale-verdict-conflicts.ts — a pack of verdicts that conflicts with the
 * integration branch loses the verdicts that conflict, and keeps the rest.
 *
 * A verdict is about one revision of a document. When the document changed
 * on the integration branch after the verdict was recorded, the two no
 * longer merge, and the whole pack stopped there: no check ran on it, its
 * author was "to decide", and the author was a session that had ended.
 * #1017 carried twelve approvals; four were of a proposal its implementer
 * had published again, and the other eight waited with them.
 *
 * What the author would decide is already decided by the rule the close
 * applies: a verdict on an earlier revision does not stand. So the
 * conflicting proposal is put back as the integration branch has it, its
 * verdicts are dropped and said to be, and it returns to the review queue;
 * every other verdict of the pack goes on to its checks.
 */
import { appendFileSync } from 'node:fs';

type IGit = (cwd: string, args: readonly string[]) => string | undefined;

const PROPOSAL_FILE = /(?:^|\/)([a-z]\d{5,})-[^/]*\.md$/iu;

/** The proposal a path under `proposalsDir` is the document of. */
export const proposalOfPath = (
	path: string,
	proposalsDir: string,
): string | undefined =>
	path.startsWith(`${proposalsDir}/`)
		? PROPOSAL_FILE.exec(path)?.[1]?.toLowerCase()
		: undefined;

const lines = (text: string | undefined): readonly string[] =>
	(text ?? '').split('\n').filter((line) => line.length > 0);

/**
 * In a merge stopped by conflicts, put every conflicting proposal back as
 * the integration branch has it and stage it. Returns the proposals whose
 * verdicts were dropped; none when no conflict is in a proposal document.
 * Conflicts elsewhere are left as they are, for whoever resolves those.
 */
export const dropConflictingVerdicts = (input: {
	readonly dir: string;
	readonly proposalsDir: string;
	readonly git: IGit;
}): readonly string[] => {
	const { dir, proposalsDir, git } = input;
	const dropped = [
		...new Set(
			lines(git(dir, ['diff', '--name-only', '--diff-filter=U'])).flatMap(
				(path) => proposalOfPath(path, proposalsDir) ?? [],
			),
		),
	];
	if (dropped.length === 0) return [];
	const theirs = new Set(
		lines(
			git(dir, [
				'ls-tree',
				'-r',
				'--name-only',
				'MERGE_HEAD',
				'--',
				proposalsDir,
			]),
		),
	);
	const ours = lines(git(dir, ['ls-files', '--', proposalsDir]));
	for (const id of dropped) {
		const isOf = (path: string): boolean =>
			proposalOfPath(path, proposalsDir) === id;
		// Everywhere the pack put the document (it may have moved it), back
		// to where the integration branch keeps it.
		for (const path of new Set(ours.filter(isOf))) {
			if (!theirs.has(path)) git(dir, ['rm', '-q', '-f', '--', path]);
		}
		for (const path of [...theirs].filter(isOf)) {
			git(dir, ['checkout', 'MERGE_HEAD', '--', path]);
		}
	}
	const message = git(dir, ['rev-parse', '--git-path', 'MERGE_MSG']);
	if (message !== undefined) {
		appendFileSync(
			message.startsWith('/') ? message : `${dir}/${message}`,
			`\nDropped the verdicts on ${dropped.join(', ')}: each document changed on the integration branch after they were recorded, and a verdict on an earlier revision does not stand. They return to the review queue.\n`,
		);
	}
	return dropped;
};
