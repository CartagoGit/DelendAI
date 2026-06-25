/**
 * index-reader.ts
 *
 * Pure async readers for the proposal index (`docs/mcp-vertex/proposals/index.json`)
 * and for arbitrary text/json files. Single source of truth for the
 * "read, parse if possible, return null on failure" pattern that the
 * tools repeat across the codebase.
 *
 * SRP: this module owns ONLY the question "how do I safely read a file
 * on disk without throwing on missing/corrupt content?". Every caller
 * that needs a missing-tolerant read imports from here.
 *
 * DRY: pre-refactor, `readJsonOrNull` + `readTextOrNull` were inlined
 * in both `continue-proposal.tool.ts` and `mutate-tools.ts`. Same 8
 * lines, slightly different type signatures. The shared helpers here
 * use the strictest form (typed JSON, plain text) so a future caller
 * never needs to re-think error semantics.
 *
 * Async-only (H2 from AGENTS.md): these never block the event loop.
 * They are the canonical "existsSync + readFileSync" replacement.
 */

import { DEFAULT_INDEX_FS, type IIndexFs } from './index-reader-fs';

/**
 * Read a file and parse it as JSON. Returns `null` when:
 *   - the file does not exist (`ENOENT`),
 *   - the file is unreadable (permission, EISDIR, ...),
 *   - the contents are not valid JSON.
 *
 * Never throws. Callers MUST handle `null` — there is no error path
 * to surface a "this should have worked" failure here. If the JSON is
 * malformed in a way the caller cares about, validate the parsed
 * shape downstream (e.g. via a Zod schema in `parseProposalDocument`).
 *
 * DIP — `fs` is injected; default wiring uses the real filesystem.
 */
export const readJsonOrNull = async <T>(
	path: string,
	fs: IIndexFs = DEFAULT_INDEX_FS,
): Promise<T | null> => {
	const raw = await fs.read(path);
	if (raw === null) return null;
	try {
		return JSON.parse(raw) as T;
	} catch {
		return null;
	}
};

/**
 * Read a file as UTF-8 text. Returns `null` when the file does not
 * exist or is unreadable. Never throws. Pairs with `readJsonOrNull`
 * for callers that need both formats.
 *
 * DIP — `fs` is injected; default wiring uses the real filesystem.
 */
export const readTextOrNull = async (
	path: string,
	fs: IIndexFs = DEFAULT_INDEX_FS,
): Promise<string | null> => fs.read(path);

// ---------------------------------------------------------------------------
// Index-shape reader. Every tool that wants to know "what proposals exist
// and where do they live on disk?" goes through `readProposalIndex`. The
// shape is the one `sync-proposal-registry.ts` writes; keep this in sync
// if the registry ever adds fields.
// ---------------------------------------------------------------------------

/**
 * Minimal shape of a single `index.json` entry. Only the fields the
 * tools actually read are typed here — `sync-proposal-registry.ts`
 * writes more (type, kind, extras, ...), but the tools that consume
 * the index only care about `id` + `file`. Adding more fields here is
 * a one-line change; the optional ones are silently absent on legacy
 * indexes.
 */
export interface IProposalIndexEntry {
	readonly id: string;
	readonly file: string;
	/**
	 * Optional proposal status, as written by
	 * `sync-proposal-registry.ts`. The field is optional because legacy
	 * indexes (pre-f00016) only carried `id` + `file`; tools that need
	 * the status should treat undefined as 'unknown' and fall back to
	 * re-reading the frontmatter.
	 */
	readonly status?: string;
}

/**
 * Full shape of `index.json`. `proposals` is the canonical list;
 * `count` + `generated_at` are informational.
 */
export interface IProposalIndexFile {
	readonly proposals: readonly IProposalIndexEntry[];
	readonly count?: number;
	readonly generated_at?: string;
}

/**
 * Read the proposal index and return its `proposals` array. Returns
 * an empty array when the file is missing, unreadable, or unparseable.
 * Callers MUST be prepared for an empty result — the index can lag
 * behind the filesystem by one `sync_proposals` call.
 */
export const readProposalIndex = async (
	indexPathAbs: string,
	fs?: IIndexFs,
): Promise<readonly IProposalIndexEntry[]> => {
	const parsed = await readJsonOrNull<IProposalIndexFile>(indexPathAbs, fs);
	return parsed?.proposals ?? [];
};
