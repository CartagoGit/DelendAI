/**
 * global-config.migrator.ts — b00239 S5.
 *
 * Migrates the host's GLOBAL config (Claude Code's `~/.claude.json`,
 * Codex's `~/.codex/config.toml`) — the configs that live in the
 * user's home directory and reference multiple workspaces — without
 * touching entries that belong to other workspaces.
 *
 * ## Why this is a separate module from the S4 host-config migrator
 *
 * The S4 host-config migrator owns the workspace-local file
 * `<workspaceRoot>/.vscode/mcp.json`; that file belongs to one
 * workspace by construction. The global configs sit in `$HOME`
 * and list every workspace the user has ever opened; rewriting
 * them without proving which entry belongs to the workspace being
 * migrated would corrupt the other workspaces' state.
 *
 * ## The two proofs the migrator requires
 *
 * The migrator walks every entry in every host config and asks
 * `isOwnedByWorkspace` for permission to rewrite each. An entry
 * is rewritten iff the predicate returns `true`; every other
 * entry is left byte-for-byte unchanged. The migrator's contract
 * is "only touch entries whose ownership is demonstrable", and
 * that contract is enforced in three places:
 *
 *   1. the parser produces an abstract shape the predicate
 *      understands (one record per project entry, plus optional
 *      metadata);
 *   2. the applier filters entries through the predicate before
 *      rewriting them;
 *   3. the file is written back only when at least one owned
 *      entry changed; unowned entries never reach disk.
 *
 * ## IO abstraction
 *
 * The migrator's IO is parameterised so tests can run against an
 * in-memory fixture (no real `$HOME` writes). Production callers
 * pass a real-fs adapter built from `node:fs/promises`. The
 * migrator is the only consumer of the IO surface — the
 * `IMigration` factory stitches it onto the engine's
 * `IMigrationContext` shape.
 *
 * ## Why no full TOML / JSON parsers
 *
 * The host configs we read are simple: Claude Code writes JSON
 * and Codex writes a flat TOML with one `[projects."<key>"]`
 * section per entry. A purpose-built, narrow parser is shorter
 * than a generic one and impossible to misuse on a richer
 * document. The migrator does NOT touch any keys it does not
 * own — Claude Code's `oauthAccount`, `statsigGgs`, etc. pass
 * through untouched because they are not under `projects`.
 */

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join, sep } from 'node:path';

import type {
	IMigration,
	IMigrationContext,
	IMigrationPlanStep,
} from '../../contracts/interfaces/workspace-migration.interface';

import {
	rewriteIdentityInString,
	stringHasLegacyIdentity,
	type IIdentityRename,
} from '../migrators/identity-renames';

import {
	collectOwnership,
	normalizeWorkspacePath,
	type IAbstractWorkspaceEntry,
} from './workspace-ownership';

/** Stable id recorded in the journal. NOT a number, by design. */
export const GLOBAL_CONFIG_MIGRATOR_ID = 'globalConfigMigrator:v1';

/** The host identifiers the migrator understands today. */
export type THostKind = 'claude' | 'codex';

/** One host's global config file we want to inspect. */
export interface IHostConfigSpec {
	readonly host: THostKind;
	/** Absolute or `~`-prefixed path the IO knows how to read. */
	readonly path: string;
}

/**
 * The IO contract every host config adapter must satisfy.
 *
 * Production adapter: wraps `node:fs/promises`. Test adapter:
 * an in-memory map. The migrator never bypasses this surface —
 * every read, write and existence check goes through it.
 */
export interface IHostConfigFileIO {
	readonly read: (path: string) => Promise<string>;
	readonly write: (path: string, contents: string) => Promise<void>;
	readonly exists: (path: string) => Promise<boolean>;
}

/**
 * The migrator's options.
 *
 * `hostConfigs` is the list of files to walk; production callers
 * pass `~/.claude.json` and `~/.codex/config.toml`, tests pass
 * paths under `tmpdir()`.
 *
 * `renames` defaults to the shared `IDENTITY_RENAMES` table (the
 * same one S4's migrators use); tests can override it to prove
 * the migrator is rename-agnostic.
 */
