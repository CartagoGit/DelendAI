#!/usr/bin/env bun
import { dirname, join, relative, resolve } from 'node:path';
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

import {
	discoverPluginManifests,
	parsePluginManifest,
	PRESET_KIND,
	resolvePresetMembers,
	resolveTokenBudget,
	type IPluginConfigExample,
	type IPluginManifest,
	type IMcpPlugin,
	type IPluginRegistryEntry,
	type PermissionCategory,
} from '@delendai/core/public';

export const GENERATED_FIRST_PARTY_INDEX_PATH =
	'packages/core/src/lib/registry/generated/first-party-manifest-entries.generated.ts';
export const GENERATED_WEB_CATALOG_PATH =
	'apps/web/src/generated/plugin-manifest-catalog.generated.ts';
export const GENERATED_WEB_DATA_CATALOG_PATH =
	'apps/web/src/data/plugins/catalog.generated.ts';
export const GENERATED_DOCS_MARKDOWN_PATH =
	'docs/delendai/generated/plugin-manifests.generated.md';
export const GENERATED_DOCS_JSON_PATH =
	'docs/delendai/generated/plugin-manifests.generated.json';
export const GENERATED_PLUGIN_DOCS_DIR = 'docs/delendai/plugins/auto-generated';
export const PLUGIN_DOC_NOTES_DIR = 'docs/delendai/plugins/notes';
export const GENERATED_PERMISSION_MATRIX_PATH =
	'docs/delendai/security/permission-matrix.md';

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
	readonly plugin?: Pick<IMcpPlugin, 'example' | 'configExample'> | undefined;
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
		readonly toolPermissions?:
			| Readonly<Record<string, readonly PermissionCategory[]>>
			| undefined;
	}[];
	readonly compatibilityMatrix: readonly ICompatibilityRow[];
}

type WebCatalogCategory =
	| 'workflow'
	| 'quality'
	| 'code-intelligence'
	| 'knowledge'
	| 'observability'
	| 'integration';

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
	text
		.replace(/"generatedAt": "[^"]+"/gu, '"generatedAt": "<normalized>"')
		.replace(/^generated: .+$/gmu, 'generated: <normalized>');

const normalizeJsonArtifact = (text: string): string => {
	const parsed = JSON.parse(text) as Record<string, unknown>;
	if ('generatedAt' in parsed) {
		parsed.generatedAt = '<normalized>';
	}
	return JSON.stringify(parsed);
};

const GENERATED_TS_EXPORT_PATTERN =
	/export const \w+ =\s*([\s\S]+?)\s+as const;\s*$/u;

const normalizeGeneratedTsArtifact = (text: string): string => {
	const match = GENERATED_TS_EXPORT_PATTERN.exec(text);
	if (match?.[1] === undefined) {
		throw new Error(
			'generated TypeScript artifact does not match expected export shape',
		);
	}
	const value = Function(`return (${match[1]});`)() as unknown;
	return JSON.stringify(value);
};

const compareContent = (
	relPath: string,
	left: string | undefined,
	right: string,
): boolean => {
	try {
		if (relPath === GENERATED_DOCS_JSON_PATH) {
			return (
				normalizeJsonArtifact(left ?? '{}') ===
				normalizeJsonArtifact(right)
			);
		}
		if (relPath === GENERATED_WEB_CATALOG_PATH) {
			return (
				normalizeGeneratedTsArtifact(left ?? '') ===
				normalizeGeneratedTsArtifact(right)
			);
		}
	} catch {
		// Fall back to byte-oriented comparison when semantic normalization fails.
	}
	return stripGeneratedAt(left ?? '') === stripGeneratedAt(right);
};

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

const pluginFromModule = (
	module: Record<string, unknown>,
): Pick<IMcpPlugin, 'example' | 'configExample'> | undefined => {
	if (module === undefined) {
		return undefined;
	}
	const candidate = module.default;
	if (candidate === null || typeof candidate !== 'object') {
		return undefined;
	}
	const plugin = candidate as Partial<IMcpPlugin>;
	if (typeof plugin.name !== 'string') {
		return undefined;
	}
	return {
		...(plugin.example === undefined ? {} : { example: plugin.example }),
		...(plugin.configExample === undefined
			? {}
			: { configExample: plugin.configExample }),
	};
};

