import {
	defaultMcpServerName,
	scaffoldAgentFile,
	scaffoldClaudeAgentFile,
	scaffoldCodexAgentFile,
	scaffoldCodexConfigFile,
	scaffoldHostConfigFile,
	scaffoldHostPackageFiles,
	scaffoldInstructionsFile,
	scaffoldPromptFile,
	scaffoldServerEntryFiles,
	scaffoldSkillFile,
	scaffoldToolFile,
} from '../scaffold/scaffold-host';
import type {
	IScaffoldAgentSlot,
	IScaffoldHostOptions,
} from '../scaffold/scaffold-host';
import type { IScaffoldedFile } from '../scaffold/scaffold-host';
import { stripPackageScope, toKebabCase } from '../shared/string-normalize';
import type { IProjectAnalysis } from './analyze-project';
import { matchPromptArtifacts } from './prompt-artifact-rules';
import { resolvePatternCatalog } from './pattern-catalog-overrides';
import { matchSkillArtifacts } from './skill-artifact-rules';
import { matchNotes } from './note-rules';
import { resolveAdoptionStrategy } from './adoption-strategy';

export interface IBlueprintArtifact {
	readonly name: string;
	readonly description: string;
	/**
	 * Body text for the generated artefact (prompt or skill). When present
	 * it replaces the generic TODO placeholder that `scaffoldPromptFile`
	 * / `scaffoldSkillFile` would otherwise emit. Optional so callers that
	 * only know `name`+`description` keep working.
	 */
	readonly body?: string;
	/**
	 * Concrete "when to use" bullets for skills. Same contract as
	 * `scaffoldSkillFile`'s fourth arg: overrides the TODO bullet when
	 * present.
	 */
	readonly whenToUse?: readonly string[];
}

export interface IBlueprintDefaults {
	readonly keepLegacy: boolean;
	readonly reasons: readonly string[];
	readonly warnings: readonly string[];
}

/**
 * The EXHAUSTIVE plan for a project-specific MCP server: every tool,
 * prompt, skill and agent worth creating for this project, plus whether
 * tests are included and whether one already exists. Derived from the
 * analysis + the pattern catalog + the project's own scripts — not just
 * one or two suggestions.
 */
export interface IServerBlueprint {
	readonly serverName: string;
	readonly namespacePrefix: string;
	readonly targetDir: string;
	readonly projectType: IProjectAnalysis['projectType'];
	readonly plugins: readonly string[];
	readonly tools: readonly IBlueprintArtifact[];
	readonly prompts: readonly IBlueprintArtifact[];
	readonly skills: readonly IBlueprintArtifact[];
	readonly agents: ReadonlyArray<{ slot: string; description: string }>;
	readonly tests: boolean;
	readonly hasExistingServer: boolean;
	readonly adoptionStrategy: ReturnType<typeof resolveAdoptionStrategy>;
	readonly defaults: IBlueprintDefaults;
	readonly notes: readonly string[];
}

export interface IBlueprintOptions {
	readonly serverName?: string;
	readonly namespacePrefix?: string;
	readonly tests?: boolean;
	readonly targetDir?: string;
	/** Optional free-form user request used only for migration-safety hints. */
	readonly intent?: string;
	readonly adoption?: unknown;
	/**
	 * Optional host-defined pattern overrides (see
	 * `pattern-catalog-overrides.ts`). When omitted, the hardcoded
	 * `PROJECT_PATTERN_CATALOG` is used.
	 */
	readonly patternOverrides?: import('./pattern-catalog-overrides').IPatternOverrides;
}

const kebabHead = (name: string | undefined): string => {
	if (name?.startsWith('@delendai/')) return 'mcp-vertex';
	if (!name) return 'app';
	const head = toKebabCase(stripPackageScope(name)).split('-')[0];
	return head && head.length > 0 ? head : 'app';
};

const defaultTargetDir = (analysis: IProjectAnalysis): string => {
	if (analysis.name === '@delendai/core-monorepo') return 'packages/core';
	return analysis.hasPackageJson ? '.' : 'libs/mcp-project';
};

const uniqueByName = (
	items: readonly IBlueprintArtifact[],
): IBlueprintArtifact[] => {
	const seen = new Set<string>();
	const out: IBlueprintArtifact[] = [];
	for (const item of items) {
		if (seen.has(item.name)) continue;
		seen.add(item.name);
		out.push(item);
	}
	return out;
};

