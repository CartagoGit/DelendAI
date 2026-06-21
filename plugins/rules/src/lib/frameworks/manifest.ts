import { readFile } from 'node:fs/promises';
import {
	joinRel,
	withFileMutex,
	writeFileAtomic,
} from '@mcp-vertex/core/public';

import type { IFileReader } from '@mcp-vertex/core/public';

import { detectPresetForArea } from './detect-framework';
import { PRESET_BY_ID, RULE_PRESETS } from './presets';
import type { IAreaRules, IRulesManifest, IRulesMode } from './types';

const ESLINT_CONFIG_NAMES = [
	'eslint.config.mjs',
	'eslint.config.js',
	'eslint.config.cjs',
	'eslint.config.ts',
	'eslint.config.mts',
];

const findProjectEslint = (
	reader: IFileReader,
	areaDir: string,
): string | undefined => {
	for (const name of ESLINT_CONFIG_NAMES) {
		const rel = joinRel(areaDir, name);
		if (reader.exists(rel)) return rel;
	}
	return undefined;
};

const findProjectTsconfig = (
	reader: IFileReader,
	areaDir: string,
): string | undefined => {
	const rel = joinRel(areaDir, 'tsconfig.json');
	return reader.exists(rel) ? rel : undefined;
};

const GROUP_DIRS = ['apps', 'libs', 'packages', 'projects'] as const;

/**
 * Discover the project areas: the root, plus each immediate child of
 * apps/libs/packages/projects that ships a package.json. Each area can
 * carry a different framework (e.g. a Vue app next to a Laravel API).
 */
export const discoverAreas = (reader: IFileReader): readonly string[] => {
	const areas: string[] = [''];
	for (const group of GROUP_DIRS) {
		for (const child of reader.listDir(group)) {
			const dir = `${group}/${child}`;
			if (reader.exists(joinRel(dir, 'package.json'))) areas.push(dir);
		}
	}
	return areas;
};

export interface IBuildManifestOptions {
	readonly reader: IFileReader;
	readonly projectName: string;
	/** Workspace-relative rules cache dir, e.g. `.cache/mcp-vertex/rules`. */
	readonly cacheRelDir: string;
	readonly mode: IRulesMode;
	/** Force a preset id for an area path (overrides detection). */
	readonly overrides?: Readonly<Record<string, string>>;
}

const areaKey = (areaDir: string): string =>
	areaDir === '' ? 'root' : areaDir;

/**
 * Build the rules manifest (pure). For each area: detect the preset (or
 * honour an override), then list eslint/typecheck configs priority-first
 * — the project's own config, then our materialised default behind it.
 */
export const buildRulesManifest = (
	options: IBuildManifestOptions,
): IRulesManifest => {
	const { reader, cacheRelDir } = options;
	const areas: Record<string, IAreaRules> = {};
	for (const areaDir of discoverAreas(reader)) {
		const forced = options.overrides?.[areaKey(areaDir)];
		const detected = detectPresetForArea(reader, areaDir);
		const presetId =
			forced !== undefined && PRESET_BY_ID.has(forced)
				? forced
				: detected.presetId;
		const preset = PRESET_BY_ID.get(presetId);
		if (preset === undefined) continue;
		const reason =
			forced !== undefined
				? `forced via config (${forced})`
				: detected.reason;

		const eslint: string[] = [];
		const projectEslint = findProjectEslint(reader, areaDir);
		if (projectEslint !== undefined) eslint.push(projectEslint);
		eslint.push(joinRel(cacheRelDir, preset.eslintConfigFile));

		const typecheck: string[] = [];
		const projectTsconfig = findProjectTsconfig(reader, areaDir);
		if (projectTsconfig !== undefined) typecheck.push(projectTsconfig);
		if (preset.tsconfigFile !== undefined) {
			typecheck.push(joinRel(cacheRelDir, preset.tsconfigFile));
		}

		areas[areaKey(areaDir)] = {
			framework: preset.framework,
			presetId: preset.id,
			eslint,
			typecheck,
			reason,
		};
	}
	const fingerprint = computeFingerprint(options.mode, areas);
	return {
		generatedAt: new Date().toISOString(),
		fingerprint,
		mode: options.mode,
		projects: { [options.projectName]: areas },
	};
};

/** Stable fingerprint of the resolution (mode + per-area presets). */
const computeFingerprint = (
	mode: string,
	areas: Readonly<Record<string, IAreaRules>>,
): string => {
	const shape = `${mode}|${Object.entries(areas)
		.map(([k, v]) => `${k}:${v.presetId}`)
		.sort()
		.join(',')}`;
	let hash = 0;
	for (let i = 0; i < shape.length; i += 1) {
		hash = (hash * 31 + shape.charCodeAt(i)) | 0;
	}
	return `rm-${Math.abs(hash).toString(36)}`;
};

export interface IEnsureCacheOptions {
	/** Resolve a workspace-relative path to absolute. */
	readonly resolve: (relativePath: string) => string;
	readonly cacheRelDir: string;
	readonly manifest: IRulesManifest;
	readonly manifestRelPath: string;
}

export interface IEnsureCacheResult {
	readonly materialized: readonly string[];
	readonly manifestWritten: boolean;
	readonly manifestPath: string;
}

/**
 * Materialise every default preset (eslint + tsconfig) into the cache,
 * and write the manifest ONLY if it does not already exist (so an agent
 * or human can edit the mapping without it being clobbered on boot).
 *
 * l00008 s2: durable writes go through `writeFileAtomic` (crash-safe:
 * write-temp-then-rename, never a partial file on disk) and the
 * manifest's read-fingerprint-then-maybe-write critical section is
 * wrapped in `withFileMutex` so two hosts booting in parallel against
 * the same workspace cache converge instead of interleaving writes.
 */
export const ensureRulesCache = async (
	options: IEnsureCacheOptions,
): Promise<IEnsureCacheResult> => {
	const materialized: string[] = [];
	for (const preset of RULE_PRESETS) {
		const eslintRel = joinRel(options.cacheRelDir, preset.eslintConfigFile);
		await writeFileAtomic(
			options.resolve(eslintRel),
			preset.eslintConfigContent,
		);
		materialized.push(eslintRel);
		if (preset.tsconfigFile !== undefined && preset.tsconfigContent) {
			const tsRel = joinRel(options.cacheRelDir, preset.tsconfigFile);
			await writeFileAtomic(
				options.resolve(tsRel),
				preset.tsconfigContent,
			);
			materialized.push(tsRel);
		}
	}
	// Regenerate the manifest when absent OR when its fingerprint drifts
	// (mode/overrides/detected presets changed). A matching fingerprint is
	// left untouched so human edits to the mapping survive.
	const manifestAbs = options.resolve(options.manifestRelPath);
	const manifestWritten = await withFileMutex(manifestAbs, async () => {
		let existingFingerprint: string | undefined;
		try {
			existingFingerprint = (
				JSON.parse(await readFile(manifestAbs, 'utf8')) as {
					fingerprint?: string;
				}
			).fingerprint;
		} catch {
			existingFingerprint = undefined; // missing/corrupt → regenerate
		}
		if (existingFingerprint === options.manifest.fingerprint) return false;
		await writeFileAtomic(
			manifestAbs,
			`${JSON.stringify(options.manifest, null, '\t')}\n`,
		);
		return true;
	});
	return {
		materialized,
		manifestWritten,
		manifestPath: options.manifestRelPath,
	};
};