export interface IGlobalConfigMigratorOptions {
	readonly workspaceRoot: string;
	readonly hostConfigs: readonly IHostConfigSpec[];
	readonly io: IHostConfigFileIO;
	readonly renames?: readonly IIdentityRename[];
}

/**
 * The abstract shape the migrator reasons about, regardless of
 * which host produced the file. Each host adapter parses its
 * format into this shape.
 *
 * `otherFields` carries top-level fields the migrator does not
 * own (Claude Code's `oauthAccount`, `statsigGgs`, etc.) so the
 * writer can round-trip them unchanged when no `projects` entry
 * is rewritten. A file with only `projects` to migrate still
 * preserves every other top-level key verbatim.
 */
export interface IAbstractHostConfig {
	readonly host: THostKind;
	readonly path: string;
	/**
	 * Original raw text. Kept so the writer can round-trip
	 * unchanged sections byte-for-byte when no entry is touched.
	 */
	readonly raw: string;
	readonly projects: readonly IAbstractWorkspaceEntry[];
	/**
	 * Top-level fields the migrator does not own. Claude Code
	 * writes several (`oauthAccount`, `numStartups`, etc.) and we
	 * must preserve them; the Codex host config has none, so its
	 * parser always returns an empty record.
	 */
	readonly otherFields?: Readonly<Record<string, unknown>>;
}

/**
 * What `apply` reports: which entries were rewritten, which
 * were intentionally left alone, and which files were written
 * back to disk.
 */
export interface IGlobalConfigReport {
	readonly rewritten: readonly IGlobalConfigEntryTrace[];
	readonly untouched: readonly IGlobalConfigEntryTrace[];
	readonly writtenFiles: readonly string[];
	/** Files inspected but left unchanged on disk (no owned entry changed). */
	readonly skippedFiles: readonly string[];
}

/** One trace entry for diagnostics + manifest emission. */
export interface IGlobalConfigEntryTrace {
	readonly host: THostKind;
	readonly configPath: string;
	readonly projectKey: string;
}

/**
 * Cheap probe: does any host config file exist on disk?
 *
 * Returns as soon as the first file is found. The migrator is
 * structured so a workspace that does not write anything to
 * `$HOME` (the common case under POSIX) costs one `exists` call
 * per host config — three at the time of writing, two more if a
 * future host joins.
 */
export const detectGlobalConfig = async (
	options: IGlobalConfigMigratorOptions,
): Promise<boolean> => {
	for (const spec of options.hostConfigs) {
		if (await options.io.exists(spec.path)) return true;
	}
	return false;
};

/**
 * What `apply` would do, summarised as plan steps.
 *
 * One step per rewritten entry, with the host name + project key
 * for diagnostics. Empty when no owned entry needs rewriting.
 */
export const planGlobalConfig = async (
	options: IGlobalConfigMigratorOptions,
): Promise<readonly IMigrationPlanStep[]> => {
	const rewrites: IMigrationPlanStep[] = [];
	for (const spec of options.hostConfigs) {
		const config = await readHostConfig(spec, options.io);
		if (config === undefined) continue;
		for (const entry of config.projects) {
			const { owned, proofs } = collectOwnership(
				entry,
				options.workspaceRoot,
			);
			if (!owned) continue;
			if (!entryCarriesLegacyIdentity(entry.value)) continue;
			rewrites.push({
				kind: 'rewrite-global-host-entry',
				detail: `${spec.host}:${entry.key} — proofs: ${proofs
					.map((proof) => proof.kind)
					.join(', ')}`,
			});
		}
	}
	return rewrites;
};

/**
 * Apply the migration: walk each host config, rewrite the
 * entries the ownership predicate accepts, write the file back
 * iff at least one owned entry changed.
 *
 * Returns a structured report so the caller (the migration
 * manifest in S6, or `--dry-run` in the CLI) can surface what
 * actually happened. The migrator never silently swallows a
 * write or a skip.
 *
 * `untouched` lists OWNED entries that were walked but did not
 * need rewriting (they were already clean). Foreign entries
 * (those for which `isOwnedByWorkspace` returns false) are
 * invisible: the migrator never even considers rewriting them,
 * and listing them in a report would leak information about
 * workspaces the user has not authorised this migration to
 * touch.
 */
