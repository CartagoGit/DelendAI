/**
 * assemble-skills.ts — r00009: the skills/proposals-orientation half of
 * the CLI assembly, extracted verbatim from `assembleCliConfig`. Loads
 * the skill bundles (canonical manifest with the two legacy-layout
 * fallbacks), builds the compact skill catalog, folds skills into the
 * configuration-center artifacts, reads the proposals index and derives
 * the `recommendedNextAction` line the overview advertises.
 */
import { createRequire } from 'node:module';
import { readdir, readFile as readFileFromDisk } from 'node:fs/promises';
import { join } from 'node:path';

import type { ISkillSummary } from '../catalog/agent-discovery-types';
import type { IConfigurationArtifact } from '../contracts/interfaces/configuration-center.interface';
import type { IDelendaiConfigFile } from '../plugins/load-config-file';
import type { IPluginLoadResult } from '../plugins/load-plugins';
import type { IDelendaiCliArgs } from '../plugins/parse-cli-args';
import { loadSkills } from '../skills/load-skills';
import { SKILL_MANIFEST_REL } from '../skills/skill-paths';
import { buildSkillCatalog } from '../skills/skill-catalog';
import { buildSkillResolver } from '../skills/sources/resolver';
import { packageSkillSource } from '../skills/sources/package-skill-source';
import { resolvePackageRoot } from '../skills/sources/package-root';
import { workspaceSkillSource } from '../skills/sources/workspace-source';
import {
	assembleWorkflowContributions,
	type IAssembledWorkflowContributionState,
} from './workflow-contribution-assembly';

export interface IAssembleSkillsInput {
	readonly args: IDelendaiCliArgs;
	readonly fileConfig: IDelendaiConfigFile;
	readonly docsDir: string;
	readonly cacheDir: string;
	readonly corePrefix: string;
	readonly docsDirMissing: boolean;
	/** True when a real delendai.config.json exists at the workspace root. */
	readonly configPresent: boolean;
	readonly readFile: (absolutePath: string) => Promise<string | undefined>;
	readonly loadResult: IPluginLoadResult;
	readonly portablePluginPackages?: readonly {
		readonly name: string;
		readonly resolved: string;
		readonly version?: string;
	}[];
	/** Mutated in place: skills append their configuration-center rows. */
	readonly configurationArtifacts: IConfigurationArtifact[];
}

export interface IAssembleSkillsResult {
	readonly validationMatrix: NonNullable<
		IDelendaiConfigFile['validationMatrix']
	>;
	readonly skillBundles: Awaited<ReturnType<typeof loadSkills>>;
	readonly skillCatalog: Awaited<ReturnType<typeof buildSkillCatalog>>;
	readonly skillSummaries: readonly ISkillSummary[];
	readonly proposalSummaries: IAssembledWorkflowContributionState['proposalSummaries'];
	readonly recommendedNextAction: string;
}

const diskRead = async (path: string): Promise<string> =>
	readFileFromDisk(path, 'utf8');

const diskList = async (path: string): Promise<readonly string[]> => {
	try {
		const entries = await readdir(path, { withFileTypes: true });
		return entries
			.filter((entry) => entry.isDirectory())
			.map((entry) => entry.name)
			.sort();
	} catch {
		return [];
	}
};

const readJsonIfPresent = async (path: string): Promise<unknown> => {
	try {
		return JSON.parse(await diskRead(path));
	} catch {
		return null;
	}
};

