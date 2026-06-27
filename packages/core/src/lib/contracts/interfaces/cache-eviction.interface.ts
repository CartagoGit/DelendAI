/**
 * Cache eviction — f00068 slice A.
 *
 * Declarative policy layer over the shared `<cacheDir>` root. Plugins
 * contribute {@link ICacheEvictionRule} entries; the
 * {@link ICacheEvictionRegistry} applies them on demand (boot sweep,
 * manual tool call, scheduled task). Every rule's path is contained
 * under the workspace, every apply is reported in
 * {@link ICacheEvictionReport}.
 *
 * Solid-ISP: the three concerns are split into sub-interfaces
 * (`ICacheEvictionRule`, `ICacheEvictionRegistry`, `ICacheEvictionReport`).
 * Consumers depending only on the rule shape (e.g. a static-rules
 * module in the `cache` plugin) import `ICacheEvictionRule`; the boot
 * wiring depends on the full registry.
 */

// --- strategy -------------------------------------------------------------

/** Delete entries whose date (from `YYYY-MM-DD[.ext]` name, else
 *  mtime) is older than `days` ago. Use for date-rolled artefacts. */
export interface ICacheEvictionOlderThan {
	readonly kind: 'olderThanDays';
	readonly days: number;
}

/** Delete entries whose mtime is older than `days` ago. Use for
 *  snapshots that don't carry a date in their name. */
export interface ICacheEvictionOlderThanMtime {
	readonly kind: 'olderThanMtimeDays';
	readonly days: number;
}

/** Keep the most-recent `n` entries by mtime, delete the rest. Use
 *  for bounded journals (state.jsonl, lock journals). */
export interface ICacheEvictionKeepLastN {
	readonly kind: 'keepLastN';
	readonly n: number;
}

/** Plugin-defined eviction. Receives the absolute target directory;
 *  returns the workspace-relative paths it removed (or would remove
 *  on dry-run). Use when a plugin already owns its gc logic (e.g.
 *  `logs.gc()`) and we just want it in the registry's report. */
export interface ICacheEvictionCustom {
	readonly kind: 'custom';
	readonly run: (
		targetAbs: string,
		dryRun: boolean,
	) => Promise<readonly string[]>;
}

export type ICacheEvictionWhen =
	| ICacheEvictionOlderThan
	| ICacheEvictionOlderThanMtime
	| ICacheEvictionKeepLastN
	| ICacheEvictionCustom;

// --- rule + report --------------------------------------------------------

/**
 * A single eviction rule. `path` is interpreted relative to the
 * resolved cacheDir (NOT the workspace root) — the registry's whole
 * purpose is to operate on `<cacheDir>`, so its rules address that
 * subtree directly. Supports a single `*` segment meaning "every
 * direct child of this directory" (matches the existing
 * `handoff/*` convention). The registry rejects any rule whose path
 * escapes the workspace.
 */
export interface ICacheEvictionRule {
	readonly id: string;
	readonly owner: string;
	readonly path: string;
	readonly when: ICacheEvictionWhen;
	/** Default `true`. Disabled rules stay registered but never apply. */
	readonly enabled?: boolean;
}

/** What got (or would have got) removed, with a byte estimate. */
export interface ICacheEvictionRemoved {
	readonly id: string;
	readonly path: string;
	readonly bytes: number;
}

/** A rule that was registered but did not apply this run. */
export interface ICacheEvictionSkipped {
	readonly id: string;
	readonly reason: string;
}

/** Per-rule failure. Failures do NOT abort the run. */
export interface ICacheEvictionErrored {
	readonly id: string;
	readonly path: string;
	readonly error: string;
}

/** Result of a `registry.run()` call. */
export interface ICacheEvictionReport {
	readonly dryRun: boolean;
	readonly appliedAt: string;
	readonly totalBytes: number;
	readonly removed: readonly ICacheEvictionRemoved[];
	readonly skipped: readonly ICacheEvictionSkipped[];
	readonly errors: readonly ICacheEvictionErrored[];
	readonly rulesEvaluated: number;
}

// --- registry -------------------------------------------------------------

/** Run options. `dryRun` defaults to `true` (matches `audit_plan`). */
export interface ICacheEvictionRunOptions {
	readonly dryRun?: boolean;
	/** Limit evaluation to a single owner. Useful for plugin-local tests. */
	readonly onlyOwner?: string;
	/** Override "now" for TTL rules. Test seam only — never exposed via tools. */
	readonly now?: Date;
}

/**
 * The eviction registry. Plugins call `register` once during their
 * `register()` hook; the boot sweep calls `run` after every plugin
 * has loaded. Last-writer-wins on duplicate `id`.
 */
export interface ICacheEvictionRegistry {
	register(rule: ICacheEvictionRule): void;
	unregister(id: string): boolean;
	list(): readonly ICacheEvictionRule[];
	run(options?: ICacheEvictionRunOptions): Promise<ICacheEvictionReport>;
}