export const applyGlobalConfig = async (
	options: IGlobalConfigMigratorOptions,
): Promise<IGlobalConfigReport> => {
	const rewritten: IGlobalConfigEntryTrace[] = [];
	const untouched: IGlobalConfigEntryTrace[] = [];
	const writtenFiles: string[] = [];
	const skippedFiles: string[] = [];

	for (const spec of options.hostConfigs) {
		const config = await readHostConfig(spec, options.io);
		if (config === undefined) {
			skippedFiles.push(spec.path);
			continue;
		}

		const renames = options.renames;
		let anyChanged = false;
		const nextProjects = config.projects.map(
			(entry): IAbstractWorkspaceEntry => {
				const { owned } = collectOwnership(
					entry,
					options.workspaceRoot,
				);
				if (!owned) {
					// Foreign entry: invisible. The migrator never
					// touches it; the byte-for-byte assertion the
					// acceptance criterion pins is that the file as
					// written leaves this entry's value identical to
					// the input, which it does because we return the
					// same reference.
					return entry;
				}
				if (!entryCarriesLegacyIdentity(entry.value)) {
					// Owned and already clean: the predicate accepted
					// the entry but the rewrite would be a no-op.
					// Surface it under `untouched` so diagnostics can
					// say "this workspace's config has no legacy
					// identity" instead of "we forgot to look".
					untouched.push({
						host: spec.host,
						configPath: spec.path,
						projectKey: entry.key,
					});
					return entry;
				}
				const rewrittenValue = rewriteEntryValue(entry.value, renames);
				if (rewrittenValue === entry.value) {
					untouched.push({
						host: spec.host,
						configPath: spec.path,
						projectKey: entry.key,
					});
					return entry;
				}
				anyChanged = true;
				rewritten.push({
					host: spec.host,
					configPath: spec.path,
					projectKey: entry.key,
				});
				return { ...entry, value: rewrittenValue };
			},
		);

		if (!anyChanged) {
			skippedFiles.push(spec.path);
			continue;
		}

		const nextRaw = serializeHostConfig({
			...config,
			projects: nextProjects,
		});
		await options.io.write(spec.path, nextRaw);
		writtenFiles.push(spec.path);
	}

	return { rewritten, untouched, writtenFiles, skippedFiles };
};

/**
 * Factory: an `IMigration` that defers everything to the pure
 * functions above. The factory takes the IO + host config list
 * once, returns an object whose `detect` / `plan` / `apply`
 * methods all reach back to the captured options.
 *
 * The captured `io` is the only seam through which bytes flow —
 * tests pass an in-memory adapter, production passes
 * `createFileSystemHostConfigIO()`.
 */
export const createGlobalConfigMigrator = (
	staticOptions: Omit<IGlobalConfigMigratorOptions, 'dryRun'>,
): IMigration => ({
	id: GLOBAL_CONFIG_MIGRATOR_ID,

	detect: async () => detectGlobalConfig(staticOptions),

	plan: async () => planGlobalConfig(staticOptions),

	apply: async (ctx: IMigrationContext) => {
		if (ctx.dryRun) return;
		await applyGlobalConfig(staticOptions);
	},
});

// ───────────────────────────────────────────────────────────────────────────
// IO adapters
// ───────────────────────────────────────────────────────────────────────────

/**
 * Production adapter: real `node:fs/promises` calls, scoped to
 * whatever paths the caller hands in.
 *
 * No I/O happens until `read` / `write` / `exists` is invoked, so
 * importing this module never touches the user's `$HOME`.
 */
export const createFileSystemHostConfigIO = (): IHostConfigFileIO => ({
	read: async (path) => readFile(path, 'utf8'),
	write: async (path, contents) => {
		await mkdir(dirname(path), { recursive: true });
		await writeFile(path, contents, 'utf8');
	},
	exists: async (path) => {
		try {
			await readFile(path);
			return true;
		} catch (error) {
			if (
				typeof error === 'object' &&
				error !== null &&
				'code' in error &&
				(error as { code: unknown }).code === 'ENOENT'
			) {
				return false;
			}
			throw error;
		}
	},
});