const SUBAGENT_SLOTS = [
	{
		slot: 'proposal_guardian',
		description: 'Curates and validates the backlog.',
	},
	{
		slot: 'implementation_runner',
		description: 'Executes one atomic slice.',
	},
	{
		slot: 'delivery_verifier',
		description: 'Verifies a closed slice/round.',
	},
	{
		slot: 'technical_investigator',
		description: 'Investigates without editing.',
	},
] as const;

const SCAFFOLD_AGENT_SLOTS = new Set<IScaffoldAgentSlot>([
	'orchestrator',
	'proposal_guardian',
	'implementation_runner',
	'delivery_verifier',
	'technical_investigator',
]);

const MIGRATION_INTENT_RE =
	/\b(migrat(?:e|ion|ing)?|refactor|rewrite|replace|regen(?:erate)?|port)\b/i;

const buildBlueprintDefaults = (
	analysis: IProjectAnalysis,
	options: IBlueprintOptions,
): IBlueprintDefaults => {
	const reasons: string[] = [];
	const warnings: string[] = [];
	if (analysis.signals.includes('host-config has custom extraTools')) {
		reasons.push('host-config has custom extraTools');
	}
	if (
		analysis.signals.includes(
			'mcp-vertex.config.json has plugin or validation config',
		)
	) {
		reasons.push('mcp-vertex.config.json has plugin or validation config');
	}
	if (
		options.intent !== undefined &&
		MIGRATION_INTENT_RE.test(options.intent)
	) {
		reasons.push('user request mentions migration/refactor work');
	}
	if (reasons.length === 0) {
		return {
			keepLegacy: false,
			reasons: ['greenfield-safe default'],
			warnings,
		};
	}
	warnings.push(
		'keepLegacy preserves existing scaffold targets under legacy/ before writing fresh templates; review those snapshots before deleting them.',
	);
	return { keepLegacy: true, reasons, warnings };
};

const hasCapabilityAction = (
	blueprint: IServerBlueprint,
	capability: 'agents' | 'mcp-config',
	action: 'replace',
): boolean =>
	blueprint.adoptionStrategy.operations.some(
		(operation) =>
			operation.capability === capability && operation.action === action,
	);

const isScaffoldAgentSlot = (slot: string): slot is IScaffoldAgentSlot =>
	SCAFFOLD_AGENT_SLOTS.has(slot as IScaffoldAgentSlot);

const buildHostScaffoldOptions = (
	blueprint: IServerBlueprint,
	projectPackageName?: string,
): IScaffoldHostOptions => ({
	projectName: blueprint.serverName,
	namespacePrefix: blueprint.namespacePrefix,
	projectPackageName:
		projectPackageName ?? `@${blueprint.namespacePrefix}/mcp-project`,
	targetDir: blueprint.targetDir,
	mcpServerName: blueprint.serverName,
});
/** Build the exhaustive blueprint from a project analysis. */
export const buildServerBlueprint = (
	analysis: IProjectAnalysis,
	options: IBlueprintOptions = {},
): IServerBlueprint => {
	const pattern = resolvePatternCatalog(options.patternOverrides)[
		analysis.projectType
	];
	const namespacePrefix = options.namespacePrefix ?? kebabHead(analysis.name);
	const serverName =
		options.serverName ?? defaultMcpServerName(namespacePrefix);
	const targetDir = options.targetDir ?? defaultTargetDir(analysis);
	const tests = options.tests ?? true;
	const plugins = pattern.recommendedPlugins;
	const defaults = buildBlueprintDefaults(analysis, options);
	const adoptionStrategy = resolveAdoptionStrategy(options.adoption ?? {}, {
		hasExistingMcpProject: analysis.hasMcpProject,
	});
	const adopts = (capability: string): boolean =>
		adoptionStrategy.operations.some(
			(operation) =>
				operation.capability === capability &&
				operation.action !== 'preserve',
		);

	// Tools: catalog baseline + one runner per quality script the repo has.
	const scriptTools: IBlueprintArtifact[] = Object.keys(analysis.scripts).map(
		(role) => ({
			name: `run_${role}`,
			description: `Run the project's ${role} command and return a structured pass/fail report.`,
		}),
	);
	const tools = adopts('tools')
		? uniqueByName([
				...pattern.recommendedTools.map((tool) => ({
					name: tool.name,
					description: tool.description,
				})),
				...scriptTools,
			])
		: [];

	const prompts = adopts('prompts')
		? matchPromptArtifacts({
				analysis,
				namespacePrefix,
				plugins,
			})
		: [];

	const skills = adopts('skills')
		? matchSkillArtifacts({ analysis, serverName })
		: [];

	const agents = adopts('agents')
		? [
				{
					slot: 'orchestrator',
					description: 'Root orchestrator for this project.',
				},
				...(plugins.includes('proposals') ? SUBAGENT_SLOTS : []),
			]
		: [];

	const notes = matchNotes({
		analysis,
		defaults,
		tests,
		...(options.patternOverrides !== undefined
			? { patternOverrides: options.patternOverrides }
			: {}),
	});

	return {
		serverName,
		namespacePrefix,
		targetDir,
		projectType: analysis.projectType,
		plugins,
		tools,
		prompts,
		skills,
		agents,
		tests,
		hasExistingServer: analysis.hasMcpProject,
		adoptionStrategy,
		defaults,
		notes,
	};
};

