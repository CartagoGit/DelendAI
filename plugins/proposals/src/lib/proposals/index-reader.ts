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

import { basename, dirname } from 'node:path';

import { DEFAULT_INDEX_FS, type IIndexFs } from './index-reader-fs';
import { compareIndexEntries, decideIndexSource } from './index-source-policy';
import {
	DEFAULT_PROPOSAL_INDEX_SOURCE,
	PROPOSAL_INDEX_DB_PATH_ENV_VAR,
	PROPOSAL_INDEX_SOURCE_ENV_VAR,
} from '../contracts/constants/proposal-index-source.constant';
import type { IProposalIndexSource } from '../contracts/interfaces/proposal-index-source.interface';
import { recordProposalIndexRead } from './index-read-stats';
import { ProposalIndexSqlUnavailableError } from './proposal-errors';

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

// The source vocabulary — `json` / `auto` / `sql`, the default and the
// environment switches — lives in `contracts/constants/proposal-index-source`
// and is re-exported here, so every import site keeps working.
/** Where `readProposalIndex` reads from. Kept under its historical name. */
export type TProposalIndexSource = IProposalIndexSource;
export {
	DEFAULT_PROPOSAL_INDEX_SOURCE,
	PROPOSAL_INDEX_DB_PATH_ENV_VAR,
	PROPOSAL_INDEX_SOURCE_ENV_VAR,
} from '../contracts/constants/proposal-index-source.constant';

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
	readonly readFromSqlResult?: (databasePath: string) => Promise<{
		readonly entries: readonly IProposalIndexEntry[];
		readonly sourceCommit: string | null;
		readonly logicalDigest: string | null;
	} | null>;
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
 * The workspace this read belongs to, taken from the index path the
 * caller already resolved.
 *
 * WHY not `process.cwd()`, which is what this used to fall back to: an
 * MCP server's working directory is wherever the host happened to launch
 * it, which in a multi-project setup is frequently another project
 * entirely — and resolving the proposals database from it would read,
 * and eventually write, somebody else's repository. The index path has
 * none of that ambiguity: every caller gets it from its own resolved
 * layout, so it names the workspace being read rather than the process's
 * accident.
 *
 * The derivation is only trusted when it round-trips: the index must sit
 * at `<root>/.cache/delendai/proposals/`, the canonical sibling of the
 * state directory `resolveProposalsDbPaths` owns. Any other layout
 * returns `null` — "the SQL source cannot serve" — because a wrong root
 * here is the same wrong-repository bug under a different name.
 */
const workspaceRootFromIndexPath = (
	indexPathAbs: string,
	stateDir: (root: string) => string,
): string | null => {
	const proposalsCacheDir = dirname(indexPathAbs);
	if (basename(proposalsCacheDir) !== 'proposals') return null;
	const cacheDir = dirname(proposalsCacheDir);
	const root = dirname(dirname(cacheDir));
	return dirname(stateDir(root)) === cacheDir ? root : null;
};

/**
 * Canonical database path for this read. Never hand-built: the
 * `.cache/delendai/state/proposals.sqlite` layout belongs to
 * `resolveProposalsDbPaths`, imported dynamically so that a JSON-source
 * read never loads `bun:sqlite`.
 *
 * On a runtime without `bun:sqlite` (a plain Node host, vitest) the
 * import fails and this returns `null` — which the caller reads as
 * "the SQL source cannot serve" and falls back to JSON. That is the
 * correct answer there: without `bun:sqlite` there is no SQL source.
 */