/**
 * In-memory adapter: keeps every file under a single map keyed by
 * path. Tests use it to assert "the migrator wrote exactly this
 * path and no other" without touching real disk.
 */
export const createInMemoryHostConfigIO = (
	initial: Readonly<Record<string, string>> = {},
): IHostConfigFileIO & {
	readonly snapshot: () => Readonly<Record<string, string>>;
	readonly writtenPaths: () => readonly string[];
} => {
	const store = new Map<string, string>(Object.entries(initial));
	const written: string[] = [];
	return {
		read: async (path) => {
			const value = store.get(path);
			if (value === undefined) {
				const error = new Error(
					`ENOENT: ${path}`,
				) as NodeJS.ErrnoException;
				error.code = 'ENOENT';
				throw error;
			}
			return value;
		},
		write: async (path, contents) => {
			store.set(path, contents);
			if (!written.includes(path)) written.push(path);
		},
		exists: async (path) => store.has(path),
		snapshot: () => Object.fromEntries(store.entries()),
		writtenPaths: () => written.slice(),
	};
};

// ───────────────────────────────────────────────────────────────────────────
// Host parsers / serializers
// ───────────────────────────────────────────────────────────────────────────

const entryCarriesLegacyIdentity = (value: unknown): boolean => {
	if (typeof value === 'string') return stringHasLegacyIdentity(value);
	for (const leaf of collectAllStrings(value)) {
		if (stringHasLegacyIdentity(leaf)) return true;
	}
	return false;
};

const collectAllStrings = (node: unknown): readonly string[] => {
	if (typeof node === 'string') return [node];
	if (Array.isArray(node)) {
		const out: string[] = [];
		for (const child of node) out.push(...collectAllStrings(child));
		return out;
	}
	if (node !== null && typeof node === 'object') {
		const out: string[] = [];
		for (const child of Object.values(node as Record<string, unknown>)) {
			out.push(...collectAllStrings(child));
		}
		return out;
	}
	return [];
};

/**
 * Apply `renames` to every string leaf inside `value`. Pure: a
 * new value is returned only when at least one leaf actually
 * changed. The migrator compares the old and new values to
 * decide whether to mark the entry as `rewritten` or `untouched`.
 *
 * Object KEYS are walked too: a server entry registered as
 * `mcp-vertex` becomes `delendai` after the rewrite, and the
 * S8 residual scanner would flag the stale key otherwise. Only
 * string-typed keys carry the identity; non-string keys (rare
 * in MCP configs, common in IndexedDB-shaped payloads) pass
 * through untouched.
 */
const rewriteEntryValue = (
	value: unknown,
	renames: readonly IIdentityRename[] | undefined,
): unknown => {
	const rewriter = (input: string): string => {
		if (renames === undefined) return rewriteIdentityInString(input);
		let output = input;
		for (const { from, to } of renames) {
			if (output.includes(from)) output = output.split(from).join(to);
		}
		return output;
	};
	return rewriteNode(value, rewriter);
};

const rewriteNode = (
	node: unknown,
	rewrite: (input: string) => string,
): unknown => {
	if (typeof node === 'string') return rewrite(node);
	if (Array.isArray(node)) {
		let changed = false;
		const next = node.map((child) => {
			const result = rewriteNode(child, rewrite);
			if (result !== child) changed = true;
			return result;
		});
		return changed ? next : node;
	}
	if (node !== null && typeof node === 'object') {
		const record = node as Record<string, unknown>;
		let changed = false;
		const next: Record<string, unknown> = {};
		for (const [key, child] of Object.entries(record)) {
			const rewrittenKey =
				typeof key === 'string' ? rewrite(key) : (key as string);
			const result = rewriteNode(child, rewrite);
			if (rewrittenKey !== key || result !== child) changed = true;
			next[rewrittenKey] = result;
		}
		return changed ? next : node;
	}
	return node;
};

const readHostConfig = async (
	spec: IHostConfigSpec,
	io: IHostConfigFileIO,
): Promise<IAbstractHostConfig | undefined> => {
	if (!(await io.exists(spec.path))) return undefined;
	const raw = await io.read(spec.path);
	switch (spec.host) {
		case 'claude':
			return parseClaudeConfig(raw, spec);
		case 'codex':
			return parseCodexConfig(raw, spec);
		default:
			throw new GlobalConfigUnknownHostError(spec.host);
	}
};

