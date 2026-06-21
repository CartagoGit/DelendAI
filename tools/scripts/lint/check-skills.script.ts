#!/usr/bin/env bun
/**
 * check-skills.script.ts — fail CI if a `skills/<name>/SKILL.md` exists on
 * disk without a matching entry in `skills/manifest.json` (or vice versa:
 * a manifest entry pointing at a `bodyPath` that doesn't exist). This is
 * the version-pinning contract from f00029 S1: every skill the repo ships
 * must declare a semver `version` + `minCoreVersion` so downstream
 * consumers that pin a specific `@mcp-vertex/core` version can resolve a
 * matching skill bundle instead of silently getting "whatever git HEAD
 * has today".
 */
import { readFile, readdir, stat } from 'node:fs/promises';
import { join, resolve } from 'node:path';

export interface ISkillManifestEntry {
	readonly id: string;
	readonly version: string;
	readonly minCoreVersion: string;
	readonly bodyPath: string;
	readonly tags: readonly string[];
}

export interface ISkillManifest {
	readonly generatedAt: string;
	readonly skills: readonly ISkillManifestEntry[];
}

export interface ICheckSkillsIssue {
	readonly kind:
		| 'missing-on-disk'
		| 'missing-in-manifest'
		| 'malformed-entry';
	readonly detail: string;
}

const SEMVER_RE = /^\d+\.\d+\.\d+$/;

/** Discover every `skills/<name>/SKILL.md` (one level of nesting) under `skillsDirAbs`. */
const discoverSkillDirs = async (skillsDirAbs: string): Promise<string[]> => {
	const entries = await readdir(skillsDirAbs).catch(() => []);
	const found: string[] = [];
	for (const entry of entries) {
		const dirAbs = join(skillsDirAbs, entry);
		const st = await stat(dirAbs).catch(() => undefined);
		if (st?.isDirectory() !== true) continue;
		const skillFile = join(dirAbs, 'SKILL.md');
		if (await stat(skillFile).catch(() => undefined)) {
			found.push(`skills/${entry}/SKILL.md`);
		}
	}
	return found.sort((a, b) => a.localeCompare(b));
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
	}

	for (const bodyPath of bodyPathsOnDisk) {
		if (!inManifest.has(bodyPath)) {
			issues.push({
				kind: 'missing-in-manifest',
				detail: `${bodyPath} exists on disk but has no entry in skills/manifest.json`,
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
	const skillsDirAbs = join(root, 'skills');
	const manifestPath = join(skillsDirAbs, 'manifest.json');

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

		const onDisk = await discoverSkillDirs(skillsDirAbs);
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
