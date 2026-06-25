#!/usr/bin/env bun
/**
 * check-skills.script.ts — fail CI if an owner skill (`<owner>/skills/<name>/
 * SKILL.md`, where owner is `packages/core` or `plugins/<plugin>`, resolved
 * through `@mcp-vertex/core`'s `skill-paths.ts`) exists on disk without a
 * matching entry in the composed manifest (`packages/core/skills/
 * manifest.json`), or vice versa (a manifest entry pointing at a `bodyPath`
 * that doesn't exist). This is the version-pinning contract from f00029 S1:
 * every skill the repo ships must declare a semver `version` + `minCoreVersion`
 * so downstream consumers that pin a specific `@mcp-vertex/core` version can
 * resolve a matching skill bundle instead of silently getting "whatever git
 * HEAD has today".
 */
import { readFile, readdir, stat } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { SKILL_MANIFEST_REL, skillOwnerRoots } from '@mcp-vertex/core/public';

export interface ISkillManifestEntry {
	readonly id: string;
	readonly version: string;
	readonly minCoreVersion: string;
	readonly bodyPath: string;
	readonly tags: readonly string[];
	/**
	 * Plugin namespaces this skill applies to. Either a concrete plugin
	 * id (e.g. `@mcp-vertex/proposals`) or the wildcard `@mcp-vertex/*`
	 * for transversal skills. Enforced by `check-skills` (f00057 S5)
	 * so downstream catalogs (f00056) can resolve skills per plugin
	 * without parsing bodies.
	 */
	readonly appliesTo: readonly string[];
}

export interface ISkillManifest {
	readonly generatedAt: string;
	readonly skills: readonly ISkillManifestEntry[];
}

export interface ICheckSkillsIssue {
	readonly kind:
		| 'missing-on-disk'
		| 'missing-in-manifest'
		| 'malformed-entry'
		| 'missing-applies-to'
		| 'unknown-applies-to-target';
	readonly detail: string;
}

const SEMVER_RE = /^\d+\.\d+\.\d+$/;

/** Discover every `<skillsRel>/<name>/SKILL.md` (one level of nesting) under `skillsDirAbs`. */
const discoverSkillDirs = async (
	skillsDirAbs: string,
	skillsRel: string,
): Promise<string[]> => {
	const entries = await readdir(skillsDirAbs).catch(() => []);
	const found: string[] = [];
	for (const entry of entries) {
		const dirAbs = join(skillsDirAbs, entry);
		const st = await stat(dirAbs).catch(() => undefined);
		if (st?.isDirectory() !== true) continue;
		const skillFile = join(dirAbs, 'SKILL.md');
		if (await stat(skillFile).catch(() => undefined)) {
			found.push(`${skillsRel}/${entry}/SKILL.md`);
		}
	}
	return found.sort((a, b) => a.localeCompare(b));
};

/** Plugin directory names present in the workspace (each may own a `skills/` root). */
const discoverPluginNames = async (root: string): Promise<string[]> => {
	const entries = await readdir(join(root, 'plugins')).catch(() => []);
	const names: string[] = [];
	for (const entry of entries) {
		const st = await stat(join(root, 'plugins', entry)).catch(
			() => undefined,
		);
		if (st?.isDirectory() === true) names.push(entry);
	}
	return names.sort((a, b) => a.localeCompare(b));
};

/**
 * Cross-check the manifest against the SKILL.md files actually on disk.
 * Pure over its inputs (no process.exit) so it is unit-testable with
 * fixtures instead of a real filesystem tree.
 */
export const checkSkillsManifest = (
	manifest: ISkillManifest,
	bodyPathsOnDisk: readonly string[],
): readonly ICheckSkillsIssue[] => {
	const issues: ICheckSkillsIssue[] = [];
	const onDisk = new Set(bodyPathsOnDisk);
	const inManifest = new Set(manifest.skills.map((s) => s.bodyPath));

	for (const skill of manifest.skills) {
		if (!SEMVER_RE.test(skill.version)) {
			issues.push({
				kind: 'malformed-entry',
				detail: `"${skill.id}": version "${skill.version}" is not semver x.y.z`,
			});
		}
		if (!SEMVER_RE.test(skill.minCoreVersion)) {
			issues.push({
				kind: 'malformed-entry',
				detail: `"${skill.id}": minCoreVersion "${skill.minCoreVersion}" is not semver x.y.z`,
			});
		}
		if (!onDisk.has(skill.bodyPath)) {
			issues.push({
				kind: 'missing-on-disk',
				detail: `"${skill.id}" declares bodyPath "${skill.bodyPath}" but the file does not exist`,
			});
		}
		if (!Array.isArray(skill.appliesTo) || skill.appliesTo.length === 0) {
			issues.push({
				kind: 'missing-applies-to',
				detail: `"${skill.id}" declares no appliesTo (use ["@mcp-vertex/*"] for transversal skills or ["@mcp-vertex/<plugin>"] for plugin-specific ones)`,
			});
		}
	}

	for (const bodyPath of bodyPathsOnDisk) {
		if (!inManifest.has(bodyPath)) {
			issues.push({
				kind: 'missing-in-manifest',
				detail: `${bodyPath} exists on disk but has no entry in ${SKILL_MANIFEST_REL}`,
			});
		}
	}

	return issues;
};

const isMainModule = (): boolean => {
	const entry = process.argv[1];
	return entry !== undefined && import.meta.url === `file://${entry}`;
};

if (isMainModule()) {
	const root = resolve(import.meta.dirname, '..', '..', '..');
	const manifestPath = join(root, ...SKILL_MANIFEST_REL.split('/'));

	void (async () => {
		let manifest: ISkillManifest;
		try {
			manifest = JSON.parse(
				await readFile(manifestPath, 'utf8'),
			) as ISkillManifest;
		} catch (err) {
			console.error(
				`✖ check-skills: cannot read ${manifestPath}: ${String(err)}`,
			);
			process.exit(1);
			return;
		}

		const pluginNames = await discoverPluginNames(root);
		const roots = skillOwnerRoots(pluginNames);
		const discovered = await Promise.all(
			roots.map((rel) =>
				discoverSkillDirs(join(root, ...rel.split('/')), rel),
			),
		);
		const onDisk = discovered.flat().sort((a, b) => a.localeCompare(b));
		const issues = checkSkillsManifest(manifest, onDisk);

		if (issues.length > 0) {
			console.error(`✖ check-skills: ${issues.length} issue(s):`);
			for (const issue of issues)
				console.error(`  [${issue.kind}] ${issue.detail}`);
			process.exit(1);
			return;
		}
		console.log(
			`✓ check-skills: ${manifest.skills.length} skill(s) match the manifest.`,
		);
	})();
}
