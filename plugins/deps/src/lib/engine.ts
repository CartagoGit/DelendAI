import { resolveWorkspaceContained } from '@mcp-vertex/core/public';
import { readFile, stat } from 'node:fs/promises';
import { join } from 'node:path';

export type IDepSection =
	| 'dependencies'
	| 'devDependencies'
	| 'peerDependencies'
	| 'optionalDependencies';

const SECTIONS: readonly IDepSection[] = [
	'dependencies',
	'devDependencies',
	'peerDependencies',
	'optionalDependencies',
];

export interface IDepEntry {
	readonly name: string;
	readonly range: string;
	readonly section: IDepSection;
}

export interface IDepsInventory {
	readonly manifest: string;
	readonly found: boolean;
	readonly counts: Readonly<Record<IDepSection, number>>;
	readonly deps: readonly IDepEntry[];
}

type IManifest = Partial<Record<IDepSection, Record<string, string>>>;

const readManifest = async (
	rootAbs: string,
	manifestRel: string,
): Promise<{ found: boolean; manifest: IManifest }> => {
	// Containment: the manifest path must stay inside the workspace — a
	// `manifest: '../../etc/...'` must not read outside what the host exposes.
	const contained = resolveWorkspaceContained(rootAbs, manifestRel);
	if (!contained.ok) return { found: false, manifest: {} };
	try {
		const parsed = JSON.parse(
			await readFile(contained.abs, 'utf8'),
		) as IManifest;
		return { found: true, manifest: parsed ?? {} };
	} catch {
		return { found: false, manifest: {} };
	}
};

const sectionEntries = (
	manifest: IManifest,
	section: IDepSection,
): IDepEntry[] => {
	const block = manifest[section];
	if (typeof block !== 'object' || block === null) return [];
	return Object.entries(block)
		.filter(([, range]) => typeof range === 'string')
		.map(([name, range]) => ({ name, range, section }));
};

/**
 * Inventory the manifest's declared dependencies across all four sections,
 * with their version ranges. Pure over the injected workspace root; the
 * manifest path is injectable. Read-only, offline, agnostic.
 */
export const listDeps = async (
	rootAbs: string,
	manifestRel = 'package.json',
): Promise<IDepsInventory> => {
	const { found, manifest } = await readManifest(rootAbs, manifestRel);
	const deps: IDepEntry[] = [];
	const counts = {
		dependencies: 0,
		devDependencies: 0,
		peerDependencies: 0,
		optionalDependencies: 0,
	} as Record<IDepSection, number>;
	for (const section of SECTIONS) {
		const entries = sectionEntries(manifest, section);
		counts[section] = entries.length;
		deps.push(...entries);
	}
	deps.sort(
		(a, b) =>
			a.name.localeCompare(b.name) || a.section.localeCompare(b.section),
	);
	return { manifest: manifestRel, found, counts, deps };
};

// ---------------------------------------------------------------------------
// Health check (offline)
// ---------------------------------------------------------------------------

export type IDepsFindingKind =
	| 'no-manifest'
	| 'no-lockfile'
	| 'loose-range'
	| 'duplicate-section';

export interface IDepsFinding {
	readonly kind: IDepsFindingKind;
	readonly dep?: string;
	readonly detail: string;
}

export interface IDepsHealth {
	readonly manifest: string;
	readonly lockfile: {
		readonly present: boolean;
		readonly kind: string | null;
	};
	readonly findings: readonly IDepsFinding[];
	readonly healthy: boolean;
}

const LOCKFILES: ReadonlyArray<{ file: string; kind: string }> = [
	{ file: 'bun.lock', kind: 'bun' },
	{ file: 'bun.lockb', kind: 'bun' },
	{ file: 'package-lock.json', kind: 'npm' },
	{ file: 'pnpm-lock.yaml', kind: 'pnpm' },
	{ file: 'yarn.lock', kind: 'yarn' },
];

// A range is "loose" when it doesn't pin a baseline: `*`, `latest`, `x`, or
// empty. Caret/tilde/exact/`>=x` and protocol ranges (`workspace:`/`npm:`/
// `file:`/`link:`) are fine.
const isLooseRange = (range: string): boolean => {
	const r = range.trim().toLowerCase();
	return r === '' || r === '*' || r === 'latest' || r === 'x';
};

const detectLockfile = async (
	rootAbs: string,
): Promise<{ present: boolean; kind: string | null }> => {
	for (const { file, kind } of LOCKFILES) {
		try {
			await stat(join(rootAbs, file));
			return { present: true, kind };
		} catch {
			// not this lockfile
		}
	}
	return { present: false, kind: null };
};

/**
 * Offline dependency-health report: missing lockfile, loose version ranges
 * and deps declared in more than one section. No network, no CVE database
 * (that would need an external vuln source — out of scope for an agnostic
 * core plugin).
 */
