/**
 * assemble-skills.ts — r00009: the skills/proposals-orientation half of
 * the CLI assembly, extracted verbatim from `assembleCliConfig`. Loads
 * the skill bundles (canonical manifest with the two legacy-layout
 * fallbacks), builds the compact skill catalog, folds skills into the
 * configuration-center artifacts, reads the proposals index and derives
 * the `recommendedNextAction` line the overview advertises.
 */
import { join } from 'node:path';

import type { ISkillSummary } from '../catalog/agent-discovery-types';
import type { IConfigurationArtifact } from '../contracts/interfaces/configuration-center.interface';
import type { IMcpVertexConfigFile } from '../plugins/load-config-file';
import type { IPluginLoadResult } from '../plugins/load-plugins';
import type { IMcpVertexCliArgs } from '../plugins/parse-cli-args';
import { loadSkills } from '../skills/load-skills';
import { SKILL_MANIFEST_REL } from '../skills/skill-paths';
import { buildSkillCatalog } from '../skills/skill-catalog';
import { readProposalsIndex } from './read-proposals-index';

export interface IAssembleSkillsInput {
	readonly args: IMcpVertexCliArgs;
	readonly fileConfig: IMcpVertexConfigFile;
	readonly docsDir: string;
	readonly cacheDir: string;
	readonly corePrefix: string;
	readonly docsDirMissing: boolean;
	readonly readFile: (absolutePath: string) => Promise<string | undefined>;
	readonly loadResult: IPluginLoadResult;
	/** Mutated in place: skills append their configuration-center rows. */
	readonly configurationArtifacts: IConfigurationArtifact[];
}

export interface IAssembleSkillsResult {
	readonly validationMatrix: NonNullable<
		IMcpVertexConfigFile['validationMatrix']
	>;
	readonly skillBundles: Awaited<ReturnType<typeof loadSkills>>;
	readonly skillCatalog: Awaited<ReturnType<typeof buildSkillCatalog>>;
	readonly skillSummaries: readonly ISkillSummary[];
	readonly proposalSummaries: Awaited<ReturnType<typeof readProposalsIndex>>;
	readonly recommendedNextAction: string;
}

export const assembleSkills = async (
	input: IAssembleSkillsInput,
): Promise<IAssembleSkillsResult> => {
	const {
		args,
		fileConfig,
		docsDir,
		cacheDir,
		corePrefix,
		docsDirMissing,
		readFile,
		loadResult,
		configurationArtifacts,
	} = input;
	const validationMatrix = fileConfig.validationMatrix ?? { scopes: {} };
	// Skill manifest location is defined once in `skill-paths.ts`
	// (`packages/core/skills/manifest.json`). We still fall back to the legacy
	// `docs/<docsDir>/skills/manifest.json` and the bare `<workspace>/skills`
	// layouts so downstream projects (and existing fixtures) that have not yet
	// migrated keep resolving their skills.
	const configuredSkills = await loadSkills(
		join(args.workspace, ...SKILL_MANIFEST_REL.split('/')),
		args.serverVersion,
	);
	const legacyDocsSkills =
		configuredSkills.length > 0
			? configuredSkills
			: await loadSkills(
					join(args.workspace, docsDir, 'skills', 'manifest.json'),
					args.serverVersion,
				);
	const skillBundles =
		legacyDocsSkills.length > 0
			? legacyDocsSkills
			: await loadSkills(
					join(args.workspace, 'skills', 'manifest.json'),
					args.serverVersion,
				);
	// Build the compact, actionable skill catalog once (f00065 slice-B): read
	// each SKILL.md a single time to extract its frontmatter "what + when to
	// use" line, then keep only compact rows. Bodies are loaded on demand via
	// the `skill` tool, never pushed to context by default.
	const skillCatalog = await buildSkillCatalog(
		args.workspace,
		skillBundles,
		async (absPath) => {
			const body = await readFile(absPath);
			if (body === undefined)
				throw new Error(`skill body not found: ${absPath}`);
			return body;
		},
	);
	const skillSummaries: readonly ISkillSummary[] = skillCatalog.entries.map(
		(entry) => ({
			id: entry.id,
			version: entry.version,
			minCoreVersion: entry.minCoreVersion,
			summary: entry.description,
			appliesTo: [...entry.appliesTo],
			tags: [...entry.tags],
			bodyPath: entry.bodyPath,
		}),
	);
	for (const skill of skillCatalog.entries) {
		const ownerId = skill.appliesTo[0] ?? null;
		configurationArtifacts.push({
			id: skill.id,
			kind: 'skill',
			owner: {
				id: ownerId,
				origin:
					ownerId === null
						? 'unknown'
						: ownerId.startsWith('@mcp-vertex/')
							? 'bundled'
							: 'user-local',
			},
		});
	}
	const proposalSummaries = await readProposalsIndex(
		args.workspace,
		cacheDir,
		readFile,
	);
	const isLoaded = (name: string): boolean =>
		loadResult.loaded.some((entry) => entry.plugin.name === name);
	const hasProposals = isLoaded('proposals');
	const hasRules = isLoaded('rules');
	const rulesClause = hasRules
		? ' ALWAYS write new or modified code already compliant with the active rules (rules_get_rules) — it is the default, no need to be told.'
		: '';
	// f00109 S1: when the config file's docsDir points nowhere, sending the
	// agent into auto_work would have it "work" an empty proposals layout —
	// the exact silent failure this diagnostic exists to prevent. Route it
	// to fixing the config first instead.
	const recommendedNextAction = docsDirMissing
		? `Config mismatch: docsDir "${docsDir}" does not exist in this workspace (see configIssues). Fix mcp-vertex.config.json or scaffold the layout (mcp-vertex init) BEFORE starting work; do not hand-create proposals or docs outside the server workflow.`
		: (hasProposals
				? `Call ${corePrefix}_overview, then ${corePrefix}_proposals_auto_work to start working.`
				: `Call ${corePrefix}_analyze_project to see what this project needs.`) +
			rulesClause;

	return {
		validationMatrix,
		skillBundles,
		skillCatalog,
		skillSummaries,
		proposalSummaries,
		recommendedNextAction,
	};
};