const toolTestFile = (
	prefix: string,
	toolName: string,
	targetDir: string,
): IScaffoldedFile => {
	const id = toolName.replace(/[^a-z0-9]+/gi, '-').toLowerCase();
	const fn = id
		.split('-')
		.map((part) => part.charAt(0).toUpperCase() + part.slice(1))
		.join('');
	return {
		path: `${targetDir === '.' ? '' : `${targetDir}/`}tests/src/lib/tools/${prefix}-${id}.tool.spec.ts`,
		content: `import { describe, expect, it } from 'vitest';

import { build${fn}Response } from '../../../../src/lib/tools/${prefix}-${id}.tool';

describe('${prefix}_${id.replace(/-/g, '_')}', () => {
	it('returns a text response', () => {
		const out = build${fn}Response({});
		expect(out.content[0]?.type).toBe('text');
	});
});
`,
	};
};

/**
 * Materialise the blueprint into concrete files: the host project, plus
 * a file per tool/prompt/skill (and a test per tool when enabled). The
 * returned files are for the AGENT to write — nothing is written here.
 */
export const buildBlueprintFiles = (
	blueprint: IServerBlueprint,
	projectPackageName?: string,
): readonly IScaffoldedFile[] => {
	const prefix = blueprint.namespacePrefix;
	const hostOptions = buildHostScaffoldOptions(blueprint, projectPackageName);
	const files: IScaffoldedFile[] = [];
	if (hasCapabilityAction(blueprint, 'mcp-config', 'replace')) {
		files.push(
			scaffoldHostConfigFile(hostOptions),
			...scaffoldServerEntryFiles(hostOptions),
			...scaffoldHostPackageFiles(hostOptions),
			scaffoldCodexConfigFile(hostOptions),
		);
	}
	if (hasCapabilityAction(blueprint, 'agents', 'replace')) {
		for (const agent of blueprint.agents) {
			if (!isScaffoldAgentSlot(agent.slot)) continue;
			files.push(
				scaffoldAgentFile(hostOptions, agent.slot),
				scaffoldClaudeAgentFile(hostOptions, agent.slot),
				scaffoldCodexAgentFile(hostOptions, agent.slot),
			);
		}
		files.push(scaffoldInstructionsFile(hostOptions));
	}
	for (const tool of blueprint.tools) {
		files.push(
			scaffoldToolFile(
				prefix,
				tool.name,
				tool.description,
				blueprint.targetDir,
			),
		);
		if (blueprint.tests)
			files.push(toolTestFile(prefix, tool.name, blueprint.targetDir));
	}
	for (const prompt of blueprint.prompts) {
		files.push(
			scaffoldPromptFile(
				prefix,
				prompt.name,
				prompt.description,
				prompt.body,
				blueprint.targetDir,
			),
		);
	}
	for (const skill of blueprint.skills) {
		files.push(
			scaffoldSkillFile(
				prefix,
				skill.name,
				skill.description,
				skill.whenToUse ?? [],
				skill.body,
				blueprint.targetDir,
			),
		);
	}
	// De-duplicate by path so explicit blueprint artefacts win.
	const byPath = new Map<string, IScaffoldedFile>();
	for (const file of files) byPath.set(file.path, file);
	return [...byPath.values()];
};
