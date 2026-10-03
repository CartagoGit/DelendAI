#!/usr/bin/env bun
/**
 * capabilities-declared.script.ts — c00137 (Track F / security).
 *
 * Lint that walks every plugin under plugins/<name>/src/, detects
 * the capabilities the plugin's code USES via
 * `ctx.capabilities.<group>.<action>(...)` patterns, and compares
 * against the capabilities the plugin DECLARES in its manifest.
 *
 * Violations:
 *   - a plugin uses a capability it did NOT declare
 *   - a plugin declared a capability in its `capabilities-pending`
 *     whitelist whose migration-due date has passed
 *
 * Whitelist (per-plugin, per-file comments):
 *   // capabilities-pending: fs:write, network:fetch
 *   // capabilities-migration-due: 2026-09-15
 *
 * The whitelist is per-FILE (each comment lives in the file that
 * uses the capability); the migration-due is per-PLUGIN (every
 * pending capability inherits the same deadline).
 *
 * Pure helpers are exported so the spec file can unit-test the
 * detection + whitelist logic without touching the filesystem.
 */
import { readFile, readdir } from 'node:fs/promises';
import { join, relative } from 'node:path';

import { repoRoot } from '../lib/monorepo-paths';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ICapabilityUsage {
	readonly capability: string; // 'git:write', 'fs:read', ...
	readonly group: string;
	readonly action: string;
	readonly file: string; // repo-relative
	readonly line: number;
}

export interface ICapabilityPendingWhitelist {
	readonly pending: readonly string[];
	readonly dueDate: string | null; // YYYY-MM-DD or null
	readonly sourceFile: string; // file that declared the whitelist
}

export interface ICapabilityLintViolation {
	readonly pluginId: string;
	readonly file: string;
	readonly line: number;
	readonly capability: string;
	readonly kind: 'used-but-not-declared' | 'whitelist-expired';
	readonly declared: readonly string[];
	readonly note: string;
}

export interface ICapabilityLintReport {
	readonly ok: boolean;
	readonly violations: readonly ICapabilityLintViolation[];
	readonly scannedPlugins: number;
	readonly scannedFiles: number;
}

// ---------------------------------------------------------------------------
// Pure helpers
// ---------------------------------------------------------------------------

/**
 * Split a `group.action` token. Mirrors the core helper
 * `splitCapability` but operates on the dot-separated form used in
 * `ctx.capabilities.X.Y(...)` source patterns. Pure.
 */
export const splitUsage = (
	raw: string,
): { readonly group: string; readonly action: string } | null => {
	const dot = raw.indexOf('.');
	if (dot <= 0 || dot === raw.length - 1) return null;
	return { group: raw.slice(0, dot), action: raw.slice(dot + 1) };
};

/**
 * Detect capability usage in a single source file. Returns one
 * `ICapabilityUsage` per match (potentially with duplicates on the
 * same line if the pattern appears twice — the lint deduplicates
 * by line+capability below). Pure.
 */
const USAGE_PATTERNS: readonly RegExp[] = [
	// ctx.capabilities.git.write(...) / ctx.capabilities.fs.read(...)
	/\bctx\.capabilities\.([a-z][a-z0-9_-]*)\.([a-z][a-z0-9_-]*)\b/g,
	// c.capabilities.git.write(...) — short alias
	/\bc\.capabilities\.([a-z][a-z0-9_-]*)\.([a-z][a-z0-9_-]*)\b/g,
	// caps.capabilities.git.write(...) — another short alias
	/\bcaps\.capabilities\.([a-z][a-z0-9_-]*)\.([a-z][a-z0-9_-]*)\b/g,
];

export const detectUsageInSource = (
	source: string,
	file: string,
): readonly ICapabilityUsage[] => {
	const usages: ICapabilityUsage[] = [];
	for (const pattern of USAGE_PATTERNS) {
		pattern.lastIndex = 0;
		while (true) {
			const match = pattern.exec(source);
			if (match === null) break;
			const group = match[1] as string;
			const action = match[2] as string;
			usages.push({
				capability: `${group}:${action}`,
				group,
				action,
				file,
				line: lineOf(source, match.index),
			});
		}
	}
	return usages;
};

/**
 * Parse the whitelist comments out of a source file. Returns `null`
 * when no whitelist is declared; otherwise returns the pending
 * capability list and the optional due date. Pure.
 *
 * Recognised lines:
 *   // capabilities-pending: fs:write, network:fetch
 *   // capabilities-migration-due: 2026-09-15
 */
