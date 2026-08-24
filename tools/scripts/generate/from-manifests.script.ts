#!/usr/bin/env bun
import { dirname, join, relative, resolve } from 'node:path';
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

import {
	parsePluginManifest,
	PRESET_KIND,
	resolvePresetMembers,
	type IPluginManifest,
	type IPluginRegistryEntry,
	type IToolPermissionGrant,
	type PermissionCategory,
} from '@mcp-vertex/core/public';

export const MIGRATED_PLUGIN_IDS = [
	'adaptive-optimizer',
	'context-for-change',
	'impact-analysis',
	'project-health',
	'quality-policy',
	'search',
] as const;
export const MIGRATED_MANIFEST_PATHS = [
	'plugins/adaptive-optimizer/plugin.manifest.ts',
	'plugins/context-for-change/plugin.manifest.ts',
	'plugins/impact-analysis/plugin.manifest.ts',
	'plugins/project-health/plugin.manifest.ts',
	'plugins/quality-policy/plugin.manifest.ts',
	'plugins/search/plugin.manifest.ts',
] as const;

export const GENERATED_FIRST_PARTY_INDEX_PATH =
	'packages/core/src/lib/registry/generated/first-party-manifest-entries.generated.ts';
export const GENERATED_WEB_CATALOG_PATH =
	'apps/web/src/generated/plugin-manifest-catalog.generated.ts';
export const GENERATED_DOCS_MARKDOWN_PATH =
	'docs/mcp-vertex/generated/plugin-manifests.generated.md';
export const GENERATED_DOCS_JSON_PATH =
	'docs/mcp-vertex/generated/plugin-manifests.generated.json';

type PresetId = (typeof PRESET_KIND)[number];

export interface IPluginPackageRecord {
	readonly id: string;
	readonly dir: string;
	readonly manifestPath: string;
	readonly packagePath: string;
	readonly packageName: string;
	readonly version: string;
	readonly private: boolean;
}

export interface ILoadedPluginManifest extends IPluginPackageRecord {
	readonly manifest: IPluginManifest;
}

export interface ICompatibilityRow {
	readonly pluginId: string;
	readonly presetId: PresetId;
	readonly declared: boolean;
	readonly catalogMember: boolean;
	readonly matches: boolean;
}

export interface IPluginManifestArtifact {
	readonly generatedAt: string;
	readonly manifests: readonly IPluginManifest[];
	readonly firstPartyEntries: readonly IPluginRegistryEntry[];
	readonly webCatalog: readonly {
		readonly id: string;
		readonly package: string;
		readonly summary: string;
		readonly tags: readonly string[];
		readonly maturity: string;
		readonly visibility: string;
		readonly presets: readonly string[];
		readonly capabilities: readonly string[];
		readonly permissions: readonly PermissionCategory[];
		readonly tokenBudget: {
			readonly warning: number;
			readonly hard: number;
			readonly releaseRelativePercent: number;
		};
	}[];
	readonly tokenBudgets: readonly {
		readonly id: string;
		readonly warning: number;
		readonly hard: number;
		readonly releaseRelativePercent: number;
	}[];
	readonly permissionsTable: readonly {
		readonly id: string;
		readonly permissions: readonly PermissionCategory[];
		readonly toolPermissions?: readonly IToolPermissionGrant[] | undefined;
	}[];
	readonly compatibilityMatrix: readonly ICompatibilityRow[];
}

export interface IGeneratorIo {
	readonly readText: (absPath: string) => Promise<string | undefined>;
	readonly writeText: (absPath: string, text: string) => Promise<void>;
	readonly ensureDir: (absPath: string) => Promise<void>;
	readonly info: (message: string) => void;
	readonly error: (message: string) => void;
	readonly fixedGeneratedAt?: string;
}

export interface IGeneratorResult {
	readonly artifact: IPluginManifestArtifact;
	readonly outputs: Readonly<Record<string, string>>;
	readonly changed: boolean;
	readonly generatedAt: string;
}

