/**
 * resolve-scope.ts — produce the canonical, git-path ResolvedCommitScope
 * for a slice event.
 *
 * The contract is:
 *   - declared entries that look like git paths → included in `files`.
 *   - declared entries that do not look like git paths → recorded in
 *     `unresolvedEntries` with a reason; they NEVER enter `files`.
 *   - if ownership is provided, only paths that are both declared AND
 *     owned by the agent/task are included in `files` (intersection).
 *   - paths that ended up in `files` but are not currently dirty in the
 *     workspace go to `foreignDirtyExcluded` (informational; no refusal).
 *
 * The function never throws. The classification is deliberately
 * conservative: if a path does not look canonical we leave it OUT
 * rather than guessing. Agents that want their slice committed must
 * put real git paths in `Files:`. Globs, "or equivalent" and markdown
 * link syntax are documented in f00420 to be rejected by the proposals
 * lint at authoring time.
 */

import type {
	IResolveScopeInput,
	IResolvedCommitScope,
	IUnresolvedScopeEntry,
	ResolvedScopeSource,
} from '../contracts/interfaces/resolved-scope.interface';

/** Normalise to repo-relative POSIX form, matching `commit-driver.ts`. */
export const normalizeRepoPath = (raw: string): string => {
	const replaced = raw.replace(/\\/gu, '/').trim();
	const arrow = replaced.lastIndexOf(' -> ');
	const path = arrow >= 0 ? replaced.slice(arrow + 4).trim() : replaced;
	return path.startsWith('./') ? path.slice(2) : path;
};

/**
 * Heuristic classification of a single declared entry.
 *
 * We intentionally keep this conservative. Anything we are not 100%
 * sure is a git-path goes to `unresolvedEntries` so the commit can
 * still happen — but never with that entry in `files`.
 */
export const classifyDeclaredEntry = (
	raw: string,
): IUnresolvedScopeEntry | null => {
	const trimmed = raw.trim();
	if (trimmed.length === 0) {
		return { raw, reason: 'empty' };
	}
	// Markdown link syntax: `[foo](../../path/foo.ts)` or `[\`foo\`](path)`
	if (/^\[[^\]]*\]\([^)]+\)/u.test(trimmed)) {
		return { raw, reason: 'markdown-link' };
	}
	// Vague language like "(or equivalent)", "(nuevo)", "(new)".
	if (
		/\(\s*(or\s+equivalent|equivalent|nuevo|new|optional|todo|all)\s*\)/iu.test(
			trimmed,
		)
	) {
		return { raw, reason: 'vague-language' };
	}
	// Globs: `*`, `**`, `**/*`, `*.ts`, `?` metachars.
	if (/[*?[\]{}]/u.test(trimmed)) {
		return { raw, reason: 'glob' };
	}
	// Annotations like "(nuevo)" or "(deprecated)" after a real path.
	const annotationMatch = /^(\S.*?)\s*\(\s*[^)]+\s*\)\s*$/u.exec(trimmed);
	if (annotationMatch !== null) {
		// Try the leading path-only; if it is canonical we accept the entry
		// but the commit-driver's annotation check would reject the row
		// anyway. We treat the entire entry as unresolved.
		return { raw, reason: 'annotation' };
	}
	// Rename arrows are accepted by the driver; pass through.
	if (/\s+->\s+/u.test(trimmed)) {
		return null;
	}
	// Absolute paths outside the repo: keep as-is but require it starts
	// with `/` or `C:\` etc. We treat those as cross-repo, unresolved.
	if (/^([a-zA-Z]:\\|\/)/u.test(trimmed)) {
		return { raw, reason: 'cross-repo' };
	}
	// At this point the entry must look like a relative path:
	//   - no whitespace,
	//   - no trailing punctuation,
	//   - must contain at least one `/` OR be a bare filename.
	if (/\s/u.test(trimmed)) {
		return { raw, reason: 'vague-language' };
	}
	if (/[;,:]$/u.test(trimmed)) {
		return { raw, reason: 'vague-language' };
	}
	// Accept: bare filename or relative path.
	return null;
};

export const resolveCommitScope = (
	input: IResolveScopeInput,
): IResolvedCommitScope => {
	const unresolvedEntries: IUnresolvedScopeEntry[] = [];
	const canonicalFromDeclared = new Set<string>();

	for (const raw of input.declaredFiles) {
		const classification = classifyDeclaredEntry(raw);
		if (classification !== null) {
			unresolvedEntries.push(classification);
			continue;
		}
		canonicalFromDeclared.add(normalizeRepoPath(raw));
	}

	// Ownership intersection (when provided).
	let source: ResolvedScopeSource;
	let files: readonly string[];
	if (input.ownership !== undefined) {
		const owned = new Set(
			input.ownership.ownedFiles.map((p) => normalizeRepoPath(p)),
		);
		const intersected: string[] = [];
		for (const path of canonicalFromDeclared) {
			if (owned.has(path)) intersected.push(path);
		}
		files = intersected;
		source =
			intersected.length === canonicalFromDeclared.size
				? 'declared'
				: intersected.length === 0
					? 'ownership'
					: 'mixed';
	} else {
		files = Array.from(canonicalFromDeclared);
		source = 'declared';
	}

	// Foreign-dirty-excluded: paths in `files` not currently dirty.
	const dirty = new Set(
		(input.workspaceDirty ?? []).map((p) => normalizeRepoPath(p)),
	);
	const foreignDirtyExcluded = files.filter((path) => !dirty.has(path));

	return {
		proposalId: input.proposalId,
		sliceId: input.sliceId,
		...(input.ownership?.agentId !== undefined
			? { agentId: input.ownership.agentId }
			: {}),
		...(input.ownership?.taskId !== undefined
			? { taskId: input.ownership.taskId }
			: {}),
		source,
		files,
		unresolvedEntries,
		foreignDirtyExcluded,
	};
};