export const checkDeps = async (
	rootAbs: string,
	manifestRel = 'package.json',
): Promise<IDepsHealth> => {
	const inventory = await listDeps(rootAbs, manifestRel);
	const findings: IDepsFinding[] = [];

	if (!inventory.found) {
		findings.push({
			kind: 'no-manifest',
			detail: `no readable manifest at "${manifestRel}"`,
		});
		return {
			manifest: manifestRel,
			lockfile: { present: false, kind: null },
			findings,
			healthy: false,
		};
	}

	const lockfile = await detectLockfile(rootAbs);
	if (!lockfile.present) {
		findings.push({
			kind: 'no-lockfile',
			detail: 'no lockfile found (builds are not reproducible)',
		});
	}

	for (const entry of inventory.deps) {
		if (isLooseRange(entry.range)) {
			findings.push({
				kind: 'loose-range',
				dep: entry.name,
				detail: `"${entry.name}" range "${entry.range || '<empty>'}" (${entry.section}) is unpinned`,
			});
		}
	}

	// Same dep name in more than one section.
	const bySection = new Map<string, IDepSection[]>();
	for (const entry of inventory.deps) {
		bySection.set(entry.name, [
			...(bySection.get(entry.name) ?? []),
			entry.section,
		]);
	}
	for (const [name, sections] of bySection) {
		if (sections.length > 1) {
			findings.push({
				kind: 'duplicate-section',
				dep: name,
				detail: `"${name}" declared in ${sections.join(' + ')}`,
			});
		}
	}

	return {
		manifest: manifestRel,
		lockfile,
		findings,
		healthy: findings.length === 0,
	};
};

// ---------------------------------------------------------------------------
// Outdated check (opt-in, network) — M11
// ---------------------------------------------------------------------------

export interface IOutdatedEntry {
	readonly name: string;
	readonly range: string;
	readonly section: IDepSection;
	/** Baseline version parsed from `range`, or `null` for ranges that don't pin one (`*`, `workspace:`, git urls, …). */
	readonly wanted: string | null;
	/** `dist-tags.latest` from the registry, or `null` if the lookup failed. */
	readonly latest: string | null;
	readonly outdated: boolean;
	readonly error?: string;
}

export interface IDepsOutdatedReport {
	readonly manifest: string;
	readonly checked: number;
	readonly outdatedCount: number;
	readonly entries: readonly IOutdatedEntry[];
	/** True when `maxPackages` cut the manifest's dependency list short. */
	readonly truncated: boolean;
}

/** Resolves a package's latest published version, or `null` if unknown. Injectable so tests never hit the network. */
export type ILatestVersionFetcher = (pkgName: string) => Promise<string | null>;

const NPM_REGISTRY = 'https://registry.npmjs.org';

/** Real fetcher: `GET <registry>/<pkg>/latest` resolves the `latest` dist-tag directly (smaller payload than the full packument). */
export const fetchLatestFromNpm: ILatestVersionFetcher = async (pkgName) => {
	try {
		const res = await fetch(`${NPM_REGISTRY}/${pkgName}/latest`, {
			headers: { accept: 'application/json' },
			signal: AbortSignal.timeout(8000),
		});
		if (!res.ok) return null;
		const json = (await res.json()) as { version?: unknown };
		return typeof json.version === 'string' ? json.version : null;
	} catch {
		return null;
	}
};

/** Strip a leading range operator (`^`, `~`, `>=`, `>`, `=`, `v`) to get the baseline version, or `null` if what remains isn't a plain `x.y.z`. */
const parseWanted = (range: string): string | null => {
	const stripped = range.trim().replace(/^[\^~>=<]*v?/, '');
	return /^\d+\.\d+\.\d+/.test(stripped) ? stripped : null;
};

const versionTuple = (v: string): readonly [number, number, number] | null => {
	const m = /^(\d+)\.(\d+)\.(\d+)/.exec(v);
	if (!m) return null;
	return [Number(m[1]), Number(m[2]), Number(m[3])];
};

/** `true` when `latest` is strictly newer than `wanted` (numeric major.minor.patch, pre-release/build suffix ignored). */
const isNewer = (latest: string, wanted: string): boolean => {
	const a = versionTuple(latest);
	const b = versionTuple(wanted);
	if (!a || !b) return false;
	for (let i = 0; i < 3; i += 1) {
		if (a[i] !== b[i]) return (a[i] ?? 0) > (b[i] ?? 0);
	}
	return false;
};

/**
 * Opt-in, network dependency-staleness check: for each dep whose range pins
 * a plain `x.y.z` baseline, resolve the registry's `latest` dist-tag and flag
 * it as outdated when newer. Ranges without a comparable baseline (`*`,
 * `latest`, `workspace:`/`npm:`/`file:`/`link:`, git urls) are reported with
 * `wanted: null` and skipped, not treated as an error. Capped at
 * `maxPackages` (default 50) so a huge manifest can't turn one call into
 * hundreds of registry requests; `truncated` says when that cap bit.
 */
export const checkOutdated = async (
	rootAbs: string,
	manifestRel = 'package.json',
	fetchLatest: ILatestVersionFetcher = fetchLatestFromNpm,
	maxPackages = 50,
): Promise<IDepsOutdatedReport> => {
	const inventory = await listDeps(rootAbs, manifestRel);
	const truncated = inventory.deps.length > maxPackages;
	const toCheck = inventory.deps.slice(0, maxPackages);

	const entries = await Promise.all(
		toCheck.map(async (dep): Promise<IOutdatedEntry> => {
			const wanted = parseWanted(dep.range);
			if (wanted === null) {
				return {
					name: dep.name,
					range: dep.range,
					section: dep.section,
					wanted: null,
					latest: null,
					outdated: false,
				};
			}
			try {
				const latest = await fetchLatest(dep.name);
				return {
					name: dep.name,
					range: dep.range,
					section: dep.section,
					wanted,
					latest,
					outdated: latest !== null && isNewer(latest, wanted),
				};
			} catch (err) {
				return {
					name: dep.name,
					range: dep.range,
					section: dep.section,
					wanted,
					latest: null,
					outdated: false,
					error: String(err),
				};
			}
		}),
	);

	return {
		manifest: manifestRel,
		checked: entries.length,
		outdatedCount: entries.filter((e) => e.outdated).length,
		entries,
		truncated,
	};
};
