/**
 * index-reader.ts
 *
 * Pure async readers for the proposal index
 * (`<cacheDir>/proposals/index.json`; the regenerable registry that
 * `proposals_sync_proposals` rewrites — see x00052 for the move from
 * `docs/delendai/proposals/index.json`).
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

// ---------------------------------------------------------------------------
// S2 — source selection.
//
// `readProposalIndex` keeps its exact signature; what changes is where
// the entries come from. Two sources exist:
//
//   'json' — `<cacheDir>/proposals/index.json`, the behaviour of every
//            release so far, and the DEFAULT until f00535 S3 flips it.
//   'sql'  — the SQLite projection, via `readProposalIndexFromSql`.
//
// plus 'auto', which prefers SQL and falls back to JSON whenever the
// SQL reader says it cannot serve (`null`). The fallback is logged ONCE
// per database path, not once per call: this function is on the hot read
// path of 9 call sites and a per-call warning would drown the log.
//
// This slice ships the MECHANISM, not the change of default.
// `DEFAULT_PROPOSAL_INDEX_SOURCE` stays `'json'`; S3 owns flipping it
// behind a parity policy.
// ---------------------------------------------------------------------------

/** Where `readProposalIndex` reads from. */
export type TProposalIndexSource = 'json' | 'sql' | 'auto';

/**
 * The source used when neither the caller nor the environment says
 * otherwise. **Deliberately `'json'`** — today's behaviour, unchanged.
 * f00535 S3 is the slice that moves this to a SQL-preferring policy;
 * changing it here would ship the cutover without the parity check S3
 * requires.
 */
export const DEFAULT_PROPOSAL_INDEX_SOURCE: TProposalIndexSource = 'json';

/**
 * Environment switch: the one-line rollback / roll-forward.
 *
 *   DELENDAI_PROPOSAL_INDEX_SOURCE=json   force the JSON index
 *   DELENDAI_PROPOSAL_INDEX_SOURCE=sql    force the SQLite projection
 *   DELENDAI_PROPOSAL_INDEX_SOURCE=auto   prefer SQL, fall back to JSON
 */
export const PROPOSAL_INDEX_SOURCE_ENV_VAR = 'DELENDAI_PROPOSAL_INDEX_SOURCE';

/** Environment override for the database path (tests, odd layouts). */
export const PROPOSAL_INDEX_DB_PATH_ENV_VAR = 'DELENDAI_PROPOSALS_DB_PATH';

const isProposalIndexSource = (
	value: string | undefined,
): value is TProposalIndexSource =>
	value === 'json' || value === 'sql' || value === 'auto';

export interface IProposalIndexReadOptions {
	/** Force a source. Wins over the environment variable. */
	readonly source?: TProposalIndexSource;
	/** Absolute path to `proposals.sqlite`. Wins over `workspaceRoot`. */
	readonly databasePath?: string;
	/** Workspace root the canonical database path is derived from. */
	readonly workspaceRoot?: string;
	/** Environment to read the switches from; defaults to `process.env`. */
	readonly env?: Readonly<Record<string, string | undefined>>;
	/** Sink for the one-time fallback notice. */
	readonly log?: (message: string) => void;
	/** DIP seam for the SQL reader; defaults to the real one. */
	readonly readFromSql?: (
		databasePath: string,
	) => Promise<readonly IProposalIndexEntry[] | null>;
}

/** Database paths already warned about, so the notice is emitted once. */
const fallbackNoticeEmitted = new Set<string>();

/**
 * Clears the one-time fallback notice bookkeeping. For tests that assert
 * "logged once" across several reads; never needed in production.
 */
export const resetProposalIndexFallbackNotice = (): void => {
	fallbackNoticeEmitted.clear();
};

const defaultLog = (message: string): void => {
	console.warn(`[delendai] ${message}`);
};

const noticeOnce = (
	key: string,
	message: string,
	log: (message: string) => void,
): void => {
	if (fallbackNoticeEmitted.has(key)) return;
	fallbackNoticeEmitted.add(key);
	log(message);
};

/**
 * Resolve the effective source: explicit option, then environment, then
 * {@link DEFAULT_PROPOSAL_INDEX_SOURCE}. An unrecognised environment
 * value is ignored rather than fatal — a typo must not take the index
 * read path down.
 */
