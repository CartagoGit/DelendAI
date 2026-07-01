/**
 * f00084 S2 + S3 + S4 + S5 — render the bootstrap bundle.
 *
 * Pure functions: each `render*` takes the answers and returns a list
 * of `{ path, content }` pairs ready to feed `init-writers.ts`. The
 * command is the only place that touches the file system.
 */
import { join } from 'node:path';

import {
	resolvePluginOptions,
	resolvePresetMembers,
} from '@mcp-vertex/core/public';

import { loadAgentDescriptors } from './init-catalog';
import {
	computeHostInstructionsWrite,
	readHostInstructionsFile,
} from './init-host-instructions';
import { renderAdoptionPlan } from './init-migrate-offer';
import type { IInitAnswers } from './init-answers.schema';
import type { IFileReader } from './init-detection';
import {
	createWorkspaceFileReader,
	createWorkspacePathProvider,
} from '@mcp-vertex/core/public';

export type IRenderedFile = {
	readonly relPath: string;
	readonly content: string;
};

export type IRenderedBundle = {
	readonly files: readonly IRenderedFile[];
	readonly summary: string;
};

// Single source of truth for preset membership lives in
// `@mcp-vertex/core`'s preset catalog. We delegate to
// `resolvePresetMembers` so adding a new preset (`vertex`, …)
// only requires editing the catalog and the test specs — this
// file stays free of plugin-name vocabulary.
const resolveOrderedPresetPlugins = (
	preset: IInitAnswers['preset'],
): readonly string[] => resolvePresetMembers(preset);

const dedupe = (items: readonly string[]): readonly string[] =>
	Array.from(new Set(items));

const resolvePluginOptionsWithAnswers = (
	pluginId: string,
	answers: IInitAnswers,
	resolvedPlugins: ReadonlySet<string>,
): Record<string, unknown> => {
	const resolved = resolvePluginOptions(pluginId);
	if (
		pluginId === 'issues' &&
		resolvedPlugins.has('issues') &&
		answers.issuesRepo !== undefined
	) {
		resolved.repo = answers.issuesRepo;
	}
	if (
		pluginId === 'web-fetch' &&
		resolvedPlugins.has('web-fetch') &&
		answers.webFetchAllowList !== undefined
	) {
		resolved.allowList = [...answers.webFetchAllowList];
	}
	return resolved;
};

export const resolvePluginSet = (answers: IInitAnswers): readonly string[] => {
	const presetMembers = resolveOrderedPresetPlugins(answers.preset);
	const merged = dedupe([...presetMembers, ...answers.extraPlugins]);
	return merged.filter((p) => !answers.excludedPlugins.includes(p));
};

/** Renders `mcp-vertex.config.json` with the chosen preset + plugins. */
export const renderMcpVertexConfig = (
	answers: IInitAnswers,
	resolvedPlugins: readonly string[],
): IRenderedFile => {
	const resolvedPluginSet = new Set(resolvedPlugins);
	const pluginsBlock: Record<string, { options: Record<string, unknown> }> =
		{};
	for (const plugin of resolvedPlugins) {
		pluginsBlock[plugin] = {
			options: resolvePluginOptionsWithAnswers(
				plugin,
				answers,
				resolvedPluginSet,
			),
		};
	}
	const config: Record<string, unknown> = {
		$schema:
			'https://unpkg.com/@mcp-vertex/core/schema/mcp-vertex.config.schema.json',
		cacheDir: '.cache/mcp-vertex',
		docsDir: 'docs/mcp-vertex',
		plugins: pluginsBlock,
	};
	// f00088 S4: when the S1 detector picked a non-default
	// `pluginPathsRoot`, record it in a `convention` block so
	// `tools/scripts/create-plugin.ts` (f00087 S2) and any
	// downstream tool that wants to scaffold code under the
	// project's natural root can read it. The block is advisory
	// only — the loader ignores it.
	if (
		answers.detected !== undefined &&
		answers.detected.pluginPathsRoot !== 'plugins'
	) {
		config.convention = {
			pluginPathsRoot: answers.detected.pluginPathsRoot,
			sourceRoot: answers.detected.sourceRoot,
		};
	}
	return {
		relPath: 'mcp-vertex.config.json',
		content: `${JSON.stringify(config, null, '\t')}\n`,
	};
};

