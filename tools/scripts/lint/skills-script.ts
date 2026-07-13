#!/usr/bin/env bun
/**
 * skills-script.ts — validate the composed skill manifest.
 *
 * Checks two invariants directly against packages/core/skills/manifest.json:
 * - every bodyPath resolves on disk
 * - every manifest id is unique
 */
import { readFile, stat } from 'node:fs/promises';
import { join, resolve } from 'node:path';

export interface ISkillManifestEntry {
	readonly id: string;
	readonly bodyPath: string;
}

export interface ISkillManifest {
	readonly skills: readonly ISkillManifestEntry[];
}

export interface ISkillIssue {
	readonly kind: 'missing-on-disk' | 'duplicate-id' | 'frontmatter-id-drift';
	readonly detail: string;
}

const REPO_ROOT = resolve(import.meta.dirname, '..', '..', '..');
const MANIFEST_PATH = join(REPO_ROOT, 'packages/core/skills/manifest.json');

export const lintSkillsManifest = async (
	manifestPath: string = MANIFEST_PATH,
	rootDir: string = REPO_ROOT,
): Promise<readonly ISkillIssue[]> => {
	const manifest = JSON.parse(
		await readFile(manifestPath, 'utf8'),
	) as ISkillManifest;
	const issues: ISkillIssue[] = [];
	const seenIds = new Set<string>();
	const duplicateIds = new Set<string>();

	for (const skill of manifest.skills) {
		if (!seenIds.has(skill.id)) {
			seenIds.add(skill.id);
		} else if (!duplicateIds.has(skill.id)) {
			duplicateIds.add(skill.id);
			issues.push({
				kind: 'duplicate-id',
				detail: `"${skill.id}" appears more than once in ${manifestPath}`,
			});
		}

		const bodyPath = join(rootDir, skill.bodyPath);
		if (!(await stat(bodyPath).catch(() => null))) {
			issues.push({
				kind: 'missing-on-disk',
				detail: `"${skill.id}" declares bodyPath "${skill.bodyPath}" but the file does not exist`,
			});
			continue;
		}
		const body = await readFile(bodyPath, 'utf8');
		const declaredName =
			/^---\s*$[\s\S]*?^name:\s*['"]?([^'"\n]+)['"]?\s*$/m
				.exec(body)?.[1]
				?.trim();
		if (declaredName !== skill.id) {
			issues.push({
				kind: 'frontmatter-id-drift',
				detail: `"${skill.id}" points to ${skill.bodyPath}, whose frontmatter name is ${JSON.stringify(declaredName)}`,
			});
		}
	}

	return issues;
};

export const main = async (): Promise<number> => {
	try {
		const issues = await lintSkillsManifest();
		if (issues.length === 0) {
			console.log(
				'✓ skills-script: manifest ids, body paths and frontmatter names agree.',
			);
			return 0;
		}

		console.error(`✖ skills-script: ${issues.length} issue(s):`);
		for (const issue of issues) {
			console.error(`  [${issue.kind}] ${issue.detail}`);
		}
		return 1;
	} catch (error) {
		console.error(
			`✖ skills-script: cannot read ${MANIFEST_PATH}: ${String(error)}`,
		);
		return 1;
	}
};

if (import.meta.main) {
	process.exit(await main());
}
