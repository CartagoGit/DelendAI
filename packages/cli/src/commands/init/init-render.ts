/**
 * f00084 S2 + S3 + S4 — render the bootstrap bundle.
 *
 * Pure functions: each `render*` takes the answers and returns a list of
 * `{ path, content }` pairs ready to feed `init-writers.ts`. The command
 * is the only place that touches the file system.
 */
import { join } from 'node:path';

import type { IInitAnswers } from './init-answers.schema';

export type IRenderedFile = {
	readonly relPath: string;
	readonly content: string;
};

export type IRenderedBundle = {
	readonly files: readonly IRenderedFile[];
	readonly summary: string;
};

const ORDERED_RESOLVED_PRESET_PLUGINS: Record<
	IInitAnswers['preset'],
	readonly string[]
> = {
	minimal: ['git', 'search'],
	standard: ['git', 'search', 'memory', 'docs', 'rules', 'quality', 'deps'],
	swarm: [
		'git',
		'search',
		'memory',
		'docs',
		'rules',
		'quality',
		'deps',
		'proposals',
		'notification',
		'logs',
		'status-marker',
		'test-convention',
		'conventions',
	],
	full: [
		'git',
		'search',
		'memory',
		'docs',
		'rules',
		'quality',
		'deps',
		'proposals',
		'notification',
		'logs',
		'status-marker',
		'test-convention',
		'conventions',
		'web-fetch',
		'issues',
	],
};

const dedupe = (items: readonly string[]): readonly string[] =>
	Array.from(new Set(items));

export const resolvePluginSet = (answers: IInitAnswers): readonly string[] => {
	const presetMembers = ORDERED_RESOLVED_PRESET_PLUGINS[answers.preset];
	const merged = dedupe([...presetMembers, ...answers.extraPlugins]);
	return merged.filter((p) => !answers.excludedPlugins.includes(p));
};

/** Renders `mcp-vertex.config.json` with the chosen preset + plugins. */
export const renderMcpVertexConfig = (
	answers: IInitAnswers,
	resolvedPlugins: readonly string[],
): IRenderedFile => {
	const pluginsBlock: Record<string, { options: Record<string, unknown> }> =
		{};
	for (const plugin of resolvedPlugins) {
		pluginsBlock[plugin] = { options: {} };
	}
	const config = {
		$schema:
			'https://unpkg.com/@mcp-vertex/core/schema/mcp-vertex.config.schema.json',
		cacheDir: '.cache/mcp-vertex',
		docsDir: 'docs/mcp-vertex',
		plugins: pluginsBlock,
	};
	return {
		relPath: 'mcp-vertex.config.json',
		content: `${JSON.stringify(config, null, '\t')}\n`,
	};
};

/** Renders `.vscode/mcp.json` with the canonical launch shape. */
export const renderVscodeMcpJson = (): IRenderedFile => {
	const args = [
		'/home/cartago/_proyectos/propios/mcp-vertex/tools/scripts/host/host-server.script.ts',
		'--workspace=${workspaceFolder}',
		'--config=${workspaceFolder}/mcp-vertex.config.json',
	];
	const content = {
		servers: {
			'mcp-vertex': {
				type: 'stdio',
				command: 'bun',
				args,
			},
		},
	};
	return {
		relPath: '.vscode/mcp.json',
		content: `${JSON.stringify(content, null, '\t')}\n`,
	};
};