/** Renders `.vscode/mcp.json` with the canonical launch shape. */
export const renderVscodeMcpJson = (hostEntryPath: string): IRenderedFile => {
	const args = [
		hostEntryPath,
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
	options: {
		readonly namespacePrefix?: string;
		readonly locale?: string;
	} = {},
): Promise<readonly IRenderedFile[]> => {
	const descriptors = await loadAgentDescriptors(workspaceRoot, options);
	return descriptors.map(renderAgentFile);
};

// f00092: the 3-fragment model collapsed to a single canonical fragment.
// The host-specific footnote now lives inline in each hand-edited host
// file (between its `<!-- mcp-vertex:begin -->` / `<!-- mcp-vertex:end -->`
// markers), so the same canonical body is written into the 3 host files
// and the footnote is appended per host by `hostFootnoteFor()`.
const HOST_INSTRUCTIONS_CANONICAL_BODY =
	'# mcp-vertex host hints (auto-generated)\n\n' +
	'See `docs/mcp-vertex/host-hints/agent-instructions.generated.md` for the live agent catalog.';

const HOST_INSTRUCTIONS_TARGETS: ReadonlyArray<{
	relPath: string;
	host: 'copilot' | 'claude' | 'agents';
}> = [
	{ relPath: '.github/copilot-instructions.md', host: 'copilot' },
	{ relPath: 'CLAUDE.md', host: 'claude' },
	{ relPath: 'AGENTS.md', host: 'agents' },
];

// f00092: the 1-line footnote that used to live in each per-host fragment.
// The footnote is host-specific by definition (it says "this appendix is
// in effect for you") so it belongs in the hand-edited host file, where
// the rest of the host file already lives.
const HOST_FOOTNOTE: Readonly<Record<'copilot' | 'claude' | 'agents', string>> =
	{
		copilot: '- Bootstrap §8.1 (Copilot close-marker contract) is in effect.',
		claude: '- Bootstrap §8.2 (keep the main thread cheap) is in effect.',
		agents: '- Bootstrap §7 (repo-level rules) is in effect.',
	};

const hostFootnoteFor = (host: 'copilot' | 'claude' | 'agents'): string =>
	`\n\n${HOST_FOOTNOTE[host]}`;

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
	for (const target of HOST_INSTRUCTIONS_TARGETS) {
		const body = `${HOST_INSTRUCTIONS_CANONICAL_BODY}${hostFootnoteFor(target.host)}`;
		const current = await readHostInstructionsFile(
			workspaceRoot,
			target.relPath,
		);
		const next = computeHostInstructionsWrite(current, body, mode);
		if (next === undefined) continue;
		out.push({ relPath: target.relPath, content: next });
	}
	return out;
};

/**
 * S5 + f00089 U1 — render the adoption-plan proposal when the user opted
 * in. The generator detects the target's foreign proposal system and
 * allocates the next free id (no hardcoded `f00001`); it is advisory and
 * never rewrites the target's existing proposals in place.
 *
 * `reader` is injected so tests stay deterministic; the bundle
 * orchestrator wires it to the workspace filesystem.
 */
export const renderMigrationProposalIfRequested = async (
	answers: IInitAnswers,
	options: { readonly reader: IFileReader },
): Promise<readonly IRenderedFile[]> => {
	if (!answers.migrateFromLegacy) return [];
	const plan = await renderAdoptionPlan(answers, {
		reader: options.reader,
		ourPlugins: resolvePluginSet(answers),
	});
	return [{ relPath: plan.relPath, content: plan.content }];
};