const resolveExample = (
	plugin: Pick<IMcpPlugin, 'example' | 'configExample'> | undefined,
): Readonly<Record<string, unknown>> | undefined => {
	if (plugin?.example !== undefined) {
		return plugin.example;
	}
	const configExample = plugin?.configExample as
		| IPluginConfigExample
		| undefined;
	if (configExample?.example !== undefined) {
		return configExample.example;
	}
	return configExample?.options;
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

export const loadPluginManifests = async (
	root: string,
	io: Pick<IGeneratorIo, 'readText'> = defaultIo(),
): Promise<readonly ILoadedPluginManifest[]> => {
	const packages = await discoverPluginPackages(root, io);
	const packageById = new Map(packages.map((pkg) => [pkg.id, pkg] as const));
	const manifestPaths = await discoverPluginManifests(root);
	const loaded: ILoadedPluginManifest[] = [];
	for (const absPath of manifestPaths) {
		const relPath = relative(root, absPath).replaceAll('\\', '/');
		const pluginId = relPath.split('/')[1] ?? '';
		const pkg = packageById.get(pluginId);
		if (pkg === undefined) {
			throw new Error(`manifest ${relPath} has no matching package.json`);
		}
		const mod = (await import(
			`${pathToFileURL(absPath).href}?t=${Date.now()}`
		)) as Record<string, unknown>;
		// The runtime `IMcpPlugin` import (used to surface `example` /
		// `configExample` in the generated registry) is best-effort:
		// the manifest is the source of truth and a plugin may not
		// ship a runtime entry in the first-party registry fixture
		// during tests. Failures fall back to `plugin: undefined`,
		// which keeps the build deterministic without coupling the
		// generator to each plugin's runtime surface.
		const pluginIndexPath = resolve(
			root,
			'plugins',
			pluginId,
			'src',
			'index.ts',
		);
		let pluginMod: Record<string, unknown> | undefined;
		try {
			pluginMod = (await import(
				`${pathToFileURL(pluginIndexPath).href}?t=${Date.now()}`
			)) as Record<string, unknown>;
		} catch {
			pluginMod = undefined;
		}
		loaded.push({
			...pkg,
			manifest: manifestFromModule(mod),
			plugin: pluginFromModule(pluginMod ?? {}),
		});
	}
	return loaded.sort((left, right) => left.id.localeCompare(right.id));
};

export const buildGeneratedFirstPartyEntries = (
	manifests: readonly ILoadedPluginManifest[],
): readonly IPluginRegistryEntry[] =>
	manifests.map(({ manifest, plugin }) => {
		const tb = manifest.tokenBudget;
		// f00179 S2: prefer the new shape's `staticBytes`; fall back to
		// the legacy `warning` ceiling. A bare number is the
		// `staticBytes` itself.
		const tokenBudgetBytes =
			typeof tb === 'number'
				? tb
				: 'caps' in tb
					? tb.staticBytes
					: tb.warning;
		return {
			origin: 'first-party',
			id: manifest.id,
			package: manifest.package,
			summary: manifest.summary,
			tags: [...manifest.tags],
			permissions: [...manifest.permissions],
			tokenBudgetBytes,
			...(manifest.startupActivation === undefined
				? {}
				: { startupActivation: manifest.startupActivation }),
			...(manifest.configDocs === undefined
				? {}
				: { configDocs: manifest.configDocs }),
			...(resolveExample(plugin) === undefined
				? {}
				: { example: resolveExample(plugin) }),
			...(manifest.toolPermissions === undefined
				? {}
				: { toolPermissions: manifest.toolPermissions }),
		};
	});

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
	webCatalog: manifests
		.filter(({ manifest }) => manifest.visibility === 'public')
		.map(({ manifest }) => {
			const tb = resolveTokenBudget(manifest.tokenBudget, '2026-08-30');
			return {
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
					warning: tb.caps.warning,
					hard: tb.caps.hard,
					releaseRelativePercent: 20,
				},
			};
		}),
	tokenBudgets: manifests.map(({ manifest }) => {
		const tb = resolveTokenBudget(manifest.tokenBudget, '2026-08-30');
		return {
			id: manifest.id,
			warning: tb.caps.warning,
			hard: tb.caps.hard,
			releaseRelativePercent: 20,
		};
	}),
	permissionsTable: manifests.map(({ manifest }) => ({
		id: manifest.id,
		permissions: [...manifest.permissions],
		...(manifest.toolPermissions === undefined
			? {}
			: { toolPermissions: { ...manifest.toolPermissions } }),
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
	if (entry.tokenBudgetBytes !== undefined) {
		lines.push(
			`\t\t\ttokenBudgetBytes: ${entry.tokenBudgetBytes.toString()},`,
		);
	}
	if (entry.startupActivation === true) {
		lines.push('\t\t\tstartupActivation: true,');
	}
	if (entry.configDocs !== undefined) {
		lines.push(
			`\t\t\tconfigDocs: ${JSON.stringify(entry.configDocs, null, '\t').replaceAll('\n', '\n\t\t\t')},`,
		);
	}
	if (entry.example !== undefined) {
		lines.push(
			`\t\t\texample: ${JSON.stringify(entry.example, null, '\t').replaceAll('\n', '\n\t\t\t')},`,
		);
	}
	if (entry.toolPermissions !== undefined) {
		const entries = Object.entries(entry.toolPermissions)
			.map(
				([tool, perms]) =>
					`${quote(tool)}: [${perms.map(quote).join(', ')}]`,
			)
			.join(', ');
		lines.push(`\t\t\ttoolPermissions: { ${entries} },`);
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

const titleCase = (value: string): string =>
	value
		.split(/[-_]/u)
		.filter((segment) => segment.length > 0)
		.map((segment) => segment[0]!.toUpperCase() + segment.slice(1))
		.join(' ');

const TAG_CATEGORY_MAP: Readonly<Record<string, WebCatalogCategory>> = {
	workflow: 'workflow',
	proposals: 'workflow',
	swarm: 'workflow',
	notification: 'workflow',
	status: 'workflow',
	quality: 'quality',
	rules: 'quality',
	tests: 'quality',
	convention: 'quality',
	security: 'quality',
	'tech-debt': 'quality',
	search: 'code-intelligence',
	refactor: 'code-intelligence',
	git: 'code-intelligence',
	api: 'integration',
	browser: 'integration',
	forge: 'integration',
	issues: 'integration',
	container: 'integration',
	database: 'integration',
	web: 'integration',
	docs: 'knowledge',
	memory: 'knowledge',
	prompts: 'knowledge',
	skills: 'knowledge',
	logs: 'observability',
	observability: 'observability',
	perf: 'observability',
	usage: 'observability',
	cache: 'observability',
};

const resolveWebCatalogCategory = (
	tags: readonly string[],
	permissions: readonly PermissionCategory[],
): WebCatalogCategory => {
	for (const tag of tags) {
		const mapped = TAG_CATEGORY_MAP[tag];
		if (mapped !== undefined) return mapped;
	}
	if (
		permissions.includes('network') ||
		permissions.includes('browser') ||
		permissions.includes('container') ||
		permissions.includes('database') ||
		permissions.includes('forge-read') ||
		permissions.includes('forge-write')
	) {
		return 'integration';
	}
	if (permissions.includes('filesystem-write')) return 'workflow';
	return 'code-intelligence';
};

const renderWebDataCatalogTs = (artifact: IPluginManifestArtifact): string => {
	const entries = artifact.webCatalog.map((entry) => ({
		slug: entry.id,
		displayName: titleCase(entry.id),
		purpose: entry.summary,
		category: resolveWebCatalogCategory(entry.tags, entry.permissions),
	}));
	return [
		'export const GENERATED_WEB_PLUGIN_CATALOG =',
		`${JSON.stringify(entries, null, '\t')} as const;`,
		'',
	].join('\n');
};

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
		entry.toolPermissions === undefined
			? ''
			: Object.entries(entry.toolPermissions)
					.map(([tool, perms]) => `${tool}: ${perms.join(', ')}`)
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
		'# Plugin manifests',
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

/**
 * Reads the optional hand-written notes file for a plugin (d00014).
 *
 * `docs/delendai/plugins/notes/<id>.notes.md` is the ONE place a
 * human/agent may write prose about a plugin that the manifest cannot
 * derive (design decisions, use cases, operational caveats). It has no
 * drift check of its own (it is prose), but it has exactly one location
 * per plugin, and its content is folded into the auto-generated page
 * instead of living as a second, undriftchecked page.
 */
const loadPluginNotes = async (
	manifestId: string,
	root: string,
	io: IGeneratorIo,
): Promise<string | undefined> => {
	const text = await io.readText(
		resolve(root, PLUGIN_DOC_NOTES_DIR, `${manifestId}.notes.md`),
	);
	return text === undefined ? undefined : text.trim();
};

const renderPluginDocMarkdown = (
	manifest: IPluginManifest,
	generatedAt: string,
	notes?: string,
): string =>
	[
		'---',
		`id: ${manifest.id}`,
		`package: ${manifest.package}`,
		`version: ${manifest.version}`,
		`maturity: ${manifest.maturity}`,
		`generated: ${generatedAt}`,
		'---',
		'',
		`# ${titleCase(manifest.id)}`,
		'',
		'> Auto-generated. Do not edit. Regenerate with bun run generate:from-manifests.',
		'',
		'## Summary',
		'',
		manifest.summary,
		'',
		'## Tags',
		'',
		manifest.tags.length === 0
			? '- none'
			: manifest.tags.map((tag) => `- ${tag}`).join('\n'),
		'',
		'## Presets',
		'',
		manifest.presets.length === 0
			? '- none'
			: manifest.presets.map((preset) => `- ${preset}`).join('\n'),
		'',
		'## Permissions',
		'',
		manifest.permissions.length === 0
			? '- none'
			: manifest.permissions
					.map((permission) => `- ${permission}`)
					.join('\n'),
		'',
		'## Dependencies',
		'',
		manifest.dependencies.length === 0
			? '- none'
			: manifest.dependencies
					.map((dependency) => `- ${dependency}`)
					.join('\n'),
		'',
		'## Capabilities',
		'',
		manifest.capabilities.length === 0
			? '- none'
			: manifest.capabilities
					.map((capability) => `- ${capability}`)
					.join('\n'),
		'',
		...(notes === undefined || notes.length === 0
			? []
			: ['## Notes', '', notes, '']),
	].join('\n');

const renderPermissionMatrixMarkdown = (
	artifact: IPluginManifestArtifact,
): string => {
	const rows = artifact.manifests.flatMap((manifest) => {
		const perTool = manifest.toolPermissions;
		if (perTool !== undefined && Object.keys(perTool).length > 0) {
			return Object.entries(perTool).map(([tool, perms]) => [
				manifest.id,
				manifest.visibility,
				tool,
				perms.join(', '),
			]);
		}
		return [
			[
				manifest.id,
				manifest.visibility,
				'*',
				manifest.permissions.join(', '),
			],
		];
	});
	return [
		'# Permission Matrix',
		'',
		renderMarkdownTable(
			['Plugin', 'Visibility', 'Tool', 'Permissions'],
			rows,
		),
		'',
	].join('\n');
};

const resolveGeneratedAt = (io: IGeneratorIo): string =>
	io.fixedGeneratedAt ?? new Date().toISOString();

const buildOutputs = (
	artifact: IPluginManifestArtifact,
	notesById: Readonly<Record<string, string | undefined>> = {},
): Readonly<Record<string, string>> => ({
	[GENERATED_FIRST_PARTY_INDEX_PATH]: renderRegistryTs(
		artifact.firstPartyEntries,
	),
	[GENERATED_WEB_CATALOG_PATH]: renderWebCatalogTs(artifact),
	[GENERATED_WEB_DATA_CATALOG_PATH]: renderWebDataCatalogTs(artifact),
	[GENERATED_DOCS_MARKDOWN_PATH]: renderDocsMarkdown(artifact),
	[GENERATED_DOCS_JSON_PATH]: `${JSON.stringify(artifact, null, '\t')}\n`,
	[GENERATED_PERMISSION_MATRIX_PATH]:
		renderPermissionMatrixMarkdown(artifact),
	...Object.fromEntries(
		artifact.manifests.map((manifest) => [
			`${GENERATED_PLUGIN_DOCS_DIR}/${manifest.id}.md`,
			renderPluginDocMarkdown(
				manifest,
				artifact.generatedAt,
				notesById[manifest.id],
			),
		]),
	),
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
		const manifests = await loadPluginManifests(root, io);
		const artifact = buildManifestArtifact(manifests, generatedAt);
		const notesById = Object.fromEntries(
			await Promise.all(
				artifact.manifests.map(async (manifest) => [
					manifest.id,
					await loadPluginNotes(manifest.id, root, io),
				]),
			),
		) as Readonly<Record<string, string | undefined>>;
		const outputs = buildOutputs(artifact, notesById);
		let changed = false;
		for (const [relPath, text] of Object.entries(outputs)) {
			const absPath = resolve(root, relPath);
			const current = await io.readText(absPath);
			if (!compareContent(relPath, current, text)) {
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
