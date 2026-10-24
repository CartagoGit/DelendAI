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

/** Can we copy this body? A physical fact about what ships in core. */
const isCoreBody = (entry: ICoreSkillManifestEntry): boolean =>
	entry.bodyPath.startsWith(CORE_BODY_PREFIX);

/**
 * Scopes an adopter has by virtue of adopting delendai at all.
 *
 * `@delendai/*` is "every consumer"; `@delendai/core` is "anyone who
 * installed the core". A skill scoped to one package — `@delendai/audit`,
 * `@delendai/web` — is about that package, and shipping it to a project
 * that does not have it is noise at best.
 */
const ADOPTER_SCOPES = new Set(['@delendai/*', '@delendai/core']);

/**
 * Should we copy it? Answered by what the skill DECLARES, not by where its
 * file happens to sit.
 *
 * Selection used to be `isCoreBody` alone, so every skill whose body lived
 * under `packages/core/skills/` was installed into every adopter —
 * including `delendai-tabs-component`, whose body documents
 * `apps/web/src/components/ui/Tabs.astro`, this repository's own website.
 * Its `appliesTo` said `@delendai/*` and nothing consulted it; the
 * declaration is now both correct and load-bearing.
 *
 * A skill with no declaration is treated as `@delendai/*`, which is what
 * the projected manifest already assumed.
 */
const appliesToAnAdopter = (entry: ICoreSkillManifestEntry): boolean =>
	(entry.appliesTo ?? ['@delendai/*']).some((scope) =>
		ADOPTER_SCOPES.has(scope),
	);

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

	const entries = manifest.skills
		.filter(isCoreBody)
		.filter(appliesToAnAdopter);
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