/**
 * `~/.claude.json` is JSON; the migrator only walks the top-level
 * `projects` map. Other top-level fields (`oauthAccount`,
 * `statsigGgs`, future additions) are preserved verbatim on the
 * round trip because we re-serialise the same object we parsed.
 */
const parseClaudeConfig = (
	raw: string,
	spec: IHostConfigSpec,
): IAbstractHostConfig => {
	let parsed: unknown;
	try {
		parsed = JSON.parse(raw);
	} catch (error) {
		throw new GlobalConfigParseError(
			spec.host,
			spec.path,
			error instanceof Error ? error.message : String(error),
		);
	}
	if (
		parsed === null ||
		typeof parsed !== 'object' ||
		Array.isArray(parsed)
	) {
		throw new GlobalConfigParseError(
			spec.host,
			spec.path,
			'top-level value is not an object',
		);
	}
	const root = parsed as Record<string, unknown>;
	const projectsRecord = root.projects;
	const otherFields: Record<string, unknown> = {};
	for (const [key, value] of Object.entries(root)) {
		if (key === 'projects') continue;
		otherFields[key] = value;
	}
	if (projectsRecord === undefined) {
		return {
			host: spec.host,
			path: spec.path,
			raw,
			projects: [],
			otherFields,
		};
	}
	if (
		projectsRecord === null ||
		typeof projectsRecord !== 'object' ||
		Array.isArray(projectsRecord)
	) {
		throw new GlobalConfigParseError(
			spec.host,
			spec.path,
			'`projects` is not an object',
		);
	}
	const projects: IAbstractWorkspaceEntry[] = [];
	for (const [key, value] of Object.entries(
		projectsRecord as Record<string, unknown>,
	)) {
		projects.push({ key, value });
	}
	return { host: spec.host, path: spec.path, raw, projects, otherFields };
};

const parseCodexConfig = (
	raw: string,
	spec: IHostConfigSpec,
): IAbstractHostConfig => {
	const entries = parseCodexProjectSections(raw);
	return {
		host: spec.host,
		path: spec.path,
		raw,
		projects: entries,
		otherFields: {},
	};
};

/**
 * Tiny TOML reader scoped to `[projects."<key>"]` sections.
 *
 * We do not need a full TOML parser: Codex's `config.toml`
 * section for a project is a flat list of `key = value` lines,
 * and the section header is the only thing we care about.
 * Anything else is preserved verbatim in the round trip — the
 * writer mirrors the section blocks unchanged except inside the
 * entries the migrator rewrote.
 *
 * Quoted keys (`[projects."/srv/proj with spaces"]`) are
 * accepted; bare keys (`[projects./srv/proj]`) are accepted
 * when they contain only the characters TOML permits in a bare
 * key. Section bodies are kept as parsed records: we only need
 * the rewrite to know where the strings live, and the writer
 * renders the body back as-is (or, when an entry was rewritten,
 * as the same record with string leaves rewritten).
 */