/** Top-level orchestrator. Reads catalog live; pure on the rest of the inputs. */
export const renderInitBundle = async (
	answers: IInitAnswers,
	options: {
		readonly hostEntryPath: string;
		readonly reader?: IFileReader;
	} = { hostEntryPath: '' },
): Promise<IRenderedBundle> => {
	const reader: IFileReader =
		options.reader ??
		createWorkspaceFileReader(
			createWorkspacePathProvider(answers.workspaceRoot),
		);
	const resolvedPlugins = resolvePluginSet(answers);
	const files: IRenderedFile[] = [
		renderMcpVertexConfig(answers, resolvedPlugins),
		renderVscodeMcpJson(options.hostEntryPath),
	];
	if (answers.generateAgentMd) {
		files.push(
			...(await renderAgentFiles(answers.workspaceRoot, {
				locale: 'en',
			})),
		);
	}
	files.push(
		...(await renderHostInstructionsBlocks(
			answers.workspaceRoot,
			answers.hostInstructions,
		)),
	);
	// f00016: when the `proposals` plugin is in the resolved set,
	// seed the canonical 7 status folders with `.gitkeep` so the
	// f00016 state machine has somewhere to land a fresh proposal
	// even before the operator creates one. We never clobber a
	// folder that already exists (the writer skips "exists" on a
	// .gitkeep create — the .gitkeep itself is recreated only if
	// the folder is empty AND lacks the marker).
	//
	// Layout matches `PROPOSAL_STATUSES` in the proposals plugin
	// (`ready`, `in-progress`, `review`, `done`, `paused`,
	// `blocked`, `retired`). Keeping the list inline (not imported)
	// because `proposals` is opt-in and we don't want to fail the
	// init render when the plugin is absent.
	if (resolvedPlugins.includes('proposals')) {
		files.push(...renderProposalStatusFolders());
	}
	files.push(
		...(await renderMigrationProposalIfRequested(answers, { reader })),
	);
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

/**
 * f00016 — seed the canonical 7 proposal status folders.
 *
 * Each folder is rendered as a `{ relPath, content }` pair with
 * content = a `.gitkeep` file. The writer (`writeWorkspaceText`)
 * has overwrite-by-default for `.gitkeep` markers; the folder
 * itself is created via `mkdir -p` semantics on first write.
 *
 * Rel path: `<docsDir>/proposals/<status>/.gitkeep` where
 * `docsDir` is resolved through the canonical mcp-vertex default
 * (`docs/mcp-vertex`). This mirrors
 * `plugins/proposals/src/lib/contracts/constants/default-path-layout.constant.ts#DEFAULT_PATH_LAYOUT.proposalsDir`
 * so the seed lands exactly where the proposals plugin will look
 * for it.
 *
 * The CLI keeps a local mirror of the status list (instead of
 * importing from the plugin) because `proposals` is opt-in: the
 * CLI must build and run even when the plugin is absent. A
 * divergence between this list and the plugin's `PROPOSAL_STATUSES`
 * is caught by `init-render.spec.ts` (see the `proposals-folders
 * -match-plugin-statuses` test).
 */
export const PROPOSAL_STATUS_FOLDERS: readonly string[] = [
	'ready',
	'in-progress',
	'review',
	'done',
	'paused',
	'blocked',
	'retired',
];

/**
 * Mirror of `PROPOSAL_STATUSES` in
 * `plugins/proposals/src/lib/contracts/constants/proposal-glossary.constant.ts`.
 * Kept in sync by `init-render.spec.ts`; a runtime guard
 * (`assertProposalStatusFoldersAlign`) is exported so the build
 * fails loudly if the lists drift.
 */
export const renderProposalStatusFolders = (): readonly IRenderedFile[] =>
	PROPOSAL_STATUS_FOLDERS.map((folder) => ({
		relPath: `docs/mcp-vertex/proposals/${folder}/.gitkeep`,
		content:
			`# Keeps ${folder}/ in git even when empty.\n` +
			`# Required by the f00016 proposal state machine — proposals\n` +
			`# in the '${folder}' status live here. Safe to delete once a\n` +
			`# real proposal lands in this folder.\n`,
	}));
