/**
 * adopt-project.tool.ts — `<prefix>_adopt_project`, the one-call
 * project adoption orchestrator (f00157 S1).
 *
 * Dropping mcp-vertex into a project used to require chaining 5-7
 * disconnected steps: derive config → pick a launch shape → generate
 * agents/instructions → apply any plugin-owned adoption bootstrap →
 * relaunch. This tool composes the pieces the CORE already owns —
 * config derivation (`deriveConfig` + `mergeDerivedConfig`) and the
 * host/agent scaffold (`scaffold-*` generators) — plus any loaded
 * adoption extensions contributed by plugins, and returns a verified
 * checklist with the few residual steps that genuinely need a human or
 * network (launching the host, GitHub auth).
 *
 * Everything is ADDITIVE and idempotent: an existing project config is
 * merged (never replaced unless `overwrite: true`), and existing agent/
 * instruction/proposal files are skipped (never overwritten). A
 * project's own instructions always win — matching the "no surprises"
 * adoption contract.
 *
 * Dry-run by default (`write: false`): returns the full plan without
 * touching disk. Pass `write: true` to persist it.
 */
import { posix as pathPosix } from 'node:path';

import z from 'zod';

import { analyzeProject } from '../bootstrap/analyze-project';
import { buildAdoptionAssessment } from './adoption-assessment.service';
import { ADOPTION_ASSESSMENT_SCHEMA } from '../contracts/constants/adoption-assessment-schema.constant';
import { deriveConfig } from '../bootstrap/derive-config';
import { mergeDerivedConfig } from '../bootstrap/merge-derived-config';
import { applyAdoptionExtensions } from './adoption-extension-registry';
import type {
	IAdoptProjectPlan,
	IAdoptProjectToolDeps,
	IBuildAdoptProjectPlanInput,
} from '../contracts/interfaces/adopt-project.interface';
import type { IProjectProfileWorkspace } from '../contracts/interfaces/project-profile.interface';
import type { IToolRegistration } from '../contracts/interfaces/tool-registration.interface';
import type { IScaffoldHostOptions } from '../scaffold/scaffold-host';
import { buildAgentFiles } from './adopt-project-write-estimate';
import { persistProjectProfile } from './project-profile.service';
import { writeFileAtomic } from '../shared/atomic-write';
import { toolError, toolOk } from '../shared/tool-response';
import { withFileMutex } from '../shared/with-file-mutex';
import { PROJECT_PROFILE_FILENAME } from '../contracts/interfaces/project-profile.interface';

const CONFIG_FILENAME = 'mcp-vertex.config.json';

/**
 * Pure: compute the full adoption plan (config + generated files +
 * plugin-contributed adoption steps) from the project analysis. No I/O
 * here — the tool performs the writes so this stays testable and agnostic.
 */
export const buildAdoptProjectPlan = (
	input: IBuildAdoptProjectPlanInput,
): IAdoptProjectPlan => {
	const derived = deriveConfig(input.analysis, {
		topLevelDirs: input.topLevelDirs,
	});

	const hostOptions: IScaffoldHostOptions = {
		projectName: input.projectName,
		namespacePrefix: input.namespacePrefix,
		projectPackageName: '@mcp-vertex/adopted',
		mcpServerName: input.mcpServerName,
		existingMcpVertex: true,
		...(input.defaultModel !== undefined
			? { defaultModel: input.defaultModel }
			: {}),
	};

	const plan = applyAdoptionExtensions({
		derived,
		request: input,
		plan: {
			config: derived.config as unknown as Record<string, unknown>,
			rationale: derived.rationale,
			files: [...buildAgentFiles(hostOptions)],
			residual: [
				`Launch the host: bunx --package @mcp-vertex/cli mcpv __serve --workspace . --preset ${derived.preset}`,
				input.repo !== undefined
					? `GitHub repo provided (${input.repo}). Wire plugin-specific adoption explicitly if you want issue ingestion during adoption.`
					: `(Optional) Wire GitHub issues later: run \`${input.namespacePrefix}_setup_github\`, then set \`plugins.issues.options.repo\` to your \`owner/name\` slug.`,
			],
		},
	});

	return {
		preset: derived.preset,
		config: plan.config,
		rationale: plan.rationale,
		files: plan.files,
		residual: plan.residual,
	};
};

const OUTPUT_SCHEMA = z.object({
	ok: z.literal(true),
	preset: z.enum(['lean', 'standard', 'minimal', 'swarm']),
	config: z.record(z.string(), z.unknown()).optional(),
	rationale: z.array(z.string()).optional(),
	assessment: ADOPTION_ASSESSMENT_SCHEMA.optional(),
	wrote: z.boolean(),
	created: z.array(z.string()),
	skipped: z.array(z.string()),
	residual: z.array(z.string()),
});

