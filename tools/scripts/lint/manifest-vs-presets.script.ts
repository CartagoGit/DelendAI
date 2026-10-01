#!/usr/bin/env bun
import {
	loadAllPluginManifests,
	PRESET_KIND,
	resolvePresetMembers,
	validatePluginManifest,
} from '@delendai/core/public';

import { repoRoot } from '../lib/monorepo-paths';

interface IViolation {
	readonly plugin: string;
	readonly rule: string;
	readonly message: string;
}

export const lintManifestVsPresets = async (
	root = repoRoot(),
): Promise<readonly IViolation[]> => {
	const manifests = (await loadAllPluginManifests(root)).map(
		validatePluginManifest,
	);
	const knownPresets = new Set<string>(PRESET_KIND);
	const presetMembership = new Map<string, Set<string>>();
	for (const preset of PRESET_KIND) {
		presetMembership.set(preset, new Set(resolvePresetMembers(preset)));
	}
	const violations: IViolation[] = [];
	for (const manifest of manifests) {
		for (const preset of manifest.presets) {
			if (!knownPresets.has(preset)) {
				violations.push({
					plugin: manifest.id,
					rule: 'MANIFEST-PRESET-001',
					message: `manifest.presets declares unknown preset ${JSON.stringify(preset)}.`,
				});
				continue;
			}
			if (!presetMembership.get(preset)?.has(manifest.id)) {
				violations.push({
					plugin: manifest.id,
					rule: 'MANIFEST-PRESET-002',
					message: `manifest.presets includes ${JSON.stringify(preset)} but PRESET_CATALOG does not resolve ${JSON.stringify(manifest.id)} there.`,
				});
			}
		}
		for (const preset of PRESET_KIND) {
			if (
				presetMembership.get(preset)?.has(manifest.id) === true &&
				!manifest.presets.includes(preset)
			) {
				violations.push({
					plugin: manifest.id,
					rule: 'MANIFEST-PRESET-003',
					message: `PRESET_CATALOG resolves ${JSON.stringify(manifest.id)} in ${JSON.stringify(preset)} but manifest.presets does not list it.`,
				});
			}
		}
		// f00177 (MAN-001): a `private` (unpublished) plugin can never
		// legitimately be a member of ANY preset — installing that preset
		// outside this monorepo would reference a package that cannot
		// resolve. Root-cause fix, enforced going forward.
		if (manifest.visibility === 'private' && manifest.presets.length > 0) {
			violations.push({
				plugin: manifest.id,
				rule: 'MANIFEST-PRESET-004',
				message: `manifest.visibility is "private" but manifest.presets is non-empty (${JSON.stringify(manifest.presets)}); a private/unpublished plugin cannot be a preset member.`,
			});
		}
	}
	return violations;
};

const main = async (): Promise<number> => {
	const violations = await lintManifestVsPresets();
	if (violations.length === 0) {
		console.log('[manifest-vs-presets] OK.');
		return 0;
	}
	console.error('[manifest-vs-presets] Violations found:');
	for (const violation of violations) {
		console.error(
			`  ${violation.plugin}: [${violation.rule}] ${violation.message}`,
		);
	}
	return 1;
};

if (import.meta.main) {
	process.exit(await main());
}