const resolveDatabasePath = async (
	indexPathAbs: string,
	options?: IProposalIndexReadOptions,
): Promise<string | null> => {
	if (options?.databasePath !== undefined) return options.databasePath;
	const fromEnv = (options?.env ?? process.env)[
		PROPOSAL_INDEX_DB_PATH_ENV_VAR
	];
	if (typeof fromEnv === 'string' && fromEnv.length > 0) return fromEnv;
	try {
		const { resolveProposalsDbPaths } = await import(
			'@delendai/proposals-sqlite'
		);
		// An explicit `workspaceRoot` is the caller's own word and wins;
		// otherwise the root is derived from the index path and verified
		// against the canonical layout.
		const declared = options?.workspaceRoot;
		const root =
			declared !== undefined && declared.length > 0
				? declared
				: workspaceRootFromIndexPath(
						indexPathAbs,
						(candidate) =>
							resolveProposalsDbPaths(candidate).stateDir,
					);
		if (root === null) return null;
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
	indexPathAbs: string,
	options: IProposalIndexReadOptions | undefined,
): Promise<{
	readonly entries: readonly IProposalIndexEntry[];
	readonly sourceCommit: string | null;
	readonly logicalDigest: string | null;
} | null> => {
	const databasePath = await resolveDatabasePath(indexPathAbs, options);
	if (databasePath === null) return null;
	if (options?.readFromSqlResult !== undefined)
		return options.readFromSqlResult(databasePath);
	if (options?.readFromSql !== undefined) {
		const entries = await options.readFromSql(databasePath);
		return entries === null
			? null
			: { entries, sourceCommit: 'test', logicalDigest: null };
	}
	const { readProposalIndexResultFromSql } = await import(
		'./index-reader-sql'
	);
	const result = await readProposalIndexResultFromSql({ databasePath });
	return result === null
		? null
		: {
				entries: result.entries,
				sourceCommit: result.sourceCommit,
				logicalDigest: result.logicalDigest,
			};
};

/**
 * Read the proposal index and return its `proposals` array. Returns
 * an empty array when the file is missing, unreadable, or unparseable.
 * Callers MUST be prepared for an empty result — the index can lag
 * behind the filesystem by one `sync_proposals` call.
 *
 * The signature is unchanged (`indexPathAbs`, optional `fs`); the
 * optional third argument only exists for callers that pin a source or a
 * database path. With neither, the source is `auto`.
 *
 * @throws ProposalIndexSqlUnavailableError only when the source is `sql`
 * and the projection cannot serve. `auto` and `json` never throw for a
 * missing or unstamped database.
 */
/**
 * `sql`: the projection answers, or the read fails.
 *
 * Divergence from JSON is REPORTED, not obeyed: under `sql` the database
 * is the authority and `index.json` is the legacy copy, so letting the
 * copy override the authority would be the silent fallback again under a
 * different name. The JSON is read only to say how they differ.
 */
const serveStrictSql = async (
	indexPathAbs: string,
	fs: IIndexFs | undefined,
	fromSql: Awaited<ReturnType<typeof readFromSqlSource>>,
	log: (message: string) => void,
): Promise<readonly IProposalIndexEntry[]> => {
	if (fromSql === null || fromSql.sourceCommit === null) {
		recordProposalIndexRead('sql-refused');
		throw new ProposalIndexSqlUnavailableError(
			fromSql === null ? 'unavailable' : 'unstamped',
			indexPathAbs,
		);
	}
	const divergence = compareIndexEntries(
		fromSql.entries,
		await readFromJson(indexPathAbs, fs),
	);
	recordProposalIndexRead(
		divergence.length > 0 ? 'sql-divergence-reported' : 'sql-parity',
		divergence.length,
	);
	if (divergence.length > 0)
		noticeOnce(
			`sql-strict-divergence:${indexPathAbs}`,
			`proposal index: serving the SQLite projection (source pinned to "sql"); ${indexPathAbs} differs on ${divergence.join(', ')}`,
			log,
		);
	return fromSql.entries;
};

export const readProposalIndex = async (
	indexPathAbs: string,
	fs?: IIndexFs,
	options?: IProposalIndexReadOptions,
): Promise<readonly IProposalIndexEntry[]> => {
	const source = resolveProposalIndexSource(options);
	if (source === 'json') {
		recordProposalIndexRead('json-pinned');
		return readFromJson(indexPathAbs, fs);
	}

	const fromSql = await readFromSqlSource(indexPathAbs, options);
	// `null` means "the SQL source cannot serve"; an EMPTY ARRAY means
	// "it served, and there are no proposals". Only the first triggers
	// the fallback — treating `[]` as a failure would re-read JSON for
	// a genuinely empty repository, and treating `null` as `[]` would
	// hand every consumer an empty repository when the database is
	// simply absent.
	const log = options?.log ?? defaultLog;
	if (source === 'sql') return serveStrictSql(indexPathAbs, fs, fromSql, log);
	if (fromSql !== null) {
		const fromJson = await readFromJson(indexPathAbs, fs);
		const decision = decideIndexSource({
			sql: fromSql.entries,
			json: fromJson,
			metadata: {
				sourceCommit: fromSql.sourceCommit,
				logicalDigest: fromSql.logicalDigest,
			},
		});
		if (decision.source === 'sql') {
			recordProposalIndexRead('sql-parity');
			return decision.entries;
		}
		recordProposalIndexRead(
			decision.reason === 'metadata-missing'
				? 'fallback-metadata-missing'
				: 'fallback-divergence',
			decision.divergence.length,
		);
		noticeOnce(
			`sql-divergence:${indexPathAbs}`,
			`proposal index: SQLite projection diverges from ${indexPathAbs}; serving JSON instead (${decision.divergence.join(', ') || decision.reason})`,
			log,
		);
		return fromJson;
	}
	recordProposalIndexRead('fallback-unavailable');
	noticeOnce(
		`auto-fallback:${indexPathAbs}`,
		`proposal index: SQLite projection unavailable, falling back to ${indexPathAbs} (this notice is emitted once per index path)`,
		log,
	);
	return readFromJson(indexPathAbs, fs);
};
