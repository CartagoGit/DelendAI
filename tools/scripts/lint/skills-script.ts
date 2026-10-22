#!/usr/bin/env bun
/**
 * skills-script.ts — validate the composed skill manifest.
 *
 * Checks two invariants directly against packages/core/skills/manifest.json:
 * - every bodyPath resolves on disk
 * - every manifest id is unique
 */
import { readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';

import { extractSkillToolRefs } from '@delendai/core/cli';
import { parseCliArgs } from '@delendai/core/plugin';
import { assembleCliConfig } from '@delendai/core/public';

export interface ISkillManifestEntry {
	readonly id: string;
	readonly bodyPath: string;
}

export interface ISkillManifest {
	readonly skills: readonly ISkillManifestEntry[];
}

export interface ISkillIssue {
	readonly kind:
		| 'missing-on-disk'
		| 'duplicate-id'
		| 'frontmatter-id-drift'
		| 'unregistered-tool';
	readonly detail: string;
}

const REPO_ROOT = resolve(import.meta.dirname, '..', '..', '..');
const TOOL_OUTPUTS_PATH = join(
	REPO_ROOT,
	'packages/core/src/generated/tool-outputs.ts',
);
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
		// Read once and let the read itself answer "is it there?". The
		// `stat`-then-read it replaced asked twice and believed the first
		// answer, which in a tree several agents write is a gate that
		// fails on a file somebody else was finishing.
		const body = await readFile(bodyPath, 'utf8').catch(() => null);
		if (body === null) {
			issues.push({
				kind: 'missing-on-disk',
				detail: `"${skill.id}" declares bodyPath "${skill.bodyPath}" but the file does not exist`,
			});
			continue;
		}
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

/**
 * A skill that names a tool no plugin registers points an agent at
 * nothing. Reads each manifest body and reports every named tool that is
 * missing from `registeredTools`.
 */
export const lintSkillTools = async (
	registeredTools: ReadonlySet<string>,
	manifestPath: string = MANIFEST_PATH,
	rootDir: string = REPO_ROOT,
): Promise<readonly ISkillIssue[]> => {
	const manifest = JSON.parse(
		await readFile(manifestPath, 'utf8'),
	) as ISkillManifest;
	const issues: ISkillIssue[] = [];
	for (const skill of manifest.skills) {
		const body = await readFile(
			join(rootDir, skill.bodyPath),
			'utf8',
		).catch(() => '');
		for (const tool of extractSkillToolRefs(body).tools) {
			if (registeredTools.has(tool)) continue;
			issues.push({
				kind: 'unregistered-tool',
				detail: `"${skill.id}" names tool "${tool}", which no plugin registers`,
			});
		}
	}
	return issues;
};

/**
 * Every tool a plugin registers: the ones the swarm preset loads live,
 * plus the generated output map, which also lists the plugins that preset
 * leaves out.
 */
const loadRegisteredToolNames = async (): Promise<ReadonlySet<string>> => {
	const { agentCatalogTools } = await assembleCliConfig(
		parseCliArgs(['--preset=swarm'], REPO_ROOT),
		{ readFile: (path) => readFile(path, 'utf8').catch(() => undefined) },
	);
	const generated = await readFile(TOOL_OUTPUTS_PATH, 'utf8');
	return new Set([
		...agentCatalogTools.map((tool) => tool.name),
		...[...generated.matchAll(/^\t"([a-z0-9_]+)":/gmu)].map(
			(match) => match[1] ?? '',
		),
	]);
};

export const main = async (): Promise<number> => {
	try {
		const issues = [
			...(await lintSkillsManifest()),
			...(await lintSkillTools(await loadRegisteredToolNames())),
		];
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