export const parseWhitelist = (
	source: string,
	sourceFile: string,
): ICapabilityPendingWhitelist | null => {
	let pending: string[] | null = null;
	let dueDate: string | null = null;
	for (const line of source.split(/\r?\n/)) {
		const trimmed = line.trim();
		if (pending === null) {
			// Match `// capabilities-pending: ...`, `# capabilities-pending: ...`,
			// or bare `capabilities-pending: ...`.
			const match = /^(?:\/\/|#)?\s*capabilities-pending:\s*(.+)$/u.exec(
				trimmed,
			);
			if (match !== null) {
				pending = (match[1] ?? '')
					.split(',')
					.map((entry) => entry.trim())
					.filter((entry) => entry.length > 0);
			}
		}
		const dueMatch =
			/^(?:\/\/|#)?\s*capabilities-migration-due:\s*(\d{4}-\d{2}-\d{2})\s*$/u.exec(
				trimmed,
			);
		if (dueMatch !== null) {
			dueDate = dueMatch[1] as string;
		}
	}
	if (pending === null) return null;
	return {
		pending,
		dueDate,
		sourceFile,
	};
};

const lineOf = (source: string, index: number): number => {
	let line = 1;
	for (let i = 0; i < index && i < source.length; i++) {
		if (source.charCodeAt(i) === 10) line++;
	}
	return line;
};

// ---------------------------------------------------------------------------
// Date helpers
// ---------------------------------------------------------------------------

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/u;

/**
 * Has the migration-due date passed (today >= due)? Pure. The
 * `today` parameter exists for testability — production callers
 * leave it undefined and the helper uses `new Date()`.
 */
export const isWhitelistExpired = (
	dueDate: string,
	today: Date = new Date(),
): boolean => {
	if (!ISO_DATE_RE.test(dueDate)) return true; // malformed → expired
	const todayUtc = Date.UTC(
		today.getUTCFullYear(),
		today.getUTCMonth(),
		today.getUTCDate(),
	);
	const [year, month, day] = dueDate.split('-').map(Number) as [
		number,
		number,
		number,
	];
	const dueUtc = Date.UTC(year, month - 1, day);
	return todayUtc >= dueUtc;
};

// ---------------------------------------------------------------------------
// File enumeration
// ---------------------------------------------------------------------------

const PLUGIN_SRC_GLOB = 'src';
const TS_EXTENSIONS = new Set(['.ts', '.tsx', '.mts', '.cts']);

const collectTsFiles = async (dir: string): Promise<string[]> => {
	const out: string[] = [];
	let entries: import('node:fs').Dirent[];
	try {
		entries = await readdir(dir, { withFileTypes: true });
	} catch {
		return out;
	}
	for (const entry of entries.sort((left, right) =>
		left.name.localeCompare(right.name),
	)) {
		const full = join(dir, entry.name);
		if (entry.isDirectory()) {
			out.push(...(await collectTsFiles(full)));
			continue;
		}
		if (!entry.isFile()) continue;
		const dot = entry.name.lastIndexOf('.');
		if (dot < 0) continue;
		const ext = entry.name.slice(dot);
		if (TS_EXTENSIONS.has(ext)) out.push(full);
	}
	return out;
};

// ---------------------------------------------------------------------------
// Manifest loader
// ---------------------------------------------------------------------------

/**
 * Read a plugin's manifest source and pull out `id` + the
 * `capabilities` array. We do NOT run the TypeScript — we use a
 * regex on the source to extract the literal capability tokens,
 * which is enough for the lint and avoids the cost of an
 * additional ts-loader call. Pure over the source string.
 */