const packageRootFor = async (
	specifier: string,
	workspace: string,
	pluginName: string,
): Promise<string> => {
	let modulePath = specifier;
	try {
		if (!specifier.startsWith('/') && !specifier.startsWith('file:')) {
			const esmResolve = (
				import.meta as ImportMeta & {
					resolve?: (specifier: string) => string;
				}
			).resolve;
			modulePath =
				esmResolve?.(specifier) ??
				createRequire(import.meta.url).resolve(specifier);
		}
	} catch {
		modulePath = join(workspace, 'plugins', pluginName, 'src', 'index.ts');
	}
	// Package exports can intentionally omit the CommonJS condition and some
	// embedded runtimes do not implement `import.meta.resolve`. The consumer's
	// own node_modules entry is still an authoritative, portable package root.
	if (!specifier.startsWith('/') && !specifier.startsWith('file:')) {
		const installedRoot = join(
			workspace,
			'node_modules',
			...specifier.split('/'),
		);
		if (
			(await readJsonIfPresent(join(installedRoot, 'package.json'))) !==
			null
		) {
			return installedRoot;
		}
	}
	const resolvedRoot = await resolvePackageRoot({
		moduleUrl: modulePath,
		readJson: readJsonIfPresent,
	});
	if (resolvedRoot !== null) return resolvedRoot;
	const pluginRoot = join(workspace, 'plugins', pluginName);
	const packageRoot = join(workspace, 'packages', pluginName);
	return modulePath.startsWith(packageRoot) ? packageRoot : pluginRoot;
};

const buildPortableSkillCatalog = async (input: {
	readonly workspace: string;
	readonly coreVersion: string;
	readonly loadedPlugins: readonly {
		readonly name: string;
		readonly resolved: string;
		readonly version?: string;
	}[];
}) => {
	const sources = [
		workspaceSkillSource({
			id: 'workspace-overrides',
			workspaceRoot: input.workspace,
			listDir: diskList,
			readFile: diskRead,
		}),
		packageSkillSource({
			id: 'core-package',
			packageRoot:
				(await resolvePackageRoot({
					moduleUrl: import.meta.url,
					readJson: readJsonIfPresent,
				})) ?? input.workspace,
			owner: '@delendai/core',
			packageVersion: input.coreVersion,
			listDir: diskList,
			readFile: diskRead,
		}),
		...(await Promise.all(
			input.loadedPlugins.map(async (loaded) =>
				packageSkillSource({
					id: `plugin-${loaded.name}`,
					source: 'plugin',
					packageRoot: await packageRootFor(
						loaded.resolved,
						input.workspace,
						loaded.name,
					),
					owner: `@delendai/${loaded.name}`,
					packageVersion: loaded.version ?? input.coreVersion,
					listDir: diskList,
					readFile: diskRead,
				}),
			),
		)),
	];
	const resolver = buildSkillResolver({ sources });
	const listed = await resolver.list();
	const entries = listed.descriptors.map((descriptor) => ({
		id: descriptor.id,
		version: descriptor.version,
		minCoreVersion: input.coreVersion,
		description: descriptor.description,
		appliesTo: [...descriptor.appliesTo],
		tags: [...descriptor.tags],
		bodyPath: `${descriptor.source}/${descriptor.owner}/${descriptor.id}/SKILL.md`,
		source: descriptor.source,
		owner: descriptor.owner,
		hash: descriptor.hash,
		estimatedBodyTokens: descriptor.estimatedBodyTokens,
	}));
	return {
		entries,
		loadBody: async (id: string): Promise<string | undefined> =>
			(await resolver.load(id)).skill?.body,
	};
};

const applyWorkspaceOverrides = async (input: {
	readonly workspace: string;
	readonly catalog: Awaited<ReturnType<typeof buildSkillCatalog>>;
}) => {
	const source = workspaceSkillSource({
		id: 'workspace-overrides',
		workspaceRoot: input.workspace,
		listDir: diskList,
		readFile: diskRead,
	});
	const overrides = await source.list();
	if (overrides.length === 0) return input.catalog;
	const byId = new Map(
		input.catalog.entries.map((entry) => [entry.id, entry]),
	);
	for (const descriptor of overrides) {
		byId.set(descriptor.id, {
			id: descriptor.id,
			version: descriptor.version,
			minCoreVersion: '0.0.0',
			description: descriptor.description,
			appliesTo: [...descriptor.appliesTo],
			tags: [...descriptor.tags],
			bodyPath: `.delendai/skills/${descriptor.id}/SKILL.md`,
			source: descriptor.source,
			owner: descriptor.owner,
			hash: descriptor.hash,
			estimatedBodyTokens: descriptor.estimatedBodyTokens,
		});
	}
	return {
		entries: [...byId.values()],
		loadBody: async (id: string): Promise<string | undefined> => {
			const loaded = await source.load(id);
			return loaded?.body ?? input.catalog.loadBody(id);
		},
	};
};

