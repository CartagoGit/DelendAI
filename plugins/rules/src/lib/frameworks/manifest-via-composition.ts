import type { IFileReader } from '@mcp-vertex/core/public';

import type { ICompositionRoot } from './registry';
import type { IAreaRules, IRulesManifest, IRulesMode } from './types';

/**
 * Single Responsibility: this file is the *only* place that
 * knows how to project a composition root (`registry` +
 * `detector`) into the legacy `IRulesManifest` shape that
 * `get_rules` / `check_rules` / `apply_rules` still return.
 *
 * Dependency Inversion: the manifest writer depends on the
 * *interface* `ICompositionRoot` (which exposes `registry`
 * and `detector`), not on the concrete classes. A host that
 * constructs a synthetic composition (e.g. for a polyglot
 * test fixture) can call this function without booting the
 * real registries.
 *
 * The legacy `manifest.ts` (the pre-SOLID `buildRulesManifest`
 * + `ensureRulesCache` pair) is the f00051 S1 migration
 * target. This file is the *reference implementation* of
 * the S1 contract: the migration simply re-implements
 * `buildRulesManifest` as `buildManifestViaComposition`.
 *
 * Open/Closed: the manifest shape (`IRulesManifest` /
 * `IAreaRules`) is the *stable* surface — the legacy and
 * the new writer produce the same output. Consumers of
 * `get_rules` never know which writer built the manifest.
 */

const ESLINT_CONFIG_NAMES = [
	'eslint.config.mjs',
	'eslint.config.js',
	'eslint.config.cjs',
	'eslint.config.ts',
	'eslint.config.mts',
] as const;

const findProjectEslint = (
	reader: IFileReader,
	areaDir: string,
): string | undefined => {
	for (const name of ESLINT_CONFIG_NAMES) {
		const rel =
			areaDir === '' || areaDir === 'root' ? name : `${areaDir}/${name}`;
		if (reader.exists(rel)) return rel;
	}
	return undefined;
};

const findProjectTsconfig = (
	reader: IFileReader,
	areaDir: string,
): string | undefined => {
	const rel =
		areaDir === '' || areaDir === 'root'
			? 'tsconfig.json'
			: `${areaDir}/tsconfig.json`;
	return reader.exists(rel) ? rel : undefined;
};

/**
 * The minimal set of groups we walk to discover project
 * areas. Mirrors the legacy `manifest.ts` constant; the new
 * manifest writer does not branch on it.
 */
const GROUP_DIRS = ['apps', 'libs', 'packages', 'projects'] as const;

const discoverAreas = (reader: IFileReader): readonly string[] => {
	const areas: string[] = [''];
	for (const group of GROUP_DIRS) {
		for (const child of reader.listDir(group)) {
			const dir = `${group}/${child}`;
			if (reader.exists(`${dir}/package.json`)) areas.push(dir);
		}
	}
	return areas;
};

const areaKey = (areaDir: string): string =>
	areaDir === '' ? 'root' : areaDir;

/**
 * Build a `IRulesManifest` from a composition root. Pure
 * (no I/O) — the caller passes the `IFileReader` so the
 * function is testable with a synthetic reader.
 *
 * The shape is **byte-identical** to the legacy
 * `buildRulesManifest`. The only difference is the source
 * of the per-area preset: the new code uses
 * `root.detector.detect(reader, areaDir)` (DIP) instead of
 * the free function `detectPresetForArea(reader, areaDir)`
 * the legacy uses.
 */
export const buildManifestViaComposition = (
	reader: IFileReader,
	projectName: string,
	cacheRelDir: string,
	mode: IRulesMode,
	root: Pick<ICompositionRoot, 'detector' | 'registry'>,
	overrides: Readonly<Record<string, string>> = {},
): IRulesManifest => {
	const areas: Record<string, IAreaRules> = {};
	for (const areaDir of discoverAreas(reader)) {
		const forced = overrides[areaKey(areaDir)];
		const detected = root.detector.detect(reader, areaDir);
		const presetId =
			forced !== undefined && root.registry.supportedIds.includes(forced)
				? forced
				: (detected?.presetId ?? 'vanilla-js');
		const preset = root.registry.resolvePreset(presetId);
		if (preset === undefined) continue;
		const reason =
			forced !== undefined
				? `forced via config (${forced})`
				: (detected?.reason ?? 'no language adapter claimed the area');

		const eslint: string[] = [];
		const projectEslint = findProjectEslint(reader, areaDir);
		if (projectEslint !== undefined) eslint.push(projectEslint);
		eslint.push(`${cacheRelDir}/${preset.linterConfigFile}`);

		const typecheck: string[] = [];
		const projectTsconfig = findProjectTsconfig(reader, areaDir);
		if (projectTsconfig !== undefined) typecheck.push(projectTsconfig);
		if (preset.typecheckConfigFile !== undefined) {
			typecheck.push(`${cacheRelDir}/${preset.typecheckConfigFile}`);
		}

		areas[areaKey(areaDir)] = {
			framework: preset.framework,
			presetId: preset.id,
			eslint,
			typecheck,
			reason,
		};
	}

	// Stable fingerprint (matches the legacy `manifest.ts` shape).
	const shape = `${mode}|${Object.entries(areas)
		.map(([k, v]) => `${k}:${v.presetId}`)
		.sort()
		.join(',')}`;
	let hash = 0;
	for (let i = 0; i < shape.length; i += 1) {
		hash = (hash * 31 + shape.charCodeAt(i)) | 0;
	}
	const fingerprint = `rm-${Math.abs(hash).toString(36)}`;

	return {
		generatedAt: new Date().toISOString(),
		fingerprint,
		mode,
		projects: { [projectName]: areas },
	};
};
