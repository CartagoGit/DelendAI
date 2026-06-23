import {
	scaffoldHostProject,
	scaffoldPromptFile,
	scaffoldSkillFile,
	scaffoldToolFile,
} from '../scaffold/scaffold-host';
import type { IScaffoldedFile } from '../scaffold/scaffold-host';
import type { IProjectAnalysis } from './analyze-project';
import {
	blueprintArtifactBody,
	continueProposalPromptBody,
	fixQualityPromptBody,
	frameworkSkillBody,
	frameworkSkillWhenToUse,
	projectStandardsSkillBody,
	startPromptBody,
} from './body-content';
import { resolvePatternCatalog } from './pattern-catalog-overrides';

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
	readonly projectType: IProjectAnalysis['projectType'];
	readonly plugins: readonly string[];
	readonly tools: readonly IBlueprintArtifact[];
	readonly prompts: readonly IBlueprintArtifact[];
	readonly skills: readonly IBlueprintArtifact[];
	readonly agents: ReadonlyArray<{ slot: string; description: string }>;
	readonly tests: boolean;
	readonly hasExistingServer: boolean;
	readonly defaults: IBlueprintDefaults;
	readonly notes: readonly string[];
}

export interface IBlueprintOptions {
	readonly serverName?: string;
	readonly namespacePrefix?: string;
	readonly tests?: boolean;
	/** Optional free-form user request used only for migration-safety hints. */
	readonly intent?: string;
	/**
	 * Optional host-defined pattern overrides (see
	 * `pattern-catalog-overrides.ts`). When omitted, the hardcoded
	 * `PROJECT_PATTERN_CATALOG` is used.
	 */
	readonly patternOverrides?: import('./pattern-catalog-overrides').IPatternOverrides;
}

const kebabHead = (name: string | undefined): string => {
	if (!name) return 'app';
	const head = name
		.replace(/^@[^/]+\//, '')
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-+|-+$/g, '')
		.split('-')[0];
	return head && head.length > 0 ? head : 'app';
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

/** Build the exhaustive blueprint from a project analysis. */
export const buildServerBlueprint = (
	analysis: IProjectAnalysis,
	options: IBlueprintOptions = {},
): IServerBlueprint => {
	const pattern = resolvePatternCatalog(options.patternOverrides)[
		analysis.projectType
	];
	const namespacePrefix = options.namespacePrefix ?? kebabHead(analysis.name);
	const serverName = options.serverName ?? `mcp-project-${namespacePrefix}`;
	const tests = options.tests ?? true;
	const plugins = pattern.recommendedPlugins;
	const defaults = buildBlueprintDefaults(analysis, options);

	// Tools: catalog baseline + one runner per quality script the repo has.
	const scriptTools: IBlueprintArtifact[] = Object.keys(analysis.scripts).map(
		(role) => ({
			name: `run_${role}`,
			description: `Run the project's ${role} command and return a structured pass/fail report.`,
		}),
	);
	const tools = uniqueByName([
		...pattern.recommendedTools.map((tool) => ({
			name: tool.name,
			description: tool.description,
		})),
		...scriptTools,
	]);

	const prompts: IBlueprintArtifact[] = [
		{
			name: 'start',
			description: 'Orient and start working in this project.',
			body: startPromptBody(analysis, namespacePrefix),
		},
	];
	if (Object.keys(analysis.scripts).length > 0) {
		prompts.push({
			name: 'fix quality',
			description: 'Run the gates and fix what fails.',
			body: fixQualityPromptBody(analysis, namespacePrefix),
		});
	}
	if (plugins.includes('proposals')) {
		prompts.push({
			name: 'continue proposal',
			description: 'Resolve and execute the next proposal slice.',
			body: continueProposalPromptBody(namespacePrefix),
		});
	}

	const skills: IBlueprintArtifact[] = [
		{
			name: 'project standards',
			description: `Closed stack and conventions of ${serverName}.`,
			body: projectStandardsSkillBody(analysis),
			whenToUse: [
				'Before writing or reviewing code in this project.',
				'When a code review questions a project-wide convention.',
			],
		},
	];
	if (analysis.framework !== undefined) {
		skills.push({
			name: `${analysis.framework} conventions`,
			description: `${analysis.framework} idioms and lint/type rules for this project.`,
			body: frameworkSkillBody(analysis),
			whenToUse: [...frameworkSkillWhenToUse(analysis)],
		});
	}

	const agents = [
		{
			slot: 'orchestrator',
			description: 'Root orchestrator for this project.',
		},
		...(plugins.includes('proposals') ? SUBAGENT_SLOTS : []),
	];

	const notes: string[] = [
		...pattern.knowledgeHints,
		analysis.hasMcpProject
			? `An MCP server already exists (${analysis.mcpEvidence.join('; ')}): analyze it and integrate it with mcp-vertex instead of replacing it — register it alongside, reuse its tools, and adopt mcp-vertex conventions incrementally.`
			: 'No MCP server found: create one from this blueprint (scaffold the host project, then each tool/prompt/skill/agent).',
		tests
			? 'Generate a test alongside each tool.'
			: 'Tests omitted (--mcp-project-tests=false).',
	];
	if (analysis.agentConfigs.length > 0) {
		notes.push(
			`Align with the existing agent config (${analysis.agentConfigs.join(', ')}).`,
		);
	}
	notes.push(
		defaults.keepLegacy
			? `Recommended keepLegacy=true: ${defaults.reasons.join('; ')}.`
			: 'Recommended keepLegacy=false: greenfield-safe default.',
	);
	notes.push(...defaults.warnings);

	return {
		serverName,
		namespacePrefix,
		projectType: analysis.projectType,
		plugins,
		tools,
		prompts,
		skills,
		agents,
		tests,
		hasExistingServer: analysis.hasMcpProject,
		defaults,
		notes,
	};
};

const toolTestFile = (prefix: string, toolName: string): IScaffoldedFile => {
	const id = toolName.replace(/[^a-z0-9]+/gi, '-').toLowerCase();
	const fn = id
		.split('-')
		.map((part) => part.charAt(0).toUpperCase() + part.slice(1))
		.join('');
	return {
		path: `libs/mcp-project/tests/src/lib/tools/${prefix}-${id}.tool.spec.ts`,
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
	const files: IScaffoldedFile[] = [
		...scaffoldHostProject({
			projectName: blueprint.serverName,
			namespacePrefix: prefix,
			projectPackageName: projectPackageName ?? `@${prefix}/mcp-project`,
		}),
	];
	for (const tool of blueprint.tools) {
		files.push(scaffoldToolFile(prefix, tool.name, tool.description));
		if (blueprint.tests) files.push(toolTestFile(prefix, tool.name));
	}
	for (const prompt of blueprint.prompts) {
		files.push(
			scaffoldPromptFile(
				prefix,
				prompt.name,
				prompt.description,
				prompt.body,
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
			),
		);
	}
	// De-duplicate by path (host project already ships a starter skill).
	const byPath = new Map<string, IScaffoldedFile>();
	for (const file of files) byPath.set(file.path, file);
	return [...byPath.values()];
};
