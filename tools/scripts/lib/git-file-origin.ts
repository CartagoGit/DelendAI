/**
 * git-file-origin.ts — the commit that first added a file, and when.
 *
 * Two scripts needed this and one had it privately: `rename-padded`
 * orders proposals by the date they were first committed, and
 * `proposal-already-implemented` needs to know whether a file a slice
 * names was CREATED by that work or merely existed before it. Keeping
 * one implementation is what keeps the two answers from drifting.
 *
 * `follow` is a real choice, not a detail. Without it a file renamed
 * after its creation reports the rename as its origin — wrong for "did
 * this slice create it", and exactly what `rename-padded` has always
 * used, so that script keeps it off and its numbering does not move.
 */

import { execFileSync } from 'node:child_process';

export interface IGitFileOrigin {
	/** The commit that added the file. */
	readonly sha: string;
	/** Its author date, ISO 8601. */
	readonly iso: string;
	/** The same date as `YYYY-MM-DD`, comparable with frontmatter dates. */
	readonly date: string;
}

/**
 * The earliest commit that added `path`, or undefined when git knows of
 * none (untracked, outside a repository, or git unavailable).
 */
export const gitFileOrigin = (
	cwd: string,
	path: string,
	options: { readonly follow?: boolean } = {},
): IGitFileOrigin | undefined => {
	let stdout: string;
	try {
		stdout = execFileSync(
			'git',
			[
				'log',
				'--diff-filter=A',
				...(options.follow === true ? ['--follow'] : []),
				'--format=%H %aI',
				'--',
				path,
			],
			{ cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] },
		);
	} catch {
		return undefined;
	}
	// Newest first: the origin is the last line.
	const last = stdout.trim().split(/\r?\n/u).filter(Boolean).at(-1);
	return last === undefined ? undefined : parseOriginLine(last);
};

/**
 * One `%H %aI` line, or undefined when it is not one.
 *
 * Split out and exported so the refusal is pinned by a case: git never
 * emits a malformed line for this format, which is exactly why a guard
 * that nothing can reach would otherwise sit untested forever.
 */
export const parseOriginLine = (line: string): IGitFileOrigin | undefined => {
	const match = /^([0-9a-f]{7,40}) (\d{4}-\d{2}-\d{2}T\S+)$/u.exec(
		line.trim(),
	);
	if (match === null) return undefined;
	const [, sha = '', iso = ''] = match;
	return { sha, iso, date: iso.slice(0, 10) };
};
