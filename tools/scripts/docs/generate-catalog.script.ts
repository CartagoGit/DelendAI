#!/usr/bin/env bun
import { dirname, relative, resolve } from 'node:path';
import { mkdir, readFile, writeFile } from 'node:fs/promises';

import {
	FIRST_PARTY_PLUGIN_INDEX,
	PRESET_KIND,
	resolvePresetMembers,
	type IPluginRegistryEntry,
} from '@delendai/core/public';

import {
	discoverPluginPackages,
	loadPluginManifests,
	type ILoadedPluginManifest,
	type IPluginPackageRecord,
} from '../generate/from-manifests.script';

export const README_PATH = 'README.md';
export const README_PLUGIN_TABLE_START =
	'<!-- BEGIN GENERATED: plugin-layout-table -->';
export const README_PLUGIN_TABLE_END =
	'<!-- END GENERATED: plugin-layout-table -->';
export const GENERATED_CATALOG_PATH =
	'docs/mcp-vertex/generated/plugin-catalog.generated.md';

export interface ICatalogIo {
	readonly readText: (absPath: string) => Promise<string | undefined>;
	readonly writeText: (absPath: string, text: string) => Promise<void>;
	readonly ensureDir: (absPath: string) => Promise<void>;
	readonly info: (message: string) => void;
	readonly error: (message: string) => void;
}

export interface IPluginCatalogEntry {
	readonly id: string;
	readonly path: string;
	readonly package: string;
	readonly version: string;
	readonly summary: string;
	readonly summarySource: 'manifest' | 'index';
	readonly defaultPreset: string;
	readonly presetMembership: readonly string[];
	readonly capabilities: readonly string[];
	readonly capabilitySource: 'manifest' | 'index-only';
	readonly permissions: readonly string[];
	readonly tags: readonly string[];
}

export interface ICatalogGeneratorResult {
	readonly entries: readonly IPluginCatalogEntry[];
	readonly outputs: Readonly<Record<string, string>>;
	readonly changed: boolean;
}

const defaultIo = (): ICatalogIo => ({
	readText: async (absPath) => {
		try {
			return await readFile(absPath, 'utf8');
		} catch {
			return undefined;
		}
	},
	writeText: async (absPath, text) => {
		await writeFile(absPath, text, 'utf8');
	},
	ensureDir: async (absPath) => {
		await mkdir(absPath, { recursive: true });
	},
	info: (message) => console.log(message),
	error: (message) => console.error(message),
});

const escapeCell = (value: string): string => value.replace(/\|/gu, '\\|');

const compareContent = (left: string | undefined, right: string): boolean =>
	(left ?? '') === right;

const renderMarkdownTable = (
	headers: readonly string[],
	rows: readonly (readonly string[])[],
): string => {
	const head = `| ${headers.join(' | ')} |`;
	const separator = `| ${headers.map(() => '---').join(' | ')} |`;
	const body = rows.map((row) => `| ${row.join(' | ')} |`).join('\n');
	return [head, separator, body].filter((part) => part.length > 0).join('\n');
};

const injectGeneratedBlock = (
	text: string,
	startMarker: string,
	endMarker: string,
	body: string,
): string => {
	const start = text.indexOf(startMarker);
	const end = text.indexOf(endMarker);
	if (start === -1 || end === -1 || end < start) {
		throw new Error(`missing generated markers: ${startMarker}`);
	}
	const before = text.slice(0, start + startMarker.length);
	const after = text.slice(end);
	return `${before}\n${body}\n${after}`;
};

const dedupeIndexEntries = (
	entries: readonly IPluginRegistryEntry[],
): readonly IPluginRegistryEntry[] => {
	const byId = new Map<string, IPluginRegistryEntry>();
	for (const entry of entries) {
		byId.set(entry.id, entry);
	}
	return [...byId.values()].sort((left, right) =>
		left.id.localeCompare(right.id),
	);
};

const buildMigratedManifestMap = (
	manifests: readonly ILoadedPluginManifest[],
): ReadonlyMap<string, ILoadedPluginManifest> =>
	new Map(manifests.map((entry) => [entry.id, entry] as const));

const buildPackageMap = (
	packages: readonly IPluginPackageRecord[],
): ReadonlyMap<string, IPluginPackageRecord> =>
	new Map(packages.map((entry) => [entry.id, entry] as const));