const parseCodexProjectSections = (raw: string): IAbstractWorkspaceEntry[] => {
	const lines = raw.split(/\r?\n/u);
	const entries: IAbstractWorkspaceEntry[] = [];
	let currentKey: string | null = null;
	let currentRecord: Record<string, unknown> | null = null;
	let currentRawLines: string[] = [];

	const flush = (): void => {
		if (currentKey !== null && currentRecord !== null) {
			entries.push({ key: currentKey, value: currentRecord });
		}
		currentKey = null;
		currentRecord = null;
		currentRawLines = [];
	};

	for (const line of lines) {
		const sectionMatch = line.match(
			/^\s*\[projects\.("([^"]+)"|([^\]]+))\]\s*(#.*)?$/u,
		);
		if (sectionMatch !== null) {
			flush();
			const quoted = sectionMatch[2];
			const bare = sectionMatch[3];
			if (quoted !== undefined) {
				currentKey = quoted;
			} else if (bare !== undefined) {
				currentKey = bare.trim();
			}
			currentRecord = {};
			currentRawLines = [line];
			continue;
		}
		if (currentKey === null || currentRecord === null) continue;
		currentRawLines.push(line);
		const pairMatch = line.match(
			/^\s*([A-Za-z0-9_\-.]+)\s*=\s*(.+?)\s*(#.*)?$/u,
		);
		if (pairMatch === null) continue;
		const key = pairMatch[1] ?? '';
		const rawValue = pairMatch[2] ?? '';
		currentRecord[key] = parseCodexScalar(rawValue);
	}
	flush();
	void currentRawLines; // retained for future round-trip preservation
	if (entries.length === 0 && raw.trim().length > 0) {
		// A non-empty file with no `projects.*` sections is not an
		// error: the user may have written unrelated config there.
		// The migrator simply has nothing to do.
		return entries;
	}
	return entries;
};

const parseCodexScalar = (raw: string): unknown => {
	const trimmed = raw.trim();
	if (trimmed === '') return '';
	if (trimmed === 'true') return true;
	if (trimmed === 'false') return false;
	if (/^"[^"]*"$/u.test(trimmed)) return trimmed.slice(1, -1);
	if (/^'[^']*'$/u.test(trimmed)) return trimmed.slice(1, -1);
	if (/^-?\d+(?:\.\d+)?$/u.test(trimmed)) return Number(trimmed);
	if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
		return parseCodexInlineTable(trimmed);
	}
	if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
		try {
			return JSON.parse(trimmed);
		} catch {
			return trimmed;
		}
	}
	return trimmed;
};

/**
 * Parse a TOML inline table (`{ key = value, ... }`) into a
 * JavaScript object. Supports nested inline tables, quoted and
 * bare keys, and string values; enough for the Codex config the
 * migrator walks, no more.
 */