const mergeSkillCatalogs = (
	primary: Awaited<ReturnType<typeof buildSkillCatalog>>,
	supplemental: Awaited<ReturnType<typeof buildPortableSkillCatalog>>,
) => {
	const byId = new Map(primary.entries.map((entry) => [entry.id, entry]));
	for (const entry of supplemental.entries) {
		if (!byId.has(entry.id)) byId.set(entry.id, entry);
	}
	return {
		entries: [...byId.values()],
		loadBody: async (id: string): Promise<string | undefined> => {
			const fromPrimary = await primary.loadBody(id);
			return fromPrimary ?? supplemental.loadBody(id);
		},
	};
};

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
		configPresent,
		readFile,
		loadResult,
		portablePluginPackages,
		configurationArtifacts,
	} = input;
	const pluginPackages =
		portablePluginPackages ??
		loadResult.loaded.map((loaded) => ({
			name: loaded.plugin.name,
			resolved: loaded.resolved,
			...(loaded.plugin.version !== undefined
				? { version: loaded.plugin.version }
				: {}),
		}));
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
	// Installed consumers do not contain the monorepo's composed manifest. In
	// that case resolve the package-owned skill directories and local overrides
	// through the portable source abstraction instead of guessing workspace
	// paths. The manifest path remains the fast canonical monorepo path.
	const skillCatalog =
		skillBundles.length === 0
			? await buildPortableSkillCatalog({
					workspace: args.workspace,
					coreVersion: args.serverVersion,
					loadedPlugins: pluginPackages,
				})
			: await applyWorkspaceOverrides({
					workspace: args.workspace,
					catalog: mergeSkillCatalogs(
						await buildSkillCatalog(
							args.workspace,
							skillBundles,
							async (absPath) => {
								const body = await readFile(absPath);
								if (body === undefined)
									throw new Error(
										`skill body not found: ${absPath}`,
									);
								return body;
							},
						),
						await buildPortableSkillCatalog({
							workspace: args.workspace,
							coreVersion: args.serverVersion,
							loadedPlugins: pluginPackages,
						}),
					),
				});
	// Build the compact, actionable skill catalog once (f00065 slice-B): read
	// each SKILL.md a single time to extract its frontmatter "what + when to
	// use" line, then keep only compact rows. Bodies are loaded on demand via
	// the `skill` tool, never pushed to context by default.
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
						: ownerId.startsWith('@delendai/')
							? 'bundled'
							: 'user-local',
			},
		});
	}
	const workflowState = await assembleWorkflowContributions({
		workspaceRoot: args.workspace,
		cacheDir,
		corePrefix,
		readWorkspaceFile: readFile,
	});
	const proposalSummaries = workflowState.proposalSummaries;
	const isLoaded = (name: string): boolean =>
		loadResult.loaded.some((entry) => entry.plugin.name === name);
	const hasRules = isLoaded('rules');
	const rulesClause = hasRules
		? ' ALWAYS write new or modified code already compliant with the active rules (rules_get_rules) — it is the default, no need to be told.'
		: '';
	// S1: when the config file's docsDir points nowhere, sending the
	// agent into auto_work would have it "work" an empty proposals layout —
	// the exact silent failure this diagnostic exists to prevent. Route it
	// to fixing the config first instead.
	// When there is NO config file at all, the very first action is
	// the one-call self-config (`adopt_project`) — before auto_work, before
	// analyze_project. That is the "delendai self-configures on first use"
	// contract: one call writes config + agents + proposals store.
	const recommendedNextAction = docsDirMissing
		? `Config mismatch: docsDir "${docsDir}" does not exist in this workspace (see configIssues). Fix delendai.config.json or scaffold the layout (delendai init) BEFORE starting work; do not hand-create proposals or docs outside the server workflow.`
		: !configPresent
			? `Call ${corePrefix}_overview, then ${corePrefix}_adopt_project to self-configure this project (config + agents + proposals store) in one call before starting work.`
			: workflowState.recommendedNextActionText + rulesClause;

	return {
		validationMatrix,
		skillBundles,
		skillCatalog,
		skillSummaries,
		proposalSummaries,
		recommendedNextAction,
	};
};
