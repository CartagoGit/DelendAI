/**
 * Path helpers for proposal file lookups.
 *
 * x00052: the registry index moved from `docs/proposals/index.json` to
 * `<cacheDir>/proposals/index.json`, which means the field
 * `IProposalIndexEntry.file` — which used to be implicitly
 * `dirname(indexPath)`-relative (= `proposalsDir`-relative by
 * coincidence) — is no longer anchored to `dirname(indexPath)`. The
 * sync now writes `entry.file` as `proposalsDir`-relative, so any
 * reader that needs an absolute path to a proposal document must join
 * it with `proposalsDirAbs` (or fall back to `dirname(indexPathAbs)`
 * for legacy hosts that pre-date the move).
 *
 * Both helpers tolerate the legacy case: when a caller has no
 * `proposalsDirAbs` in hand, it falls back to the old behaviour. New
 * call-sites should always pass both arguments — passing only
 * `indexPathAbs` keeps the legacy semantics alive (the test fixtures
 * that pre-date x00052 rely on this).
 */
import { dirname, join } from 'node:path';

/**
 * Absolute path of the proposal document behind an index entry.
 *
 * @param indexPathAbs - absolute path of the proposals registry index.
 * @param file - the `entry.file` field (proposalsDir-relative after x00052,
 *   dirname(indexPath)-relative before x00052).
 * @param proposalsDirAbs - absolute path of `proposalsDir`. When present
 *   (production wiring) we use it; when absent (legacy test fixtures)
 *   we fall back to `dirname(indexPathAbs)`.
 */
export const proposalDocPath = (
	indexPathAbs: string,
	file: string,
	proposalsDirAbs?: string,
): string => join(proposalsDirAbs ?? dirname(indexPathAbs), file);

/**
 * The folder a registry `file` path lives in, normalised to a
 * `proposalsDir`-relative segment so callers can compare against the
 * canonical folder names (`ready`, `paused`, `done`, ...).
 *
 * Pre-x00052 the field was `dirname(indexPath)`-relative by
 * coincidence, so `file.slice(0, file.lastIndexOf('/'))` returned
 * `'paused'` for a `paused/foo.md` entry. Post-x00052 the field is
 * `proposalsDir`-relative; the slice alone returns the same `'paused'`
 * when called with a `proposalsDirAbs` so we strip the `proposalsDirAbs`
 * prefix. Without `proposalsDirAbs` we fall back to the slice — this
 * preserves the pre-x00052 behaviour for the few tests that still
 * use it.
 */
export const proposalFolderOf = (
	file: string,
	proposalsDirAbs?: string,
): string | null => {
	const idx = file.lastIndexOf('/');
	if (idx === -1) return null;
	const dir = file.slice(0, idx);
	if (proposalsDirAbs === undefined) return dir;
	// `proposalsDirAbs` is absolute; `dir` is relative. Strip the
	// shared prefix so the result is the canonical folder name. When
	// the two are unrelated (legacy caller without proposalsDirAbs)
	// the caller falls back to `dir` via the undefined branch above.
	const rel = dir.startsWith(`${proposalsDirAbs}/`)
		? dir.slice(proposalsDirAbs.length + 1)
		: dir;
	return rel;
};