const parseExistingConfig = (
	text: string | undefined,
): Record<string, unknown> | undefined => {
	if (text === undefined) return undefined;
	try {
		const parsed: unknown = JSON.parse(text);
		if (
			parsed !== null &&
			typeof parsed === 'object' &&
			!Array.isArray(parsed)
		) {
			return parsed as Record<string, unknown>;
		}
		return undefined;
	} catch {
		return undefined;
	}
};

const asRecord = (value: unknown): Record<string, unknown> | undefined => {
	if (value === null || typeof value !== 'object' || Array.isArray(value)) {
		return undefined;
	}
	return value as Record<string, unknown>;
};

const normalizeWorkspacePath = (value: string): string => {
	const normalized = pathPosix.normalize(value.replaceAll('\\', '/'));
	return normalized === '.' ? '.' : normalized.replace(/\/$/, '');
};

const readWorkspacePatterns = (
	packageJsonText: string | undefined,
): string[] => {
	if (packageJsonText === undefined) return [];
	try {
		const parsed: unknown = JSON.parse(packageJsonText);
		const record = asRecord(parsed);
		if (record === undefined) return [];
		if (Array.isArray(record.workspaces)) {
			return record.workspaces.filter(
				(entry): entry is string => typeof entry === 'string',
			);
		}
		const workspaceObject = asRecord(record.workspaces);
		const packages = workspaceObject?.packages;
		if (!Array.isArray(packages)) return [];
		return packages.filter(
			(entry): entry is string => typeof entry === 'string',
		);
	} catch {
		return [];
	}
};

const listWorkspaceCandidates = async (
	reader: IAdoptProjectToolDeps['reader'],
	packageJsonText: string | undefined,
): Promise<readonly string[]> => {
	const candidates = new Set<string>();
	for (const pattern of readWorkspacePatterns(packageJsonText)) {
		const normalizedPattern = normalizeWorkspacePath(pattern);
		if (normalizedPattern === '.' || normalizedPattern === '') continue;
		if (normalizedPattern.endsWith('/*')) {
			const baseDir = normalizedPattern.slice(0, -2);
			for (const child of await reader.listDir(baseDir)) {
				const candidate = normalizeWorkspacePath(
					pathPosix.join(baseDir, child),
				);
				if (
					await reader.exists(
						pathPosix.join(candidate, 'package.json'),
					)
				) {
					candidates.add(candidate);
				}
			}
			continue;
		}
		if (
			await reader.exists(
				pathPosix.join(normalizedPattern, 'package.json'),
			)
		) {
			candidates.add(normalizedPattern);
		}
	}
	return [...candidates].sort((left, right) => left.localeCompare(right));
};

const createScopedReader = (
	reader: IAdoptProjectToolDeps['reader'],
	workspacePath: string,
) => ({
	readFile: (relativePath: string) =>
		reader.readFile(pathPosix.join(workspacePath, relativePath)),
	exists: (relativePath: string) =>
		reader.exists(pathPosix.join(workspacePath, relativePath)),
	listDir: (relativePath: string) =>
		reader.listDir(pathPosix.join(workspacePath, relativePath)),
});

const discoverProjectProfileWorkspaces = async (
	deps: IAdoptProjectToolDeps,
): Promise<readonly IProjectProfileWorkspace[]> => {
	const packageJsonText = await deps.reader.readFile('package.json');
	const workspacePaths = await listWorkspaceCandidates(
		deps.reader,
		packageJsonText,
	);
	const discovered: IProjectProfileWorkspace[] = [];
	for (const workspacePath of workspacePaths) {
		const scopedReader = createScopedReader(deps.reader, workspacePath);
		const analysis = await analyzeProject(scopedReader);
		const topLevelDirs = await scopedReader.listDir('');
		const assessment = buildAdoptionAssessment(analysis, topLevelDirs, {
			projectName: analysis.name ?? workspacePath,
			namespacePrefix: deps.namespacePrefix,
			mcpServerName: 'mcp-vertex',
			docsDir: deps.corePaths.docsDir,
		});
		discovered.push({
			path: workspacePath,
			projectType: analysis.projectType,
			language: analysis.language,
			packageManager: analysis.packageManager,
			...(analysis.framework !== undefined
				? { framework: analysis.framework }
				: {}),
			testRunner: analysis.testRunner,
			recommendedPluginIds: [...assessment.recommendedPluginIds],
		});
	}
	return discovered;
};

