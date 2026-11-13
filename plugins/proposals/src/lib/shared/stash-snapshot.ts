/**
 * Pure engine for `git stash list` (f00075 S4).
 *
 * Reads every stash entry the local repo currently holds and returns
 * a structured, typed payload. Designed to feed the `auto_work`
 * front-hook — a hygiene-blocked session is one where the operator
 * left a stash on the working tree and walked away. We surface the
 * entries so the orchestrator can ask the user to pop + commit,
 * apply, or drop, but we never run any of those commands ourselves.
 *
 * Pure over (workspaceRoot, IGitRunner): no filesystem outside of
 * git, never throws (empty array on failure — the front-hook treats
 * that as "no stashes").
 *
 * The default `git stash list` format (`stash@{0}: WIP on main: ...`)
 * is hostile to programmatic parsing because the message itself can
 * contain colons and braces. We override the format with
 * `--format=%gd|%gs|%gD`, picking placeholders that never contain
 * the `|` delimiter:
 *   - `%gd` → `stash@{N}` (the canonical ref)
 *   - `%gs` → the stash subject (one line, no newline)
 *   - `%gD` → the committer date in strict ISO 8601 (or empty when
 *     the entry is a `git stash` with no commit, e.g. an index-only
 *     stash created with `--keep-index`)
 */
import type { IGitRunner } from './git-runner';

export interface IStashEntry {
	/** 0-based entry index — matches `stash@{N}`. */
	readonly index: number;
	/** Canonical ref as reported by git (`stash@{N}`). */
	readonly ref: string;
	/**
	 * Branch the stash was created from. `null` when the entry has no
	 * associated branch (e.g. created on a detached HEAD) — git reports
	 * the branch as empty in that case, so we keep the distinction
	 * honest instead of coercing to `'HEAD'`.
	 */
	readonly branch: string | null;
	/** First line of the stash subject (the `--message` text). */
	readonly message: string;
	/**
	 * Committer date as ISO 8601, or `null` when git could not derive
	 * one (e.g. untracked-file stash with no commit). Always parseable
	 * by `new Date(...)` when non-null.
	 */
	readonly date: string | null;
}

export interface IStashSnapshotOptions {
	readonly run: IGitRunner;
	readonly workspaceRoot: string;
	/**
	 * Hard cap on the number of entries returned. Default 50 — stashes
	 * older than the 50th entry are still actionable, but listing
	 * thousands would blow the `auto_work` token budget. Excess
	 * entries are silently dropped (the count is in the log via the
	 * returned slice length).
	 */
	readonly maxEntries?: number;
}

const DEFAULT_MAX_ENTRIES = 50;

/**
 * Trim whitespace without coercing `null`/`undefined`. Helper for
 * branch + date fields where empty string means "git could not
 * derive a value" — we return `null` so the consumer can render
 * "unknown" instead of the literal empty string.
 */
const trimOrNull = (raw: string | undefined): string | null => {
	if (raw === undefined) return null;
	const trimmed = raw.trim();
	return trimmed.length === 0 ? null : trimmed;
};

/**
 * Parse one line of `git stash list --format=%gd|%gs|%gD`. Splits on
 * the first two `|` only so the message field is preserved verbatim
 * even when it contains further `|`. Returns `null` when the line is
 * blank — git emits no blank lines, but the helper stays defensive.
 */
const parseStashLine = (line: string): IStashEntry | null => {
	const trimmed = line.trim();
	if (trimmed.length === 0) return null;
	const sep1 = trimmed.indexOf('|');
	if (sep1 === -1) return null;
	const sep2 = trimmed.indexOf('|', sep1 + 1);
	if (sep2 === -1) return null;
	const ref = trimmed.slice(0, sep1);
	const subject = trimmed.slice(sep1 + 1, sep2);
	const rawDate = trimmed.slice(sep2 + 1);

	// `stash@{N}` → N. `git stash` always uses this naming.
	const match = /stash@\{(\d+)\}/.exec(ref);
	const index = match?.[1] !== undefined ? Number.parseInt(match[1], 10) : -1;

	// %gs is `<branch>: <subject>` (e.g. `develop: WIP on refactor`).
	// We split on the first colon to surface the branch + the message
	// separately. For stashes created on a detached HEAD, git omits the
	// branch prefix and the subject starts with `WIP on <sha>` or
	// `On <sha>` — in that case the branch stays null and the message
	// keeps the git-generated prefix so the operator can recognise it.
	let branch: string | null;
	let message: string;
	const colonIdx = subject.indexOf(':');
	if (colonIdx > 0) {
		const candidate = subject.slice(0, colonIdx).trim();
		// Defensive: only treat the prefix as a branch when it looks
		// like one (no spaces, no slashes-in-the-middle-… actually
		// slashes are fine for `feature/foo`). The cheapest robust
		// heuristic: reject prefixes that contain whitespace.
		if (candidate.length > 0 && !/\s/.test(candidate)) {
			branch = candidate;
			message = subject.slice(colonIdx + 1).trim();
		} else {
			branch = null;
			message = subject.trim();
		}
	} else {
		branch = null;
		message = subject.trim();
	}

	return {
		index,
		ref,
		branch,
		message: message.length === 0 ? subject : message,
		date: trimOrNull(rawDate),
	};
};

/**
 * Core entry point. Never throws: any failure (git not on PATH,
 * not a repo, non-zero exit) collapses to an empty array. The
 * front-hook treats empty as "no stashes present" — same behaviour
 * the swarm had before f00075 S4.
 */
export const runStashSnapshot = async (
	options: IStashSnapshotOptions,
): Promise<readonly IStashEntry[]> => {
	const maxEntries = options.maxEntries ?? DEFAULT_MAX_ENTRIES;
	const result = await options.run([
		'-C',
		options.workspaceRoot,
		'stash',
		'list',
		'--format=%gd|%gs|%gD',
	]);
	if (!result.ok) return [];
	const raw = result.output;
	if (raw.length === 0) return [];
	const lines = raw.split('\n');
	const entries: IStashEntry[] = [];
	for (const line of lines) {
		if (entries.length >= maxEntries) break;
		const entry = parseStashLine(line);
		if (entry !== null) entries.push(entry);
	}
	return entries;
};