const defaultIo = (): IGeneratorIo => ({
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

const stripGeneratedAt = (text: string): string =>
	text.replace(/"generatedAt": "[^"]+"/gu, '"generatedAt": "<normalized>"');

const compareContent = (left: string | undefined, right: string): boolean =>
	stripGeneratedAt(left ?? '') === stripGeneratedAt(right);

const manifestFromModule = (
	module: Record<string, unknown>,
): IPluginManifest => {
	for (const value of Object.values(module)) {
		try {
			return parsePluginManifest(value);
		} catch {}
	}
	throw new Error('module does not export a valid plugin manifest');
};

export const discoverPluginPackages = async (
	root: string,
	io: Pick<IGeneratorIo, 'readText'> = defaultIo(),
): Promise<readonly IPluginPackageRecord[]> => {
	const pluginsDir = resolve(root, 'plugins');
	const dirs = (await readdir(pluginsDir, { withFileTypes: true }))
		.filter((entry) => entry.isDirectory())
		.map((entry) => entry.name)
		.sort();
	const records: IPluginPackageRecord[] = [];
	for (const id of dirs) {
		const packagePath = join(pluginsDir, id, 'package.json');
		const raw = await io.readText(packagePath);
		if (raw === undefined) continue;
		const pkg = JSON.parse(raw) as {
			name?: string;
			version?: string;
			private?: boolean;
		};
		records.push({
			id,
			dir: `plugins/${id}`,
			manifestPath: `plugins/${id}/plugin.manifest.ts`,
			packagePath: `plugins/${id}/package.json`,
			packageName: pkg.name ?? '',
			version: pkg.version ?? '',
			private: pkg.private === true,
		});
	}
	return records;
};

export const loadMigratedPluginManifests = async (
	root: string,
	io: Pick<IGeneratorIo, 'readText'> = defaultIo(),
): Promise<readonly ILoadedPluginManifest[]> => {
	const packages = await discoverPluginPackages(root, io);
	const packageById = new Map(packages.map((pkg) => [pkg.id, pkg] as const));
	const loaded: ILoadedPluginManifest[] = [];
	for (const relPath of MIGRATED_MANIFEST_PATHS) {
		const absPath = resolve(root, relPath);
		const pluginId = relPath.split('/')[1] ?? '';
		const pkg = packageById.get(pluginId);
		if (pkg === undefined) {
			throw new Error(`manifest ${relPath} has no matching package.json`);
		}
		const mod = (await import(
			`${pathToFileURL(absPath).href}?t=${Date.now()}`
		)) as Record<string, unknown>;
		loaded.push({
			...pkg,
			manifest: manifestFromModule(mod),
		});
	}
	return loaded;
};

export const buildGeneratedFirstPartyEntries = (
	manifests: readonly ILoadedPluginManifest[],
): readonly IPluginRegistryEntry[] =>
	manifests.map(({ manifest }) => ({
		origin: 'first-party',
		id: manifest.id,
		package: manifest.package,
		summary: manifest.summary,
		tags: [...manifest.tags],
		permissions: [...manifest.permissions],
	}));

export const buildCompatibilityMatrix = (
	manifests: readonly ILoadedPluginManifest[],
): readonly ICompatibilityRow[] => {
	const rows: ICompatibilityRow[] = [];
	for (const { manifest } of manifests) {
		const declared = new Set(manifest.presets);
		for (const presetId of PRESET_KIND) {
			const catalogMember = resolvePresetMembers(presetId).includes(
				manifest.id,
			);
			rows.push({
				pluginId: manifest.id,
				presetId,
				declared: declared.has(presetId),
				catalogMember,
				matches: declared.has(presetId) === catalogMember,
			});
		}
	}
	return rows;
};

export const buildManifestArtifact = (
	manifests: readonly ILoadedPluginManifest[],
	generatedAt: string,
): IPluginManifestArtifact => ({
	generatedAt,
	manifests: manifests.map(({ manifest }) => manifest),
	firstPartyEntries: buildGeneratedFirstPartyEntries(manifests),
	webCatalog: manifests.map(({ manifest }) => ({
		id: manifest.id,
		package: manifest.package,
		summary: manifest.summary,
		tags: [...manifest.tags],
		maturity: manifest.maturity,
		visibility: manifest.visibility,
		presets: [...manifest.presets],
		capabilities: [...manifest.capabilities],
		permissions: [...manifest.permissions],
		tokenBudget: {
			warning: manifest.tokenBudget.warning,
			hard: manifest.tokenBudget.hard,
			releaseRelativePercent: manifest.tokenBudget.releaseRelativePercent,
		},
	})),
	tokenBudgets: manifests.map(({ manifest }) => ({
		id: manifest.id,
		warning: manifest.tokenBudget.warning,
		hard: manifest.tokenBudget.hard,
		releaseRelativePercent: manifest.tokenBudget.releaseRelativePercent,
	})),
	permissionsTable: manifests.map(({ manifest }) => ({
		id: manifest.id,
		permissions: [...manifest.permissions],
		...(manifest.toolPermissions === undefined
			? {}
			: { toolPermissions: [...manifest.toolPermissions] }),
	})),
	compatibilityMatrix: buildCompatibilityMatrix(manifests),
});

const quote = (value: string): string => `'${value.replace(/'/gu, "\\'")}'`;

const renderRegistryEntry = (entry: IPluginRegistryEntry): string => {
	const lines = [
		'\t\t{',
		`\t\t\torigin: ${quote(entry.origin)},`,
		`\t\t\tid: ${quote(entry.id)},`,
		`\t\t\tpackage: ${quote(entry.package)},`,
		`\t\t\tsummary: ${quote(entry.summary)},`,
		`\t\t\ttags: [${entry.tags.map(quote).join(', ')}],`,
	];
	if (entry.permissions !== undefined) {
		lines.push(
			`\t\t\tpermissions: [${entry.permissions.map(quote).join(', ')}],`,
		);
	}
	if (entry.defaultPreset !== undefined) {
		lines.push(`\t\t\tdefaultPreset: ${quote(entry.defaultPreset)},`);
	}
	lines.push('\t\t}');
	return lines.join('\n');
};

const renderRegistryTs = (entries: readonly IPluginRegistryEntry[]): string =>
	[
		"import type { IPluginRegistryEntry } from '../../contracts/interfaces/plugin-registry.interface';",
		'',
		'export const GENERATED_FIRST_PARTY_MANIFEST_ENTRIES: readonly IPluginRegistryEntry[] =',
		'\t[',
		entries.map(renderRegistryEntry).join(',\n'),
		'\t];',
		'',
	].join('\n');

const renderWebCatalogTs = (artifact: IPluginManifestArtifact): string =>
	[
		'export const GENERATED_PLUGIN_MANIFEST_WEB_CATALOG =',
		`${JSON.stringify(artifact.webCatalog, null, '\t')} as const;`,
		'',
	].join('\n');

const renderMarkdownTable = (
	headers: readonly string[],
	rows: readonly (readonly string[])[],
): string => {
	const head = `| ${headers.join(' | ')} |`;
	const sep = `| ${headers.map(() => '---').join(' | ')} |`;
	const body = rows.map((row) => `| ${row.join(' | ')} |`).join('\n');
	return [head, sep, body].filter((part) => part.length > 0).join('\n');
};

const renderDocsMarkdown = (artifact: IPluginManifestArtifact): string => {
	const pluginRows = artifact.webCatalog.map((entry) => [
		entry.id,
		entry.package,
		entry.visibility,
		entry.maturity,
		entry.presets.join(', '),
	]);
	const tokenRows = artifact.tokenBudgets.map((entry) => [
		entry.id,
		String(entry.warning),
		String(entry.hard),
		String(entry.releaseRelativePercent),
	]);
	const permissionRows = artifact.permissionsTable.map((entry) => [
		entry.id,
		entry.permissions.join(', '),
		(entry.toolPermissions ?? [])
			.map((grant) => `${grant.tool}: ${grant.permissions.join(', ')}`)
			.join('; '),
	]);
	const compatibilityRows = artifact.compatibilityMatrix.map((entry) => [
		entry.pluginId,
		entry.presetId,
		entry.declared ? 'yes' : 'no',
		entry.catalogMember ? 'yes' : 'no',
		entry.matches ? 'yes' : 'no',
	]);
	return [
		'<!-- Auto-generated by bun tools/scripts/generate/from-manifests.script.ts -->',
		'',
		'# Plugin manifests (migrated subset)',
		'',
		renderMarkdownTable(
			['id', 'package', 'visibility', 'maturity', 'presets'],
			pluginRows,
		),
		'',
		'## Token budgets',
		'',
		renderMarkdownTable(
			['id', 'warning', 'hard', 'releaseRelativePercent'],
			tokenRows,
		),
		'',
		'## Permissions',
		'',
		renderMarkdownTable(
			['id', 'permissions', 'toolPermissions'],
			permissionRows,
		),
		'',
		'## Compatibility matrix',
		'',
		renderMarkdownTable(
			['plugin', 'preset', 'declared', 'catalog', 'matches'],
			compatibilityRows,
		),
		'',
	].join('\n');
};

const resolveGeneratedAt = (io: IGeneratorIo): string =>
	io.fixedGeneratedAt ?? new Date().toISOString();

const buildOutputs = (
	artifact: IPluginManifestArtifact,
): Readonly<Record<string, string>> => ({
	[GENERATED_FIRST_PARTY_INDEX_PATH]: renderRegistryTs(
		artifact.firstPartyEntries,
	),
	[GENERATED_WEB_CATALOG_PATH]: renderWebCatalogTs(artifact),
	[GENERATED_DOCS_MARKDOWN_PATH]: renderDocsMarkdown(artifact),
	[GENERATED_DOCS_JSON_PATH]: `${JSON.stringify(artifact, null, '\t')}\n`,
});

export const runFromManifestsGenerator = async (
	args: readonly string[],
	io: IGeneratorIo = defaultIo(),
): Promise<{
	readonly exitCode: number;
	readonly result?: IGeneratorResult;
}> => {
	const check = args.includes('--check');
	const rootArg = args.find((arg) => arg.startsWith('--root='));
	const root = resolve(rootArg?.slice('--root='.length) ?? process.cwd());
	try {
		const generatedAt = resolveGeneratedAt(io);
		const manifests = await loadMigratedPluginManifests(root, io);
		const artifact = buildManifestArtifact(manifests, generatedAt);
		const outputs = buildOutputs(artifact);
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
			result: { artifact, outputs, changed, generatedAt },
		};
	} catch (error) {
		io.error(
			`from-manifests failed: ${error instanceof Error ? error.message : String(error)}`,
		);
		return { exitCode: 2 };
	}
};

if (import.meta.main) {
	const result = await runFromManifestsGenerator(process.argv.slice(2));
	process.exit(result.exitCode);
}