export const buildAdoptProjectToolRegistration = (
	deps: IAdoptProjectToolDeps,
): IToolRegistration => ({
	id: 'adopt_project',
	summary:
		'One-call project adoption: derive config + generate agents/instructions + apply loaded adoption extensions, returning a verified checklist.',
	tags: ['orientation', 'bootstrap', 'adoption'],
	register: async (server) => {
		server.registerTool(
			`${deps.namespacePrefix}_adopt_project`,
			{
				description:
					'Adopt THIS project for mcp-vertex in one call. Composes the config derivation (init_config), the host agent/instructions scaffold, and any adoption extensions contributed by loaded plugins — writing only what is missing and never overwriting project-owned files. Dry-run by default: returns the resolved config, rationale, the exact file list and the residual manual steps. Pass `write: true` to persist. `overwrite: true` replaces an existing config instead of merging; `repo: "owner/name"` is available to explicit adoption extensions that wire GitHub-aware plugins.',
				inputSchema: z.object({
					analyze: z.boolean().optional(),
					write: z.boolean().optional(),
					overwrite: z.boolean().optional(),
					projectName: z.string().optional(),
					namespacePrefix: z.string().optional(),
					mcpServerName: z.string().optional(),
					defaultModel: z.string().optional(),
					repo: z.string().optional(),
				}),
				outputSchema: OUTPUT_SCHEMA,
			},
			async (args: {
				analyze?: boolean | undefined;
				write?: boolean | undefined;
				overwrite?: boolean | undefined;
				projectName?: string | undefined;
				namespacePrefix?: string | undefined;
				mcpServerName?: string | undefined;
				defaultModel?: string | undefined;
				repo?: string | undefined;
			}) => {
				const analysis = await analyzeProject(deps.reader);
				const topLevelDirs = await deps.reader.listDir('');
				const discoveredWorkspaces =
					analysis.projectType === 'monorepo'
						? await discoverProjectProfileWorkspaces(deps)
						: [];
				const assessment = buildAdoptionAssessment(
					analysis,
					topLevelDirs,
					{
						projectName:
							args.projectName ?? analysis.name ?? 'Workspace',
						namespacePrefix:
							args.namespacePrefix ?? deps.namespacePrefix,
						mcpServerName: args.mcpServerName ?? 'mcp-vertex',
						docsDir: deps.corePaths.docsDir,
						...(args.defaultModel !== undefined
							? { defaultModel: args.defaultModel }
							: {}),
						...(args.repo !== undefined ? { repo: args.repo } : {}),
					},
				);
				const plan = buildAdoptProjectPlan({
					analysis,
					topLevelDirs,
					projectName:
						args.projectName ?? analysis.name ?? 'Workspace',
					namespacePrefix:
						args.namespacePrefix ?? deps.namespacePrefix,
					mcpServerName: args.mcpServerName ?? 'mcp-vertex',
					docsDir: deps.corePaths.docsDir,
					...(args.defaultModel !== undefined
						? { defaultModel: args.defaultModel }
						: {}),
					...(args.repo !== undefined ? { repo: args.repo } : {}),
				});

				if (args.analyze === true) {
					return toolOk({
						preset: plan.preset,
						config: plan.config,
						rationale: plan.rationale,
						assessment,
						wrote: false,
						created: [],
						skipped: [],
						residual: plan.residual,
					});
				}

				if (args.write !== true) {
					return toolOk({
						preset: plan.preset,
						config: plan.config,
						rationale: plan.rationale,
						assessment,
						wrote: false,
						created: [],
						skipped: [],
						residual: plan.residual,
					});
				}

				// 1. Config — merge with any existing project config unless
				// an intentional replacement was requested.
				let config = plan.config;
				const existingText =
					await deps.reader.readFile(CONFIG_FILENAME);
				const existing = parseExistingConfig(existingText);
				if (existing !== undefined && args.overwrite !== true) {
					config = mergeDerivedConfig(plan.config, existing);
				} else if (
					existingText !== undefined &&
					existing === undefined
				) {
					return toolError(
						`${CONFIG_FILENAME} is not valid JSON`,
						'Fix the project configuration or pass overwrite:true to intentionally replace it.',
					);
				}
				const configAbs = deps.workspace.resolve(CONFIG_FILENAME);
				await withFileMutex(configAbs, () =>
					writeFileAtomic(
						configAbs,
						`${JSON.stringify(config, null, '\t')}\n`,
					),
				);

				// 2. Persist the derived project profile so later tools can reuse
				// the current analysis instead of rediscovering the workspace.
				const profileWrite = await persistProjectProfile({
					workspace: deps.workspace,
					analysis,
					assessment,
					discoveredWorkspaces,
				});

				// 3. Generated scaffold + plugin-contributed adoption files — skip any
				// file the project already owns (project instructions win).
				const created: string[] = [];
				const skipped: string[] = [];
				if (profileWrite.created) {
					created.push(PROJECT_PROFILE_FILENAME);
				}
				for (const file of plan.files) {
					if (await deps.reader.exists(file.path)) {
						skipped.push(file.path);
						continue;
					}
					await writeFileAtomic(
						deps.workspace.resolve(file.path),
						file.content,
					);
					created.push(file.path);
				}

				return toolOk({
					preset: plan.preset,
					config,
					rationale: plan.rationale,
					assessment,
					wrote: true,
					created,
					skipped,
					residual: plan.residual,
				});
			},
		);
	},
});