export const buildCatalogEntries = (
	entries: readonly IPluginRegistryEntry[],
	packages: readonly IPluginPackageRecord[],
	migratedManifests: readonly ILoadedPluginManifest[],
): readonly IPluginCatalogEntry[] => {
	const dedupedEntries = dedupeIndexEntries(entries);
	const packageById = buildPackageMap(packages);
	const manifestById = buildMigratedManifestMap(migratedManifests);
	const presetMembership = new Map(
		PRESET_KIND.map(
			(presetId) => [presetId, resolvePresetMembers(presetId)] as const,
		),
	);
	return dedupedEntries.map((entry) => {
		const pkg = packageById.get(entry.id);
		if (pkg === undefined) {
			throw new Error(`missing package.json for plugin ${entry.id}`);
		}
		if (pkg.packageName.length > 0 && pkg.packageName !== entry.package) {
			throw new Error(
				`package mismatch for ${entry.id}: index=${entry.package} package.json=${pkg.packageName}`,
			);
		}
		const migrated = manifestById.get(entry.id);
		return {
			id: entry.id,
			path: `plugins/${entry.id}`,
			package: entry.package,
			version: pkg.version,
			summary: migrated?.manifest.summary ?? entry.summary,
			summarySource: migrated === undefined ? 'index' : 'manifest',
			defaultPreset: entry.defaultPreset ?? 'none',
			presetMembership: PRESET_KIND.filter((presetId) =>
				(presetMembership.get(presetId) ?? []).includes(entry.id),
			),
			capabilities: migrated?.manifest.capabilities ?? [],
			capabilitySource:
				migrated === undefined ? 'index-only' : 'manifest',
			permissions:
				migrated?.manifest.permissions ?? entry.permissions ?? [],
			tags: migrated?.manifest.tags ?? entry.tags,
		};
	});
};

export const renderReadmePluginTable = (
	entries: readonly IPluginCatalogEntry[],
): string =>
	renderMarkdownTable(
		['Path', 'Package', 'What'],
		entries.map((entry) => [
			escapeCell(`\`plugins/${entry.id}\``),
			escapeCell(`\`${entry.package}\``),
			escapeCell(entry.summary),
		]),
	);

export const renderCatalogMarkdown = (
	entries: readonly IPluginCatalogEntry[],
): string => {
	const versionRows = entries.map((entry) => [
		`\`${entry.id}\``,
		`\`${entry.package}\``,
		entry.version,
		entry.summarySource,
	]);
	const presetRows = entries.map((entry) => [
		`\`${entry.id}\``,
		entry.defaultPreset,
		entry.presetMembership.length === 0
			? 'none'
			: entry.presetMembership.join(', '),
	]);
	const capabilityRows = entries.map((entry) => [
		`\`${entry.id}\``,
		entry.capabilitySource,
		entry.capabilities.length === 0
			? 'not declared (index-only)'
			: entry.capabilities.join(', '),
	]);
	return [
		'<!-- Auto-generated by bun tools/scripts/docs/generate-catalog.script.ts -->',
		'',
		'# First-party plugin catalog',
		'',
		'Generated from live registry entries, workspace packages, and migrated plugin manifests where available.',
		'',
		'## Plugin inventory',
		'',
		renderMarkdownTable(
			['id', 'package', 'summary', 'summarySource'],
			entries.map((entry) => [
				`\`${entry.id}\``,
				`\`${entry.package}\``,
				escapeCell(entry.summary),
				entry.summarySource,
			]),
		),
		'',
		'## Versions',
		'',
		renderMarkdownTable(
			['id', 'package', 'version', 'summarySource'],
			versionRows,
		),
		'',
		'## Presets',
		'',
		renderMarkdownTable(['id', 'defaultPreset', 'memberOf'], presetRows),
		'',
		'## Capabilities',
		'',
		renderMarkdownTable(['id', 'source', 'capabilities'], capabilityRows),
		'',
	].join('\n');
};

const buildOutputs = (
	readme: string,
	entries: readonly IPluginCatalogEntry[],
): Readonly<Record<string, string>> => ({
	[README_PATH]: injectGeneratedBlock(
		readme,
		README_PLUGIN_TABLE_START,
		README_PLUGIN_TABLE_END,
		renderReadmePluginTable(entries),
	),
	[GENERATED_CATALOG_PATH]: `${renderCatalogMarkdown(entries)}\n`,
});

export const runCatalogGenerator = async (
	args: readonly string[],
	io: ICatalogIo = defaultIo(),
): Promise<{
	readonly exitCode: number;
	readonly result?: ICatalogGeneratorResult;
}> => {
	const check = args.includes('--check');
	const rootArg = args.find((arg) => arg.startsWith('--root='));
	const root = resolve(rootArg?.slice('--root='.length) ?? process.cwd());
	try {
		const readmePath = resolve(root, README_PATH);
		const readme = (await io.readText(readmePath)) ?? '';
		const packages = await discoverPluginPackages(root, io);
		const manifests = await loadPluginManifests(root, io);
		const entries = buildCatalogEntries(
			FIRST_PARTY_PLUGIN_INDEX.entries,
			packages,
			manifests,
		);
		const outputs = buildOutputs(readme, entries);
		let changed = false;
		for (const [relPath, text] of Object.entries(outputs)) {
			const absPath = resolve(root, relPath);
			const current = await io.readText(absPath);
			if (!compareContent(current, text)) {
				changed = true;
				if (check) {
					io.error(`stale: ${relative(root, absPath)}`);
					continue;
				}
				await io.ensureDir(dirname(absPath));
				await io.writeText(absPath, text);
				io.info(`wrote ${relative(root, absPath)}`);
			}
		}
		return {
			exitCode: check && changed ? 1 : 0,
			result: { entries, outputs, changed },
		};
	} catch (error) {
		io.error(
			`generate-catalog failed: ${error instanceof Error ? error.message : String(error)}`,
		);
		return { exitCode: 2 };
	}
};

if (import.meta.main) {
	const result = await runCatalogGenerator(process.argv.slice(2));
	process.exit(result.exitCode);
}
