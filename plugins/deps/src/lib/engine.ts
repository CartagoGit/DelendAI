import { resolveWorkspaceContained } from '@cartago-git/mcp-core/public';
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
	manifestRel: string
): Promise<{ found: boolean; manifest: IManifest }> => {
	// Containment: the manifest path must stay inside the workspace — a
	// `manifest: '../../etc/...'` must not read outside what the host exposes.
	const contained = resolveWorkspaceContained(rootAbs, manifestRel);
	if (!contained.ok) return { found: false, manifest: {} };
	try {
		const parsed = JSON.parse(await readFile(contained.abs, 'utf8')) as IManifest;
		return { found: true, manifest: parsed ?? {} };
	} catch {
		return { found: false, manifest: {} };
	}
};

const sectionEntries = (
	manifest: IManifest,
	section: IDepSection
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
 * manifest path is injectable. Read-only, offline, agnostic. [N19]
 */
export const listDeps = async (
	rootAbs: string,
	manifestRel = 'package.json'
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
		(a, b) => a.name.localeCompare(b.name) || a.section.localeCompare(b.section)
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
	readonly lockfile: { readonly present: boolean; readonly kind: string | null };
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
	rootAbs: string
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
 * core plugin). [N19]
 */
export const checkDeps = async (
	rootAbs: string,
	manifestRel = 'package.json'
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
