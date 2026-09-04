/**
 * Project-owned projection of the portable core skills.
 *
 * The core package publishes its transversal skill bodies under `skills/`.
 * `init` copies those bodies into the consumer's configured docs directory so
 * the running server can load them through its legacy/project manifest fallback
 * even when the consumer is not the delendai monorepo.
 */
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

interface ICoreSkillManifestEntry {
	readonly id: string;
	readonly version: string;
	readonly minCoreVersion: string;
	readonly summary?: string;
	readonly bodyPath: string;
	readonly tags: readonly string[];
	readonly appliesTo?: readonly string[];
}

interface ICoreSkillManifest {
	readonly generatedAt: string;
	readonly skills: readonly ICoreSkillManifestEntry[];
}

export interface ICoreSkillProjection {
	readonly relPath: string;
	readonly content: string;
}

const CORE_BODY_PREFIX = 'packages/core/skills/';

/** Resolve the published package's portable core-skill directory. */
export const resolveCoreSkillsRoot = (): string => {
	const entry = fileURLToPath(import.meta.resolve('@delendai/core'));
	return join(dirname(entry), '..', 'skills');
};

const isCoreBody = (entry: ICoreSkillManifestEntry): boolean =>
	entry.bodyPath.startsWith(CORE_BODY_PREFIX);

/**
 * Read the published core skill bundle and turn it into files relative to a
 * consumer workspace. Plugin-owned skills stay with their plugin packages and
 * remain available through the MCP catalog; this projection is deliberately
 * limited to the portable core bundle.
 */
export const buildCoreSkillProjection = async (
	docsDir: string,
	options: { readonly sourceRoot?: string } = {},
): Promise<readonly ICoreSkillProjection[]> => {
	const sourceRoot = options.sourceRoot ?? resolveCoreSkillsRoot();
	const manifestPath = join(sourceRoot, 'manifest.json');
	if (!existsSync(manifestPath)) return [];
	const manifest = JSON.parse(
		await readFile(manifestPath, 'utf8'),
	) as ICoreSkillManifest;
	if (!Array.isArray(manifest.skills)) return [];

	const entries = manifest.skills.filter(isCoreBody);
	const projected: ICoreSkillProjection[] = [];
	const projectedManifest = {
		generatedAt: manifest.generatedAt,
		skills: entries.map((entry) => ({
			id: entry.id,
			version: entry.version,
			minCoreVersion: entry.minCoreVersion,
			summary: entry.summary,
			bodyPath: `${docsDir}/skills/${entry.id}/SKILL.md`,
			tags: entry.tags,
			appliesTo: entry.appliesTo ?? ['@delendai/*'],
		})),
	};
	projected.push({
		relPath: `${docsDir}/skills/manifest.json`,
		content: `${JSON.stringify(projectedManifest, null, '\t')}\n`,
	});
	for (const entry of entries) {
		const relativeBody = entry.bodyPath.slice(CORE_BODY_PREFIX.length);
		projected.push({
			relPath: `${docsDir}/skills/${entry.id}/SKILL.md`,
			content: await readFile(join(sourceRoot, relativeBody), 'utf8'),
		});
	}
	return projected;
};