const AGENT_ROLES: ReadonlyArray<{
	role: string;
	description: string;
	tools: readonly string[];
	body: string;
}> = [
	{
		role: 'orchestrator',
		description: 'Orquestador multi-agente de mcp-vertex',
		tools: [
			'mcp-vertex_proposals_auto_work',
			'mcp-vertex_proposals_compact_status',
			'mcp-vertex_proposals_proposal_board',
		],
		body:
			'Para tareas de implementación, delega a mcp-vertex usando auto_work.\n' +
			'Para ver el estado del swarm, usa compact_status o proposal_board.',
	},
	{
		role: 'proposal-guardian',
		description: 'Higiene y planificación de propuestas',
		tools: [
			'mcp-vertex_proposals_create_proposal',
			'mcp-vertex_proposals_plan',
			'mcp-vertex_proposals_proposal_adopt',
		],
		body:
			'Crea propuestas antes de implementar. Ejecuta plan para validar\n' +
			'disjointness de slices. Usa proposal_adopt para dar de alta carpetas existentes.',
	},
	{
		role: 'technical-investigator',
		description: 'Investigación técnica focalizada',
		tools: [
			'mcp-vertex_proposals_delegate',
			'mcp-vertex_search_search',
			'mcp-vertex_docs_docs_read',
		],
		body:
			'Investiga código del workspace usando las tools de mcp-vertex.\n' +
			'Para análisis profundo, prefiere delegate con agent=technical_investigator.',
	},
	{
		role: 'implementation-runner',
		description: 'Ejecutor de slices (escritura atómica con locks)',
		tools: [
			'mcp-vertex_fs_write',
			'mcp-vertex_fs_read',
			'mcp-vertex_search_search',
		],
		body:
			'Implementa slices aislados. Antes de escribir, verifica que ningún\n' +
			'otro agente tiene el lock del archivo. Usa fs_write con createDirs=true.',
	},
	{
		role: 'delivery-verifier',
		description: 'Verificador de aceptación y gates',
		tools: [
			'mcp-vertex_quality_run_quality',
			'mcp-vertex_proposals_proposal_review',
		],
		body:
			'Verifica acceptance criteria de cada slice. Ejecuta quality_run_quality\n' +
			'antes de aprobar. Usa proposal_review con approve solo si el slice pasa gates.',
	},
];

/** S3 — render `.github/agents/mcp-vertex-<role>.agent.md`. */
export const renderAgentFiles = (): readonly IRenderedFile[] =>
	AGENT_ROLES.map(({ role, description, tools, body }) => {
		const frontmatter = [
			'---',
			`name: mcp-vertex-${role}`,
			`description: ${description}`,
			`tools: [${tools.map((t) => `"${t}"`).join(', ')}]`,
			'---',
		].join('\n');
		return {
			relPath: `.github/agents/mcp-vertex-${role}.agent.md`,
			content: `${frontmatter}\n\n${body}\n`,
		};
	});

const HOST_INSTRUCTIONS_BLOCKS: ReadonlyArray<{
	relPath: string;
	begin: string;
	end: string;
	body: string;
}> = [
	{
		relPath: 'AGENTS.md',
		begin: '<!-- mcp-vertex:begin -->',
		end: '<!-- mcp-vertex:end -->',
		body:
			'# mcp-vertex host hints (auto-generated)\n\n' +
			'See `docs/mcp-vertex/host-hints/agents.generated.md` for the live agent catalog.',
	},
	{
		relPath: 'CLAUDE.md',
		begin: '<!-- mcp-vertex:begin -->',
		end: '<!-- mcp-vertex:end -->',
		body:
			'# mcp-vertex host hints (auto-generated)\n\n' +
			'See `docs/mcp-vertex/host-hints/claude.generated.md` for the live agent catalog.',
	},
	{
		relPath: '.github/copilot-instructions.md',
		begin: '<!-- mcp-vertex:begin -->',
		end: '<!-- mcp-vertex:end -->',
		body:
			'# mcp-vertex host hints (auto-generated)\n\n' +
			'See `docs/mcp-vertex/host-hints/copilot-instructions.generated.md` for the live agent catalog.',
	},
];

/** S4 — render host-instructions centralizer blocks (append mode). */
export const renderHostInstructionsBlocks = (): readonly IRenderedFile[] =>
	HOST_INSTRUCTIONS_BLOCKS.map(({ relPath, begin, end, body }) => ({
		relPath,
		content: `${begin}\n\n${body}\n\n${end}\n`,
	}));

/** Top-level orchestrator. Pure: returns the bundle, never writes. */
export const renderInitBundle = (answers: IInitAnswers): IRenderedBundle => {
	const resolvedPlugins = resolvePluginSet(answers);
	const files: IRenderedFile[] = [
		renderMcpVertexConfig(answers, resolvedPlugins),
		renderVscodeMcpJson(),
	];
	if (answers.generateAgentMd) files.push(...renderAgentFiles());
	if (answers.hostInstructions !== 'skip') {
		files.push(...renderHostInstructionsBlocks());
	}
	const summary = [
		`preset: ${answers.preset}`,
		`resolved plugins (${resolvedPlugins.length}): ${resolvedPlugins.join(', ')}`,
		`host-instructions: ${answers.hostInstructions}`,
		`copy core skills: ${answers.copyCoreSkills}`,
		`generate .agent.md: ${answers.generateAgentMd}`,
		`migration offer: ${answers.migrateFromLegacy}`,
	].join('\n');
	return { files, summary };
};

export { join };
