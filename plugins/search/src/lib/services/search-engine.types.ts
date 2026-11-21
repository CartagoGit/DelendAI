/**
 * search-engine.types.ts — Solid-SRP extraction (types only).
 *
 * `search-engine.service.ts` previously held 4+ interfaces inline:
 * the public `ISearchHit`, `ISearchResult`, `ISearchOptions`, the
 * internal `IRgJsonMatchLine`, `IRgJsonContextLine`, the error
 * `InvalidSearchPatternError`, plus the helpers `globToRegExp` and
 * the `.gitignore` parsers. Moving the public surface here lets
 * the `search-engine.backends.ts` (Strategy implementations) depend
 * on the same types without importing the dispatcher.
 *
 * Solid-ISP: `ISearchBackend` is the narrowest contract a Strategy
 * needs to satisfy. Backends know nothing about gitignore parsing,
 * rg JSON Lines, or the dispatcher's fallback tree.
 */

/** One matching line. `file` is relative to the workspace root. */
export interface ISearchHit {
	readonly file: string;
	readonly line: number;
	readonly text: string;
	/** `context` lines immediately before the match, oldest first. Omitted when `context` is 0/unset. */
	readonly before?: readonly string[];
	/** `context` lines immediately after the match. Omitted when `context` is 0/unset. */
	readonly after?: readonly string[];
}

export interface ISearchResult {
	readonly query: string;
	readonly hits: readonly ISearchHit[];
	/** True when the result set was capped at `maxResults`. */
	readonly truncated: boolean;
	readonly scanned: number;
	/** True when the `rg` backend actually ran this search. */
	readonly usedRg: boolean;
	/** Set when `preferRg: true` but `rg` wasn't used (e.g. not on `$PATH`). */
	readonly rgFallbackReason?: string;
	/**
	 * Set ONLY when `scanned === 0` — a self-diagnosis of why the walk
	 * touched no files, so an agent gets an actionable signal instead of
	 * a silent empty result. a00063: an agent facing bare
	 * `{count: 0, scanned: 0}` (misconfigured roots that don't exist in
	 * the workspace) spiralled into 124 zero-result retries, absolute
	 * roots pointing at other repos, and blind file probing. This field
	 * turns that dead end into "your roots don't exist; fix the config".
	 */
	readonly diagnostic?: string;
}

export interface ISearchOptions {
	/** Dirs (relative to the workspace root) to search. Default `['.']`. */
	readonly roots?: readonly string[];
	/** File extensions (without dot) to include. Default: a text set. */
	readonly extensions?: readonly string[];
	/** Max hits before truncating. Default 50, clamped to [1, 500]. */
	readonly maxResults?: number;
	/** Case-sensitive match. Default false. */
	readonly caseSensitive?: boolean;
	/** Directory names to skip entirely. Default: build/vcs/dep dirs. */
	readonly ignoreDirs?: readonly string[];
	/** Treat `query` as a JS regular expression instead of a literal substring. */
	readonly regex?: boolean;
	/**
	 * Glob(s) on the relative file path a file must match to be searched
	 * (e.g. `src/**\/*.ts`). When given, this REPLACES the extension allow-list.
	 */
	readonly include?: readonly string[];
	/** Glob(s) on the relative file path to exclude (takes priority). */
	readonly exclude?: readonly string[];
	/** Skip paths matched by the workspace root's `.gitignore`. Default true. */
	readonly respectGitignore?: boolean;
	/** Lines of context before/after each hit. Default 0, clamped to [0, 10]. */
	readonly context?: number;
	/**
	 * Use the `rg` (ripgrep) binary when it's on `$PATH` instead of the
	 * in-house walker. Opt-in: faster on huge repos, but requires the user
	 * to have it installed. Silently falls back to the in-house walker
	 * (with a `usedRg: false` + `rgFallbackReason` in the result) when
	 * `rg` isn't available.
	 */
	readonly preferRg?: boolean;
}

/** Thrown when `regex: true` and `query` is not a valid regular expression. */
export class InvalidSearchPatternError extends Error {
	constructor(
		readonly pattern: string,
		readonly detail: string,
	) {
		super(`invalid regex "${pattern}": ${detail}`);
		this.name = 'InvalidSearchPatternError';
	}
}

/**
 * Solid-Strategy: the narrowest contract a search backend must
 * satisfy. Implementations own ONE algorithm (in-house walker,
 * ripgrep shell-out, future `ag` / `git grep` / LSP indexer…).
 *
 * `id` is a stable identifier the dispatcher logs; `isAvailable` is
 * the probe that decides whether to wire this backend into the
 * active chain; `execute` runs the search.
 *
 * Solid-OCP: new backends are new implementations, never edits to
 * the dispatcher.
 */
export interface ISearchBackend {
	readonly id: string;
	isAvailable(): Promise<boolean>;
	execute(args: {
		readonly workspaceRootAbs: string;
		readonly query: string;
		readonly options: ISearchOptions;
	}): Promise<ISearchResult>;
}

/** A closed union of the backend ids the dispatcher knows today. */
export type SearchBackendId = 'in-house' | 'rg';