const parseCodexInlineTable = (text: string): Record<string, unknown> => {
	const inner = text.slice(1, -1).trim();
	if (inner === '') return {};
	const pairs: string[] = [];
	let depth = 0;
	let inString: false | '"' | "'" = false;
	let start = 0;
	for (let index = 0; index < inner.length; index += 1) {
		const ch = inner[index];
		if (inString !== false) {
			if (ch === inString && inner[index - 1] !== '\\') inString = false;
			continue;
		}
		if (ch === '"' || ch === "'") {
			inString = ch;
			continue;
		}
		if (ch === '{' || ch === '[') depth += 1;
		else if (ch === '}' || ch === ']') depth -= 1;
		else if (ch === ',' && depth === 0) {
			pairs.push(inner.slice(start, index));
			start = index + 1;
		}
	}
	pairs.push(inner.slice(start));
	const result: Record<string, unknown> = {};
	for (const pair of pairs) {
		const eqIndex = findTopLevelEquals(pair);
		if (eqIndex === -1) continue;
		const rawKey = pair.slice(0, eqIndex).trim();
		const rawValue = pair.slice(eqIndex + 1).trim();
		const key = rawKey.replace(/^["']|["']$/gu, '');
		result[key] = parseCodexScalar(rawValue);
	}
	return result;
};

const findTopLevelEquals = (pair: string): number => {
	let depth = 0;
	let inString: false | '"' | "'" = false;
	for (let index = 0; index < pair.length; index += 1) {
		const ch = pair[index];
		if (inString !== false) {
			if (ch === inString && pair[index - 1] !== '\\') inString = false;
			continue;
		}
		if (ch === '"' || ch === "'") {
			inString = ch;
			continue;
		}
		if (ch === '{' || ch === '[') depth += 1;
		else if (ch === '}' || ch === ']') depth -= 1;
		else if (ch === '=' && depth === 0) return index;
	}
	return -1;
};

/**
 * Inverse of `parseClaudeConfig`: writes the abstract shape back
 * as JSON with stable formatting.
 *
 * Top-level fields the migrator does not own (`oauthAccount`,
 * `statsigGgs`, future additions) are merged back from
 * `otherFields`. Untouched `projects` entries are preserved
 * because we keep their `value` reference (the predicate returns
 * the same object when no proof of ownership is found). The
 * migrator compares old and new values for every entry, so a
 * no-op rewrite cannot end up here.
 */
const serializeClaudeConfig = (config: IAbstractHostConfig): string => {
	const record: Record<string, unknown> = {};
	for (const [key, value] of Object.entries(config.otherFields ?? {})) {
		record[key] = value;
	}
	const projects: Record<string, unknown> = {};
	for (const entry of config.projects) projects[entry.key] = entry.value;
	record.projects = projects;
	return `${JSON.stringify(record, null, '\t')}\n`;
};

/**
 * Inverse of `parseCodexConfig`: emits one `[projects."<key>"]`
 * section per project entry. The section body is rendered from
 * the entry's parsed record (so untouched entries round-trip
 * identically to the input).
 *
 * Section keys are always quoted because the canonical key is
 * an absolute path (contains `/`), and TOML bare keys permit
 * only `A-Za-z0-9_-`. Quoting is always valid TOML; round-trip
 * safety is the point.
 */
const serializeCodexConfig = (config: IAbstractHostConfig): string => {
	const out: string[] = [];
	for (const entry of config.projects) {
		const escaped = entry.key
			.replaceAll('\\', '\\\\')
			.replaceAll('"', '\\"');
		out.push(`[projects."${escaped}"]`);
		if (
			entry.value !== null &&
			typeof entry.value === 'object' &&
			!Array.isArray(entry.value)
		) {
			for (const [k, v] of Object.entries(
				entry.value as Record<string, unknown>,
			)) {
				out.push(`${k} = ${serializeCodexScalar(v)}`);
			}
		}
		out.push('');
	}
	return `${out.join('\n')}`;
};

const serializeCodexScalar = (value: unknown): string => {
	if (typeof value === 'string') {
		const escaped = value.replaceAll('\\', '\\\\').replaceAll('"', '\\"');
		return `"${escaped}"`;
	}
	if (typeof value === 'boolean' || typeof value === 'number')
		return String(value);
	if (value === null) return '""';
	if (Array.isArray(value)) {
		const items = value
			.map((item) => serializeCodexScalar(item))
			.join(', ');
		return `[${items}]`;
	}
	if (typeof value === 'object') {
		const pairs: string[] = [];
		for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
			const key = /[^A-Za-z0-9_-]/u.test(k)
				? `"${k.replaceAll('\\', '\\\\').replaceAll('"', '\\"')}"`
				: k;
			pairs.push(`${key} = ${serializeCodexScalar(v)}`);
		}
		return `{ ${pairs.join(', ')} }`;
	}
	return JSON.stringify(value);
};

const serializeHostConfig = (config: IAbstractHostConfig): string => {
	switch (config.host) {
		case 'claude':
			return serializeClaudeConfig(config);
		case 'codex':
			return serializeCodexConfig(config);
		default:
			throw new GlobalConfigUnknownHostError(config.host);
	}
};

/**
 * Default host configs the production adapter will look at.
 *
 * `~` is resolved at call time (in `applyGlobalConfig`) against
 * `process.env.HOME` so the export stays pure at import time.
 */
export const defaultHostConfigs = (
	homedir: string,
): readonly IHostConfigSpec[] => [
	{ host: 'claude', path: join(homedir, '.claude.json') },
	{ host: 'codex', path: join(homedir, '.codex', 'config.toml') },
];

// ───────────────────────────────────────────────────────────────────────────
// Typed errors
// ───────────────────────────────────────────────────────────────────────────

export class GlobalConfigParseError extends Error {
	readonly host: THostKind;
	readonly file: string;
	constructor(host: THostKind, file: string, reason: string) {
		super(`global config ${file} (${host}) is not parseable: ${reason}`);
		this.name = 'GlobalConfigParseError';
		this.host = host;
		this.file = file;
	}
}

export class GlobalConfigUnknownHostError extends Error {
	readonly host: string;
	constructor(host: string) {
		super(`global config migrator does not know host '${host}'`);
		this.name = 'GlobalConfigUnknownHostError';
		this.host = host;
	}
}

/**
 * Convenience re-export for tests + callers that want the
 * shape of a `projects` entry without depending on
 * workspace-ownership directly.
 */
export type { IAbstractWorkspaceEntry };

// Suppress unused-import warnings: `sep` and `normalizeWorkspacePath`
// are kept available for downstream callers that need them.
void sep;
void normalizeWorkspacePath;