export const resolveProposalIndexSource = (
	options?: IProposalIndexReadOptions,
): TProposalIndexSource => {
	if (options?.source !== undefined) return options.source;
	const fromEnv = (options?.env ?? process.env)[
		PROPOSAL_INDEX_SOURCE_ENV_VAR
	];
	return isProposalIndexSource(fromEnv)
		? fromEnv
		: DEFAULT_PROPOSAL_INDEX_SOURCE;
};

/**
 * Canonical database path for this read. Never hand-built: the
 * `.delendai/state/proposals.sqlite` layout belongs to
 * `resolveProposalsDbPaths`, imported dynamically so that a JSON-source
 * read never loads `bun:sqlite`.
 *
 * On a runtime without `bun:sqlite` (a plain Node host, vitest) the
 * import fails and this returns `null` — which the caller reads as
 * "the SQL source cannot serve" and falls back to JSON. That is the
 * correct answer there: without `bun:sqlite` there is no SQL source.
 */
const resolveDatabasePath = async (
	options?: IProposalIndexReadOptions,
): Promise<string | null> => {
	if (options?.databasePath !== undefined) return options.databasePath;
	const fromEnv = (options?.env ?? process.env)[
		PROPOSAL_INDEX_DB_PATH_ENV_VAR
	];
	if (typeof fromEnv === 'string' && fromEnv.length > 0) return fromEnv;
	const root = options?.workspaceRoot ?? process.cwd();
	try {
		const { resolveProposalsDbPaths } = await import(
			'@delendai/proposals-sqlite'
		);
		return resolveProposalsDbPaths(root).databasePath;
	} catch {
		return null;
	}
};

const readFromJson = async (
	indexPathAbs: string,
	fs?: IIndexFs,
): Promise<readonly IProposalIndexEntry[]> => {
	const parsed = await readJsonOrNull<IProposalIndexFile>(indexPathAbs, fs);
	return parsed?.proposals ?? [];
};

const readFromSqlSource = async (
	options: IProposalIndexReadOptions | undefined,
): Promise<readonly IProposalIndexEntry[] | null> => {
	const databasePath = await resolveDatabasePath(options);
	if (databasePath === null) return null;
	if (options?.readFromSql !== undefined)
		return options.readFromSql(databasePath);
	const { readProposalIndexFromSql } = await import('./index-reader-sql');
	return readProposalIndexFromSql({ databasePath });
};

/**
 * Read the proposal index and return its `proposals` array. Returns
 * an empty array when the file is missing, unreadable, or unparseable.
 * Callers MUST be prepared for an empty result — the index can lag
 * behind the filesystem by one `sync_proposals` call.
 *
 * f00535 S2 — the signature is unchanged (`indexPathAbs`, optional
 * `fs`); the optional third argument only exists for callers that want
 * to pin a source or a database path. With no third argument and no
 * environment override the behaviour is exactly what it was before:
 * read `index.json`, return `proposals ?? []`.
 */
export const readProposalIndex = async (
	indexPathAbs: string,
	fs?: IIndexFs,
	options?: IProposalIndexReadOptions,
): Promise<readonly IProposalIndexEntry[]> => {
	const source = resolveProposalIndexSource(options);
	if (source === 'json') return readFromJson(indexPathAbs, fs);

	const fromSql = await readFromSqlSource(options);
	// `null` means "the SQL source cannot serve"; an EMPTY ARRAY means
	// "it served, and there are no proposals". Only the first triggers
	// the fallback — treating `[]` as a failure would re-read JSON for
	// a genuinely empty repository, and treating `null` as `[]` would
	// hand every consumer an empty repository when the database is
	// simply absent.
	if (fromSql !== null) return fromSql;

	const log = options?.log ?? defaultLog;
	if (source === 'sql') {
		// Forced SQL: no fallback, by definition of "forced". Say so
		// once, and return the empty result rather than silently serving
		// a different source than the operator pinned.
		noticeOnce(
			`sql-forced:${indexPathAbs}`,
			`proposal index source is pinned to "sql" but the SQLite projection cannot be served; returning an empty index (set ${PROPOSAL_INDEX_SOURCE_ENV_VAR}=json or =auto to read the JSON index)`,
			log,
		);
		return [];
	}
	noticeOnce(
		`auto-fallback:${indexPathAbs}`,
		`proposal index: SQLite projection unavailable, falling back to ${indexPathAbs} (this notice is emitted once per index path)`,
		log,
	);
	return readFromJson(indexPathAbs, fs);
};
