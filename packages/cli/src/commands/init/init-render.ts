/**
 * f00084 S2 + S3 + S4 + S5 — render the bootstrap bundle.
 *
 * Pure functions: each `render*` takes the answers and returns a list
 * of `{ path, content }` pairs ready to feed `init-writers.ts`. The
 * command is the only place that touches the file system.
 */
import { join } from 'node:path';

import { loadAgentDescriptors } from './init-catalog';
import {
	computeHostInstructionsWrite,
	readHostInstructionsFile,
} from './init-host-instructions';
import { renderMigrationProposal } from './init-migrate-offer';
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

const renderAgentFile = (descriptor: {
	role: string;
	description: string;
	tools: readonly string[];
	body: string;
}): IRenderedFile => {
	const frontmatter = [
		'---',
		`name: mcp-vertex-${descriptor.role}`,
		`description: ${descriptor.description}`,
		`tools: [${descriptor.tools.map((t) => `"${t}"`).join(', ')}]`,
		'---',
	].join('\n');
	return {
		relPath: `.github/agents/mcp-vertex-${descriptor.role}.agent.md`,
		content: `${frontmatter}\n\n${descriptor.body}\n`,
	};
};

/** S3 — render `.github/agents/mcp-vertex-<role>.agent.md` from the live catalog. */
export const renderAgentFiles = async (
	workspaceRoot: string,
): Promise<readonly IRenderedFile[]> => {
	const descriptors = await loadAgentDescriptors(workspaceRoot);
	return descriptors.map(renderAgentFile);
};

const HOST_INSTRUCTIONS_BLOCKS: ReadonlyArray<{
	relPath: string;
	body: string;
}> = [
	{
		relPath: 'AGENTS.md',
		body:
			'# mcp-vertex host hints (auto-generated)\n\n' +
			'See `docs/mcp-vertex/host-hints/agents.generated.md` for the live agent catalog.',
	},
	{
		relPath: 'CLAUDE.md',
		body:
			'# mcp-vertex host hints (auto-generated)\n\n' +
			'See `docs/mcp-vertex/host-hints/claude.generated.md` for the live agent catalog.',
	},
	{
		relPath: '.github/copilot-instructions.md',
		body:
			'# mcp-vertex host hints (auto-generated)\n\n' +
			'See `docs/mcp-vertex/host-hints/copilot-instructions.generated.md` for the live agent catalog.',
	},
];

/**
 * S4 — render host-instructions blocks honouring idempotent append.
 * When the file already has a `<!-- mcp-vertex:begin -->` /
 * `<!-- mcp-vertex:end -->` block, the block is replaced in place;
 * otherwise the block is appended.
 */
export const renderHostInstructionsBlocks = async (
	workspaceRoot: string,
	mode: 'append' | 'overwrite' | 'skip',
): Promise<readonly IRenderedFile[]> => {
	if (mode === 'skip') return [];
	const out: IRenderedFile[] = [];
	for (const target of HOST_INSTRUCTIONS_BLOCKS) {
		const current = await readHostInstructionsFile(
			workspaceRoot,
			target.relPath,
		);
		const next = computeHostInstructionsWrite(current, target.body, mode);
		if (next === undefined) continue;
		out.push({ relPath: target.relPath, content: next });
	}
	return out;
};

/** S5 — render the first migration proposal when the user opted in. */
export const renderMigrationProposalIfRequested = (
	answers: IInitAnswers,
): readonly IRenderedFile[] => {
	if (!answers.migrateFromLegacy) return [];
	return [renderMigrationProposal(answers)];
};

/** Top-level orchestrator. Reads catalog live; pure on the rest of the inputs. */
export const renderInitBundle = async (
	answers: IInitAnswers,
): Promise<IRenderedBundle> => {
	const resolvedPlugins = resolvePluginSet(answers);
	const files: IRenderedFile[] = [
		renderMcpVertexConfig(answers, resolvedPlugins),
		renderVscodeMcpJson(),
	];
	if (answers.generateAgentMd) {
		files.push(...(await renderAgentFiles(answers.workspaceRoot)));
	}
	files.push(
		...(await renderHostInstructionsBlocks(
			answers.workspaceRoot,
			answers.hostInstructions,
		)),
	);
	files.push(...renderMigrationProposalIfRequested(answers));
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
