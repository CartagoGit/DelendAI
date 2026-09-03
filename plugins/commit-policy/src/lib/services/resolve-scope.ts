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
	IResolvedScopeSource,
} from '../contracts/interfaces/resolved-scope.interface';

/** Normalise to repo-relative POSIX form, matching `commit-driver.ts`. */
/**
 * Strip the markdown code-span backticks a proposal's `Files:` list
 * almost always carries: `` `path/to/file.ts` `` is how every proposal
 * in this repo writes a path, because that is how paths are written in
 * prose.
 *
 * Without this the backticks survive into the commit scope and `git
 * add -- '`tracked.txt`'` matches nothing, so a slice that declared a
 * perfectly good path silently resolves to zero files. Real, observed:
 * the `auto-work` e2e slice declares ``Files: `tracked.txt` `` and the
 * server log of 2026-09-03 shows entries like
 * ``SKILL.md`.`` and ``proposal-frontmatter-types.ts` (or equivalent)``
 * reaching the resolver with their backticks intact.
 *
 * Only balanced, wrapping backticks are removed. A stray backtick in
 * the middle of an entry is left alone — that entry is malformed and
 * belongs in `unresolvedEntries`, not silently repaired.
 */
const stripCodeSpan = (raw: string): string => {
	const trimmed = raw.trim();
	if (
		trimmed.length >= 2 &&
		trimmed.startsWith('`') &&
		trimmed.endsWith('`')
	) {
		return trimmed.slice(1, -1).trim();
	}
	// The repo's actual proposal style is a sub-bullet per file:
	//
	//   - **Files**:
	//     - `packages/core/src/lib/foo.ts` — what this slice does to it
	//
	// The path is the backticked token; everything after the em-dash is
	// prose written for a human. Classifying the WHOLE entry rejected it
	// as `vague-language`, so the slice resolved to zero files and never
	// committed — observed live on 2026-09-03 for x00423's own slices.
	//
	// Demanding that four hundred proposals be rewritten to put a bare
	// path on one line is the wrong way round: a backticked token inside
	// a file list is unambiguously the path, and reading it is cheaper
	// and safer than rewriting the corpus. An entry with NO backticks
	// still falls through to the strict classification below, so genuine
	// prose ("see files list below") is still rejected.
	// The code span must LEAD the entry, after an optional list marker.
	// In a file list the entry's subject comes first: "- `a/b.ts` — why"
	// names a path. "every `.md` under `docs/`" does not — there the
	// code spans are fragments of a description, and the entry as a
	// whole is still the vague language the strict classifier rejects.
	const leadingCodeSpan = /^(?:[-*]\s+)?`([^`\n]+)`/u.exec(trimmed);
	return leadingCodeSpan?.[1]?.trim() ?? trimmed;
};

export const normalizeRepoPath = (raw: string): string => {
	const replaced = stripCodeSpan(raw).replace(/\\/gu, '/').trim();
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
	// Classify the path itself, not its markdown decoration — a
	// backticked path is a path.
	const trimmed = stripCodeSpan(raw);
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
	let source: IResolvedScopeSource;
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
	// x00419 / 2026-09-02 log storm regression.
	//
	// IMPORTANT — DO NOT filter `files` by `workspaceDirty` here. The
	// resolver's job is to produce the canonical git-path scope from the
	// declared entries + ownership. Whether those paths are *currently*
	// in the workspace's `git status` output is downstream of the stage
	// step — engine.ts stages the file FIRST (via the commit-driver's
	// isolated index), then commits. If we filter `files` by
	// `workspaceDirty`, unstaged declared paths (which is the COMMON case
	// in real slices — the agent wrote the file but hasn't `git add`'d
	// it yet) end up in `foreignDirtyExcluded`, the scope becomes empty,
	// and engine.ts short-circuits to NO_CHANGE without ever reaching
	// the stage step. The stage step itself, when reached, runs
	// `gitDirtyFilePaths()` again and finds zero — emitting the
	// `WORKSPACE_HAS_NO_FILES` ERR log storm the user saw on 2026-09-02.
	//
	// What `foreignDirtyExcluded` IS for: the operator wants to know
	// which declared paths were not staged by the agent before the slice
	// fired, so they can spot the slice that quietly lost its changes.
	// It is a WARN signal, never a commit-scope filter.
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
