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
	type IFileReader,
	createWorkspaceFileReader,
	createWorkspacePathProvider,
} from '@mcp-vertex/core/public';

import { loadAgentDescriptors } from './init-catalog.constant';
import {
	computeHostInstructionsWrite,
	readHostInstructionsFile,
} from './init-host-instructions.service';
import { renderSnapshotHostInstructionsProposal } from './init-host-snapshot.service';
import { renderAdoptionPlan } from './init-migrate-offer.service';
import type { IInitAnswers } from './init-answers.types';

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

/**
 * Render the canonical `mcp-vertex` server entry.
 *
 * Pure — no IO. The launcher args follow the same template that
 * `.vscode/mcp.json` has shipped since f00093 S2: the host entry
 * path is the first arg (resolved against the operator's
 * `--mcp-vertex-root`); the remaining two args use VS Code's
 * `${workspaceFolder}` substitution so the same launch line works
 * for any consumer checkout.
 */
export const renderMcpVertexServerEntry = (
	hostEntryPath: string,
): { readonly type: 'stdio'; readonly command: 'bun'; readonly args: readonly string[] } => ({
	type: 'stdio',
	command: 'bun',
	args: [
		hostEntryPath,
		'--workspace=${workspaceFolder}',
		'--config=${workspaceFolder}/mcp-vertex.config.json',
	],
});

/**
 * Render the `mcp-vertex` server entry as a plain JSON-friendly
 * object (mutable-typed for the merge step below).
 */
const renderMcpVertexServerEntryRaw = (
	hostEntryPath: string,
): { type: string; command: string; args: string[] } => ({
	type: 'stdio',
	command: 'bun',
	args: [
		hostEntryPath,
		'--workspace=${workspaceFolder}',
		'--config=${workspaceFolder}/mcp-vertex.config.json',
	],
});

/**
 * Merge the canonical `mcp-vertex` entry into an existing
 * `.vscode/mcp.json` document. Returns the new document content
 * (or `undefined` when the existing content is not parseable, in
 * which case the writer leaves the file untouched).
 *
 * Rules:
 *
 *   - Existing `servers` map is preserved verbatim; the canonical
 *     entry is upserted at `servers["mcp-vertex"]`. Every other
 *     server the operator has configured (filesystem, github,
 *     docker, …) stays as-is.
 *   - Top-level non-`servers` keys are preserved (inputs,
 *     `servers` references, IDE-specific extensions, etc.).
 *   - If the existing content is missing the `servers` key, one
 *     is created.
 *   - If the existing content does not parse as a JSON object, the
 *     merge is refused (the writer returns `kind: 'exists'` and
 *     surfaces a hint in stderr via the recap).
 *
 * The merge is intentionally shallow on the `servers` map only —
 * we don't try to interpret or rewrite any other field. Operators
 * who want their server entries mutated should edit the file
 * themselves; `init` should never silently destroy tool wiring.
 */
export const mergeMcpVertexServerEntry = (
	hostEntryPath: string,
	existingContent: string,
): string | undefined => {
	let parsed: unknown;
	try {
		parsed = JSON.parse(existingContent);
	} catch {
		return undefined;
	}
	if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
		return undefined;
	}
	const doc = parsed as Record<string, unknown>;
	const incoming = renderMcpVertexServerEntryRaw(hostEntryPath);
	const existingServers = doc.servers;
	const nextServers: Record<string, unknown> =
		existingServers !== undefined &&
		existingServers !== null &&
		typeof existingServers === 'object' &&
		!Array.isArray(existingServers)
			? { ...(existingServers as Record<string, unknown>) }
			: {};
	// The canonical entry uses `${workspaceFolder}` which VS Code
	// resolves per-workspace. If the existing entry already uses a
	// different hostEntryPath (e.g. the operator pointed at a
	// specific mcp-vertex checkout), we still overwrite it with the
	// freshly-resolved path — that's the point of running `init`
	// again: it brings the launcher up to date.
	nextServers['mcp-vertex'] = incoming;
	const next = { ...doc, servers: nextServers };
	return `${JSON.stringify(next, null, '\t')}\n`;
};

/** Renders `.vscode/mcp.json` with the canonical launch shape. */
export const renderVscodeMcpJson = (hostEntryPath: string): IRenderedFile => {
	const content = {
		servers: {
			'mcp-vertex': renderMcpVertexServerEntry(hostEntryPath),
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
	// f00093: snapshot pre-overwrite host-instructions into a `ready`
	// proposal whenever overwrite would replace non-canonical content.
	// Skipped for `append` / `skip` modes (the existing semantics) and
	// for empty workspaces (no audit trail for a no-op). Failures are
	// swallowed; the canonical overwrite always wins.
	try {
		const snapshot = await renderSnapshotHostInstructionsProposal(answers, {
			reader,
		});
		files.push(...snapshot);
	} catch (err) {
		process.stderr.write(
			`mcp-vertex › host-instructions snapshot skipped: ${(err as Error).message ?? err}\n`,
		);
	}
	// f00016: seed the canonical 7 status folders with `.gitkeep`
	// whenever the bootstrap is going to *touch* the proposals tree
	// at all. Two triggers qualify:
	//
	//   1. The `proposals` plugin is in the resolved set (the
	//      f00016 state machine will be live in this workspace).
	//   2. `migrateFromLegacy` is on (we're going to write a
	//      adoption-plan proposal into `proposals/ready/`, so the
	//      sibling folders must exist for the migration to land
	//      cleanly).
	//
	// Without this seed, projects using the `vertex` preset — which
	// is `independent: true` and does NOT bundle `proposals` —
	// would end up with a `proposals/ready/` directory full of
	// proposals but no `done/`, `in-progress/`, etc. folders. The
	// state machine would refuse to transition any proposal because
	// its target folder doesn't exist on disk.
	//
	// We never clobber an existing folder: the writer
	// (`writeWorkspaceText`) treats a `.gitkeep` overwrite as
	// idempotent — only the marker content is refreshed when the
	// folder is empty and lacks the marker.
	//
	// Layout matches `PROPOSAL_STATUSES` in the proposals plugin
	// (`ready`, `in-progress`, `review`, `done`, `paused`,
	// `blocked`, `retired`). The list is kept inline (not imported)
	// because `proposals` is opt-in and we don't want to fail the
	// init render when the plugin is absent. A drift between this
	// list and the plugin's `PROPOSAL_STATUSES` is caught by
	// `init-render.spec.ts`.
	if (
		resolvedPlugins.includes('proposals') ||
		answers.migrateFromLegacy === true
	) {
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
