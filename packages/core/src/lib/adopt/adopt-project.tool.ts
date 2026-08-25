/**
 * adopt-project.tool.ts — `<prefix>_adopt_project`, the one-call
 * project adoption orchestrator (f00157 S1).
 *
 * Dropping mcp-vertex into a project used to require chaining 5-7
 * disconnected steps: derive config → bootstrap the proposals store →
 * pick a launch shape → generate agents/instructions → wire issues →
 * relaunch. This tool composes the pieces the CORE already owns —
 * config derivation (`deriveConfig` + `mergeDerivedConfig`) and the
 * host/agent scaffold (`scaffold-*` generators) — plus a minimal
 * bootstrap of the canonical proposals store, and returns a verified
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
import z from 'zod';

import { analyzeProject } from '../bootstrap/analyze-project';
import { buildAdoptionAssessment } from './adoption-assessment.service';
import { ADOPTION_ASSESSMENT_SCHEMA } from '../contracts/constants/adoption-assessment-schema.constant';
import { deriveConfig, type IDerivedConfig } from '../bootstrap/derive-config';
import { mergeDerivedConfig } from '../bootstrap/merge-derived-config';
import type {
	IAdoptProjectPlan,
	IAdoptProjectToolDeps,
	IBuildAdoptProjectPlanInput,
} from '../contracts/interfaces/adopt-project.interface';
import type { IToolRegistration } from '../contracts/interfaces/tool-registration.interface';
import type {
	IScaffoldHostOptions,
} from '../scaffold/scaffold-host';
import {
	buildAgentFiles,
	buildProposalsStoreFiles,
} from './adopt-project-write-estimate';
import { writeFileAtomic } from '../shared/atomic-write';
import { toolError, toolOk } from '../shared/tool-response';
import { withFileMutex } from '../shared/with-file-mutex';

const CONFIG_FILENAME = 'mcp-vertex.config.json';

/** Resolved config (mutated clone) with the optional issues wiring. */
const configWithIssues = (
	derived: IDerivedConfig,
	repo: string,
): { config: Record<string, unknown>; rationale: readonly string[] } => {
	const config = structuredClone(derived.config) as {
		$schema: string;
		cacheDir: string;
		docsDir: string;
		plugins: Record<string, { options: Record<string, unknown> }>;
	};
	// issues hard-depends on proposals; seed it when absent (lean/minimal).
	config.plugins.proposals ??= { options: {} };
	config.plugins.issues = { options: { repo } };
	return {
		config: config as unknown as Record<string, unknown>,
		rationale: [
			...derived.rationale,
			`GitHub issues wired for ${repo} — the config loads the proposals + issues plugins; launch with --preset full (or --plugins proposals,issues).`,
		],
	};
};

/**
 * Pure: compute the full adoption plan (config + agent files + proposals
 * store + residual steps) from the project analysis. No I/O here — the
 * tool performs the writes so this stays testable and agnostic.
 */
export const buildAdoptProjectPlan = (
	input: IBuildAdoptProjectPlanInput,
): IAdoptProjectPlan => {
	const derived = deriveConfig(input.analysis, {
		topLevelDirs: input.topLevelDirs,
	});
	const withIssues =
		input.repo !== undefined
			? configWithIssues(derived, input.repo)
			: {
					config: derived.config as unknown as Record<
						string,
						unknown
					>,
					rationale: derived.rationale,
				};

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

	const prefix = input.namespacePrefix;
	const residual: string[] = [
		`Launch the host: bunx --package @mcp-vertex/cli mcpv __serve --workspace . --preset ${
			input.repo !== undefined ? 'full' : derived.preset
		}`,
		input.repo !== undefined
			? `Verify GitHub issues: run \`${prefix}_setup_github\` and confirm the ${input.repo} tier resolves.`
			: `(Optional) Wire GitHub issues later: run \`${prefix}_setup_github\`, then set \`plugins.issues.options.repo\` to your \`owner/name\` slug.`,
		'First proposals-plugin boot regenerates the registry index; or run `sync_proposals` once.',
	];

	return {
		preset: derived.preset,
		config: withIssues.config,
		rationale: withIssues.rationale,
		files: [
			...buildAgentFiles(hostOptions),
			...buildProposalsStoreFiles(input.docsDir),
		],
		residual,
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

export const buildAdoptProjectToolRegistration = (
	deps: IAdoptProjectToolDeps,
): IToolRegistration => ({
	id: 'adopt_project',
	summary:
		'One-call project adoption: derive config + bootstrap the proposals store + generate agents/instructions, returning a verified checklist.',
	tags: ['orientation', 'bootstrap', 'adoption'],
	register: async (server) => {
		server.registerTool(
			`${deps.namespacePrefix}_adopt_project`,
			{
				description:
					'Adopt THIS project for mcp-vertex in one call. Composes the config derivation (init_config), the proposals-store bootstrap, and the host agent/instructions scaffold — writing only what is missing and never overwriting project-owned files. Dry-run by default: returns the resolved config, rationale, the exact file list and the residual manual steps (launch + optional issues). Pass `write: true` to persist. `overwrite: true` replaces an existing config instead of merging; `repo: "owner/name"` wires the GitHub issues plugin.',
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

				// 2. Agent/instructions + proposals store files — skip any
				// file the project already owns (project instructions win).
				const created: string[] = [];
				const skipped: string[] = [];
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