export const readManifestCapabilities = (
	manifestSource: string,
): readonly string[] => {
	const match = /capabilities:\s*\[([^\]]*)\]/u.exec(manifestSource);
	if (match === null) return [];
	const inner = match[1] as string;
	const tokens: string[] = [];
	for (const raw of inner.split(',')) {
		const trimmed = raw
			.trim()
			.replace(/^['"]|['"]$/g, '')
			.replace(/\s+/g, '');
		if (trimmed.length > 0) tokens.push(trimmed);
	}
	return tokens;
};

/**
 * Walk the `plugins/` directory and produce a `{ pluginId,
 * manifestPath, srcDir, capabilities }` record per plugin. Pure
 * adapter over `fs` — easy to mock in tests.
 */
export const discoverPlugins = async (
	root: string,
): Promise<
	readonly {
		readonly id: string;
		readonly manifestPath: string;
		readonly srcDir: string;
		readonly capabilities: readonly string[];
	}[]
> => {
	const pluginsDir = join(root, 'plugins');
	let entries: import('node:fs').Dirent[];
	try {
		entries = await readdir(pluginsDir, { withFileTypes: true });
	} catch {
		return [];
	}
	const out: Array<{
		readonly id: string;
		readonly manifestPath: string;
		readonly srcDir: string;
		readonly capabilities: readonly string[];
	}> = [];
	for (const entry of entries) {
		if (!entry.isDirectory()) continue;
		const manifestPath = join(pluginsDir, entry.name, 'plugin.manifest.ts');
		const srcDir = join(pluginsDir, entry.name, PLUGIN_SRC_GLOB);
		let manifestSource: string | null = null;
		try {
			manifestSource = await readFile(manifestPath, 'utf8');
		} catch {
			continue;
		}
		if (manifestSource === null) continue;
		out.push({
			id: entry.name,
			manifestPath,
			srcDir,
			capabilities: readManifestCapabilities(manifestSource),
		});
	}
	return out;
};

// ---------------------------------------------------------------------------
// Main pipeline
// ---------------------------------------------------------------------------

export const lintCapabilitiesDeclared = async (
	root: string,
	options: { readonly today?: Date } = {},
): Promise<ICapabilityLintReport> => {
	const plugins = await discoverPlugins(root);
	const violations: ICapabilityLintViolation[] = [];
	let scannedFiles = 0;
	for (const plugin of plugins) {
		const files = await collectTsFiles(plugin.srcDir);
		scannedFiles += files.length;
		const declaredSet = new Set(plugin.capabilities);
		// Phase 1 — read every file, collect (whitelist, source, usages)
		// in one pass. Phase 2 applies the whitelist to every usage.
		interface IFileScan {
			readonly rel: string;
			readonly source: string;
			readonly usages: readonly ICapabilityUsage[];
			readonly whitelist: ICapabilityPendingWhitelist | null;
		}
		const scans: IFileScan[] = [];
		for (const abs of files) {
			const source = await readFile(abs, 'utf8').catch(() => null);
			if (source === null) continue;
			const rel = relative(root, abs);
			scans.push({
				rel,
				source,
				usages: detectUsageInSource(source, rel),
				whitelist: parseWhitelist(source, rel),
			});
		}
		// Phase 2 — apply the whitelist.
		for (const scan of scans) {
			for (const usage of scan.usages) {
				if (declaredSet.has(usage.capability)) continue;
				const wl = scan.whitelist;
				const pendingOk =
					wl?.pending.includes(usage.capability) &&
					wl.dueDate !== null &&
					!isWhitelistExpired(wl.dueDate, options.today);
				if (pendingOk) continue;
				const expired =
					wl?.pending.includes(usage.capability) &&
					wl.dueDate !== null &&
					isWhitelistExpired(wl.dueDate, options.today);
				violations.push({
					pluginId: plugin.id,
					file: scan.rel,
					line: usage.line,
					capability: usage.capability,
					kind: expired
						? 'whitelist-expired'
						: 'used-but-not-declared',
					declared: plugin.capabilities,
					note: expired
						? `whitelist expired on ${wl?.dueDate}; capability '${usage.capability}' must be added to the manifest`
						: `capability '${usage.capability}' is used but not declared in ${plugin.id}/plugin.manifest.ts`,
				});
			}
		}
	}
	return {
		ok: violations.length === 0,
		violations,
		scannedPlugins: plugins.length,
		scannedFiles,
	};
};

const formatReport = (report: ICapabilityLintReport): string => {
	if (report.ok) {
		return `✓ capabilities-declared: ${report.scannedPlugins} plugin(s), ${report.scannedFiles} file(s) — every used capability is declared.`;
	}
	const lines: string[] = [
		`✖ capabilities-declared: ${report.violations.length} violation(s) across ${report.scannedPlugins} plugin(s) (${report.scannedFiles} file(s) scanned)`,
	];
	for (const violation of report.violations) {
		lines.push(
			`  ${violation.pluginId}/${violation.file}:${violation.line} — ${violation.kind} (${violation.capability})`,
		);
	}
	return lines.join('\n');
};

if (import.meta.main) {
	const root = repoRoot();
	const report = await lintCapabilitiesDeclared(root);
	const text = formatReport(report);
	if (report.ok) {
		console.log(text);
		process.exit(0);
	}
	console.error(text);
	process.exit(1);
}
