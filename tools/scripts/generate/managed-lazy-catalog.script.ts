#!/usr/bin/env bun
/**
 * managed-lazy-catalog.script.ts — emits the compact managed tool index.
 *
 * The lazy runtime must know tool ownership without importing every plugin.
 * This artifact is therefore generated from the same eager assembly that
 * remains the authoritative plugin registration contract. Generation forces
 * the measurement config to `loading: eager`; it never changes the checked-in
 * runtime configuration.
 *
 * Usage:
 *   bun tools/scripts/generate/managed-lazy-catalog.script.ts
 *   bun tools/scripts/generate/managed-lazy-catalog.script.ts --check
 */
import { readFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';

import {
	assembleCliConfig,
	FIRST_PARTY_PLUGIN_INDEX,
	parseCliArgs,
	writeFileAtomic,
} from '@delendai/core/public';
import { extractRequirements } from '@delendai/env/public';

import { repoRoot } from '../lib/monorepo-paths';

export const GENERATED_MANAGED_LAZY_CATALOG_PATH =
	'packages/core/src/lib/plugins/managed-lazy-catalog.generated.ts';

const quote = (value: string): string => `'${value.replaceAll("'", "\\'")}'`;

const readOrUndefined = async (path: string): Promise<string | undefined> => {
	try {
		return await readFile(path, 'utf8');
	} catch (error) {
		if (
			error &&
			typeof error === 'object' &&
			'code' in error &&
			error.code === 'ENOENT'
		)
			return undefined;
		throw error;
	}
};

const renderTools = (ids: readonly string[]): string => {
	const inline = `[${ids.map(quote).join(', ')}]`;
	if (inline.length <= 70) return inline;
	return ['[', ...ids.map((id) => `\t\t${quote(id)},`), '\t]'].join('\n');
};

/**
 * The `env:VAR` requirements a plugin's options schema declares, as a
 * catalog metadata field — or nothing when it declares none.
 *
 * WHY here: `init` needs these to warn about missing variables, and it
 * used to import every enabled plugin's runtime to read them — 37 module
 * graphs for a list that is almost always empty (v00137). This generator
 * already imports every plugin, so it reads the schema once, with the
 * same `extractRequirements` the runtime path uses, and the answer ships
 * in the catalog.
 */
const renderEnvironmentRequirements = (
	id: string,
	optionsSchema: unknown,
): readonly string[] => {
	if (optionsSchema === undefined) return [];
	const requirements = extractRequirements(id, optionsSchema as never);
	if (requirements.length === 0) return [];
	const rendered = requirements.map((requirement) =>
		[
			`var: ${quote(requirement.var)}`,
			`plugin: ${quote(requirement.plugin)}`,
			`capability: ${quote(requirement.capability)}`,
			...(requirement.provider === undefined
				? []
				: [`provider: ${quote(requirement.provider)}`]),
			`required: ${String(requirement.required)}`,
		].join(', '),
	);
	return [
		`environmentRequirements: [${rendered.map((fields) => `{ ${fields} }`).join(', ')}]`,
	];
};

export const buildManagedLazyCatalogSource = async (): Promise<string> => {
	const root = repoRoot();
	const configPath = join(root, 'delendai.config.json');
	const rawConfig = await readFile(configPath, 'utf8');
	const parsedConfig = JSON.parse(rawConfig) as Record<string, unknown>;
	const managedSurface =
		parsedConfig.managedSurface &&
		typeof parsedConfig.managedSurface === 'object'
			? (parsedConfig.managedSurface as Record<string, unknown>)
			: {};
	const eagerConfig = JSON.stringify({
		...parsedConfig,
		managedSurface: { ...managedSurface, loading: 'eager' },
	});
	const args = parseCliArgs([`--preset=full`, `--workspace=${root}`], root);
	const assembled = await assembleCliConfig(args, {
		readFile: async (absolutePath) =>
			absolutePath === configPath
				? eagerConfig
				: readOrUndefined(absolutePath),
	});
	if (assembled.loadResult.errors.length > 0) {
		throw new Error(
			`cannot generate managed lazy catalog with plugin errors: ${assembled.loadResult.errors.map((error) => error.message).join('; ')}`,
		);
	}

	const packageById = new Map(
		FIRST_PARTY_PLUGIN_INDEX.entries.map((entry) => [entry.id, entry]),
	);
	const entries = assembled.loadResult.loaded
		.map(
			(entry) =>
				[entry.plugin.name, entry.registrations, entry.plugin] as const,
		)
		.sort(([a], [b]) => a.localeCompare(b));
	const source = [
		'/**',
		' * managed-lazy-catalog.generated.ts — GENERATED, do not edit by hand.',
		' *',
		' * Regenerate: bun tools/scripts/generate/managed-lazy-catalog.script.ts',
		' * The source is the eager assembled plugin registration catalog; the',
		' * runtime consumes this compact index without importing every plugin.',
		' */',
		"import type { IToolDisclosureLevel } from '../contracts/interfaces/tool-surface.interface';",
		'',
		'export interface IManagedLazyPluginCatalogEntry {',
		'\treadonly id: string;',
		'\treadonly packageSpecifier: string;',
		'\treadonly toolIds: readonly string[];',
		'\treadonly promptIds: readonly string[];',
		'\treadonly resourceIds: readonly string[];',
		'\treadonly knowledgeIds: readonly string[];',
		'\treadonly skillIds: readonly string[];',
		'\treadonly dependencies: readonly string[];',
		'\treadonly summary?: string | undefined;',
		'\treadonly tags?: readonly string[] | undefined;',
		'\treadonly startupActivation?: boolean | undefined;',
		'\treadonly toolDisclosure?: Readonly<Record<string, IToolDisclosureLevel>> | undefined;',
		'\t/**',
		'\t * The environment variables the plugin declares in its options schema',
		'\t * (`env:VAR` markers), read at generation time so `init` can warn about',
		'\t * them without importing the plugin. Absent when it declares none.',
		'\t */',
		'\treadonly environmentRequirements?: readonly {',
		'\t\treadonly var: string;',
		'\t\treadonly plugin: string;',
		'\t\treadonly capability: string;',
		'\t\treadonly provider?: string;',
		'\t\treadonly required: boolean;',
		'\t}[] | undefined;',
		'}',
		'',
		'const tools = (',
		'\tid: string,',
		'\tpackageSpecifier: string,',
		'\ttoolIds: readonly string[],',
		'\tpromptIds: readonly string[],',
		'\tresourceIds: readonly string[],',
		'\tknowledgeIds: readonly string[],',
		'\tskillIds: readonly string[],',
		'\tdependencies: readonly string[],',
		"\tmetadata: Pick<IManagedLazyPluginCatalogEntry, 'summary' | 'tags' | 'startupActivation' | 'toolDisclosure' | 'environmentRequirements'> = {},",
		'): IManagedLazyPluginCatalogEntry => ({',
		'\tid,',
		'\tpackageSpecifier,',
		'\t...metadata,',
		'\ttoolIds,',
		'\tpromptIds,',
		'\tresourceIds,',
		'\tknowledgeIds,',
		'\tskillIds,',
		'\tdependencies,',
		'});',
		'',
		'export const MANAGED_LAZY_PLUGIN_CATALOG: readonly IManagedLazyPluginCatalogEntry[] =',
		'\t[',
		...entries.flatMap(([id, registrations, plugin]) => {
			const metadata = packageById.get(id);
			const disclosureEntries = (registrations.tools ?? []).flatMap(
				(tool) =>
					tool.disclosure === undefined
						? []
						: [`${quote(tool.id)}: ${quote(tool.disclosure)}`],
			);
			const metadataFields = [
				...(metadata === undefined
					? []
					: [
							`summary: ${quote(metadata.summary)}`,
							`tags: ${renderTools(metadata.tags)}`,
							...(metadata.startupActivation === true
								? ['startupActivation: true']
								: []),
						]),
				...(disclosureEntries.length === 0
					? []
					: [`toolDisclosure: { ${disclosureEntries.join(', ')} }`]),
				...renderEnvironmentRequirements(id, plugin.optionsSchema),
			];
			const metadataLiteral = `{ ${metadataFields.join(', ')} }`;
			return [
				`\t\ttools(${quote(id)}, ${quote(metadata?.package ?? `@delendai/${id}`)}, ${renderTools((registrations.tools ?? []).map((tool) => tool.id))}, ${renderTools((registrations.prompts ?? []).map((prompt) => prompt.id))}, ${renderTools((registrations.resources ?? []).map((resource) => resource.id))}, ${renderTools((registrations.knowledge ?? []).map((entry) => entry.id))}, ${renderTools((registrations.skills ?? []).map((skill) => skill.id))}, ${renderTools(assembled.loadResult.loaded.find((entry) => entry.plugin.name === id)?.plugin.dependsOn ?? [])}, ${metadataLiteral}),`,
			];
		}),
		'\t];',
		'',
		'export const MANAGED_LAZY_PLUGIN_BY_ID = new Map(',
		'\tMANAGED_LAZY_PLUGIN_CATALOG.map((entry) => [entry.id, entry] as const),',
		');',
		'',
	].join('\n');
	return execFileSync(
		'bunx',
		[
			'biome',
			'format',
			'--stdin-file-path',
			GENERATED_MANAGED_LAZY_CATALOG_PATH,
		],
		{ input: source, encoding: 'utf8' },
	);
};

const main = async (): Promise<number> => {
	const outputPath = join(repoRoot(), GENERATED_MANAGED_LAZY_CATALOG_PATH);
	const source = await buildManagedLazyCatalogSource();
	const existing = await readOrUndefined(outputPath);
	if (process.argv.includes('--check')) {
		if (existing !== source) {
			console.error(
				`managed-lazy-catalog: drift detected. Run bun tools/scripts/generate/managed-lazy-catalog.script.ts and commit ${GENERATED_MANAGED_LAZY_CATALOG_PATH}.`,
			);
			return 1;
		}
		console.log('managed-lazy-catalog: up to date.');
		return 0;
	}
	await writeFileAtomic(outputPath, source);
	console.log(`wrote ${outputPath}`);
	return 0;
};

if (import.meta.main) process.exit(await main());
