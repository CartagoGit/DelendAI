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
} from '@mcp-vertex/core/public';
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

export const buildManagedLazyCatalogSource = async (): Promise<string> => {
	const root = repoRoot();
	const configPath = join(root, 'mcp-vertex.config.json');
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
		.map((entry) => [entry.plugin.name, entry.registrations] as const)
		.sort(([a], [b]) => a.localeCompare(b));
	const source = [
		'/**',
		' * managed-lazy-catalog.generated.ts — GENERATED, do not edit by hand.',
		' *',
		' * Regenerate: bun tools/scripts/generate/managed-lazy-catalog.script.ts',
		' * The source is the eager assembled plugin registration catalog; the',
		' * runtime consumes this compact index without importing every plugin.',
		' */',
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
		"\tmetadata: Pick<IManagedLazyPluginCatalogEntry, 'summary' | 'tags' | 'startupActivation'> = {},",
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
		...entries.flatMap(([id, registrations]) => {
			const metadata = packageById.get(id);
			const metadataLiteral =
				metadata === undefined
					? '{}'
					: `{ summary: ${quote(metadata.summary)}, tags: ${renderTools(metadata.tags)}${metadata.startupActivation === true ? ', startupActivation: true' : ''} }`;
			return [
				`\t\ttools(${quote(id)}, ${quote(metadata?.package ?? `@mcp-vertex/${id}`)}, ${renderTools((registrations.tools ?? []).map((tool) => tool.id))}, ${renderTools((registrations.prompts ?? []).map((prompt) => prompt.id))}, ${renderTools((registrations.resources ?? []).map((resource) => resource.id))}, ${renderTools((registrations.knowledge ?? []).map((entry) => entry.id))}, ${renderTools((registrations.skills ?? []).map((skill) => skill.id))}, ${renderTools(assembled.loadResult.loaded.find((entry) => entry.plugin.name === id)?.plugin.dependsOn ?? [])}, ${metadataLiteral}),`,
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
