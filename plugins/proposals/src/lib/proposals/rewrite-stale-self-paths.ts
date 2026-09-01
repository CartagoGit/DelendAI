/**
 * rewrite-stale-self-paths.ts — a00069 S3
 *
 * Pure helper used by `proposal_transition` after a successful folder
 * move. When a proposal document lists its own path under `**Files**` /
 * `files:` (common in audits that track the proposal itself as a
 * deliverable), the pre-move path goes stale the moment the file lands
 * in a new status folder. Without a rewrite, `continue_proposal` and
 * humans keep reading `ready/…` (or `review/…`) long after the file
 * lives under `done/feats/…`.
 *
 * Only rewrites tokens that exactly match `oldRelPath` (with optional
 * backticks / surrounding whitespace). Does not touch other paths.
 */

export interface IRewriteStaleSelfPathsArgs {
	readonly oldRelPath: string;
	readonly newRelPath: string;
}

export interface IRewriteStaleSelfPathsResult {
	readonly markdown: string;
	readonly replacements: number;
}

const escapeRegExp = (value: string): string =>
	value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * Rewrite every occurrence of `oldRelPath` that sits on a Files line
 * (terse `- files:` or narrative `- **Files**:`) to `newRelPath`.
 * Returns the updated markdown and the number of replacements.
 */
export const rewriteStaleProposalSelfPaths = (
	markdown: string,
	args: IRewriteStaleSelfPathsArgs,
): IRewriteStaleSelfPathsResult => {
	const { oldRelPath, newRelPath } = args;
	if (oldRelPath.length === 0 || oldRelPath === newRelPath) {
		return { markdown, replacements: 0 };
	}
	const escaped = escapeRegExp(oldRelPath);
	// Match optional backticks around the path so both
	// `- **Files**: \`ready/f.md\`` and `- files: ready/f.md` rewrite.
	// The lookbehind stops a proposals-dir-relative form (`ready/x.md`)
	// from matching INSIDE an already repo-root-relative one
	// (`docs/mcp-vertex/proposals/ready/x.md`), which would splice the
	// prefix in twice. It lets the caller run both forms through this
	// helper in one pass without them corrupting each other.
	const token = new RegExp(`(?<![A-Za-z0-9_/.-])(\`?)${escaped}(\`?)`, 'g');
	let replacements = 0;
	const lines = markdown.split('\n');
	const rewritten = lines.map((line) => {
		// Only rewrite on Files / files bullets — never rewrite narrative
		// mentions of the old path outside the slice plan.
		if (!/^[-*]\s*(?:files|\*\*Files\*\*):/i.test(line)) return line;
		return line.replace(token, (_match, open: string, close: string) => {
			replacements += 1;
			return `${open}${newRelPath}${close}`;
		});
	});
	return {
		markdown: rewritten.join('\n'),
		replacements,
	};
};
