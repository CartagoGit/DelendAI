/**
 * integration-merges.helper.ts — the subjects of the merges on the
 * integration branch, newest first, read once per invocation.
 *
 * Entering a unit read them twice: the newest 3000, reversed, for the
 * agents whose work landed, and the newest 5000 for the generations that
 * ended. One read of the longer list answers both, and the invocation
 * memo answers the second caller.
 */
import { readGit } from '../shared/git-read.helper';

/** How many merges back delendai looks on the integration branch. */
const MERGES_READ = 5000;

export const integrationMergeSubjects = (
	root: string,
	tip: string,
): readonly string[] =>
	(
		readGit(root, [
			'log',
			'--first-parent',
			'--merges',
			`--max-count=${String(MERGES_READ)}`,
			'--format=%s',
			tip,
		]) ?? ''
	)
		.split('\n')
		.filter((subject) => subject.length > 0);
