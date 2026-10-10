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
import { decideIndexSource } from './index-source-policy';
import { reportRegistryParity } from './index-reader-parity-report';
import {
	DEFAULT_PROPOSAL_INDEX_SOURCE,
	PROPOSAL_INDEX_SOURCE_ENV_VAR,
} from '../contracts/constants/proposal-index-source.constant';
import type { IProposalIndexSource } from '../contracts/interfaces/proposal-index-source.interface';
import type { IProjectionRefresh } from '../contracts/interfaces/projection-refresh.interface';
import { resolveDatabasePath } from './index-reader-location';
import { attemptSqlRebuild } from './index-reader-rebuild';
import {
	type IStaleProjectionSeams,
	levelStaleProjection,
} from './index-reader-stale';
import { recordProposalIndexRead } from './index-read-stats';
import { defaultLog, noticeOnce } from './index-reader-notice';
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
	/** What the projection knows besides the status, when it knows it. */
	readonly title?: string;
	readonly track?: string;
	readonly kind?: string;
	readonly date?: string;
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

export interface IProposalIndexReadOptions extends IStaleProjectionSeams {
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
		readonly reconciledAt?: number | null;
	} | null>;
	/**
	 * Absolute path of the markdown proposals tree — the authority a
	 * `sql`-source rebuild-on-missing projects from. Defaults to
	 * `<workspaceRoot>/docs/delendai/proposals`, the canonical layout.
	 */
	readonly proposalsDirAbs?: string;
	/**
	 * DIP seam: whether `root` exists and, when the projection could not
	 * be opened at all, whether `databasePath` names a file that exists
	 * (exists = the reader could not OPEN it, i.e. corrupt or locked — a
	 * rebuild must never run over that; does not exist = nothing has
	 * ever been built there, i.e. missing — safe to rebuild). Defaults to
	 * the real filesystem.
	 */
	readonly pathExists?: (path: string) => boolean | Promise<boolean>;
	/**
	 * DIP seam for the rebuild-from-markdown the `sql` source runs before
	 * giving up; defaults to the real leveller
	 * (`reconcileProjection`). Never throws in production; a spec can
	 * inject a fake to drive the retry without a real database.
	 */
	readonly rebuildProjection?: (input: {
		readonly root: string;
		readonly proposalsDir: string;
	}) => IProjectionRefresh | Promise<IProjectionRefresh>;
}

export { resetProposalIndexFallbackNotice } from './index-reader-notice';

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
 * Whether the source was chosen by the caller or the environment rather
 * than taken from {@link DEFAULT_PROPOSAL_INDEX_SOURCE}. Only a chosen
 * `sql` refuses a read whose projection cannot even be located.
 */
export const isProposalIndexSourcePinned = (
	options?: IProposalIndexReadOptions,
): boolean =>
	options?.source !== undefined ||
	isProposalIndexSource(
		(options?.env ?? process.env)[PROPOSAL_INDEX_SOURCE_ENV_VAR],
	);

export const readFromJson = async (
	indexPathAbs: string,
	fs?: IIndexFs,
): Promise<readonly IProposalIndexEntry[]> => {
	const parsed = await readJsonOrNull<IProposalIndexFile>(indexPathAbs, fs);
	return parsed?.proposals ?? [];
};

export const readFromSqlSource = async (
	indexPathAbs: string,
	options: IProposalIndexReadOptions | undefined,
): Promise<{
	readonly entries: readonly IProposalIndexEntry[];
	readonly sourceCommit: string | null;
	readonly logicalDigest: string | null;
	readonly reconciledAt?: number | null;
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
				reconciledAt: result.reconciledAt,
			};
};

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
	fromSqlInitial: Awaited<ReturnType<typeof readFromSqlSource>>,
	log: (message: string) => void,
	options?: IProposalIndexReadOptions,
): Promise<readonly IProposalIndexEntry[]> => {
	let fromSql = fromSqlInitial;
	let rebuilt = false;
	if (fromSql === null || fromSql.sourceCommit === null) {
		const attempt = await attemptSqlRebuild(
			indexPathAbs,
			options,
			fromSql === null,
			log,
			() => readFromSqlSource(indexPathAbs, options),
		);
		if (attempt.attempted) {
			rebuilt = true;
			fromSql = attempt.result;
		} else if (!attempt.located && !isProposalIndexSourcePinned(options)) {
			// Nobody asked for `sql`: it is only the default, and this index
			// sits in a layout the projection cannot be located in. Refusing
			// would break a project for a choice it never made.
			recordProposalIndexRead('fallback-unavailable');
			noticeOnce(
				`default-sql-unlocated:${indexPathAbs}`,
				`proposal index: no SQLite projection can be located for ${indexPathAbs}; serving it as JSON (set ${PROPOSAL_INDEX_SOURCE_ENV_VAR}=sql to make this an error; this notice is emitted once per index path)`,
				log,
			);
			return readFromJson(indexPathAbs, fs);
		}
	}
	if (fromSql === null || fromSql.sourceCommit === null) {
		recordProposalIndexRead('sql-refused', 0, rebuilt);
		throw new ProposalIndexSqlUnavailableError(
			fromSql === null ? 'unavailable' : 'unstamped',
			indexPathAbs,
		);
	}
	const fresh = await levelStaleProjection(
		indexPathAbs,
		options,
		fromSql,
		log,
		() => readFromSqlSource(indexPathAbs, options),
	);
	rebuilt ||= fresh !== fromSql;
	fromSql = fresh;
	reportRegistryParity({
		entries: fromSql.entries,
		registry: await readJsonOrNull<IProposalIndexFile>(indexPathAbs, fs),
		reconciledAt: fromSql.reconciledAt ?? null,
		indexPathAbs,
		rebuilt,
		log,
	});
	return fromSql.entries;
};

/**
 * Read the proposal index and return its `proposals` array; empty when
 * the file is missing, unreadable or unparseable.
 *
 * With no source pinned the source is `sql` (q00022 S4 phase 2): a
 * projection that is missing, unstamped, or built from an older tree of
 * the proposals is rebuilt from the markdown and read again.
 *
 * @throws ProposalIndexSqlUnavailableError only when the source is `sql`
 * and the projection still cannot serve after a rebuild was attempted, or
 * could not be (a corrupt database or a missing workspace root are never
 * rebuilt over). `auto` and `json` never throw for that.
 */
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
	if (source === 'sql')
		return serveStrictSql(indexPathAbs, fs, fromSql, log, options);
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
