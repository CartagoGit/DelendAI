/**
 * f00084 S2 — `init` command entrypoint.
 *
 * Registers as a top-level CLI command (`mcpv init`). The `run` step:
 *   1. Collects answers (S1 schema, S2 prompts).
 *   2. Renders the bundle (S2 render).
 *   3. Writes the bundle via the safe-writer primitives (S2 writers).
 *   4. Prints the summary as plain text (or JSON when --json).
 *
 * S5 (migration offer) and S6 (e2e) live in their own modules and are
 * scheduled in a follow-up slice; this command provides the hook for them.
 *
 * The shared render+write runner (`runInitWithAnswers`) is also
 * consumed by `init:default` (f00103) — that command skips the
 * interactive prompts and pre-bakes the operator's chosen defaults.
 */
import { EXIT_CODE } from '../../contracts/constants/exit-code.constant';
import type {
	ICliCommand,
	ICliCommandContext,
	ICliCommandResult,
} from '../../contracts/interfaces/cli-command.interface';
import {
	HostEntryNotFoundError,
	resolveHostEntryPath,
} from '../../lib/init/host-entry-resolver.service';
import { detectTargetProject } from '../../lib/init/init-detection.service';
import { collectInitAnswers } from '../../lib/init/init-prompts.service';
import { renderInitBundle } from '../../lib/init/init-render.service';
import {
	writeMcpVertexConfig,
	writeVscodeMcpJson,
	writeWorkspaceText,
} from '../../lib/init/init-writers.factory';
import type { IInitAnswers } from '../../lib/init/init-answers.types';
import { InitAnswers } from '../../lib/init/init-answers.schema';
import { printInitHumanSummary } from '../../lib/init/init-human-summary.service';
import { COLOR_ON } from '../../lib/color';
import { join } from 'node:path';

/** Flags shared by `init` and `init:default`. */
export interface IInitFlags {
	readonly dryRun: boolean;
	readonly force: boolean;
	readonly mcpVertexRoot?: string;
	readonly pluginPathsRoot?: string;
}

const applyExtraOptions = (
	config: Record<string, unknown>,
	extraOptions: Record<string, Record<string, unknown>>,
): Record<string, unknown> => {
	const plugins = config.plugins;
	if (
		plugins === undefined ||
		typeof plugins !== 'object' ||
		plugins === null
	) {
		return config;
	}
	for (const [pluginId, overrides] of Object.entries(extraOptions)) {
		const pluginConfig = (plugins as Record<string, unknown>)[pluginId];
		if (
			pluginConfig === undefined ||
			typeof pluginConfig !== 'object' ||
			pluginConfig === null
		) {
			process.stderr.write(
				`warning: init override ignored for unresolved plugin "${pluginId}"\n`,
			);
			continue;
		}
		const typedPluginConfig = pluginConfig as {
			options?: Record<string, unknown>;
		};
		typedPluginConfig.options ??= {};
		for (const [key, value] of Object.entries(overrides)) {
			typedPluginConfig.options[key] = value;
		}
	}
	return config;
};

export const parseFlags = (args: readonly string[]): IInitFlags => {
	const out: {
		dryRun: boolean;
		force: boolean;
		mcpVertexRoot?: string;
		pluginPathsRoot?: string;
	} = { dryRun: false, force: false };
	for (const arg of args) {
		if (arg === '--dry-run') out.dryRun = true;
		else if (arg === '--force') out.force = true;
		else if (arg.startsWith('--mcp-vertex-root='))
			out.mcpVertexRoot = arg.slice('--mcp-vertex-root='.length);
		else if (arg.startsWith('--plugin-paths-root='))
			out.pluginPathsRoot = arg.slice('--plugin-paths-root='.length);
	}
	return out;
};

/**
 * Run detection against the target workspace and decorate a partial
 * answers object with the result. Pure-ish — only does IO through
 * `detectTargetProject`, whose own surface already swallows analyzer
 * failures. Used by both `init` (interactive) and `init:default`
 * (non-interactive) so detection runs exactly once per invocation.
 */
export const detectAndDecorateAnswers = async (
	workspaceRoot: string,
	flags: IInitFlags,
	partial: Partial<IInitAnswers>,
): Promise<IInitAnswers> => {
	let detected: IInitAnswers['detected'];
	try {
		const d = await detectTargetProject(
			workspaceRoot,
			flags.pluginPathsRoot !== undefined
				? { explicitPluginPathsRoot: flags.pluginPathsRoot }
				: {},
		);
		detected = {
			language: d.language,
			framework: d.framework,
			packageManager: d.packageManager,
			monorepoTool: d.monorepoTool,
			hasMcpProject: d.hasMcpProject,
			mcpEvidence: [...d.mcpEvidence],
			pluginPathsRoot: d.pluginPathsRoot,
			sourceRoot: d.sourceRoot,
			hostEntryPath: d.hostEntryPath,
			hostEntrySource: d.hostEntrySource,
		};
	} catch {
		detected = undefined;
	}
	return InitAnswers.parse({
		workspaceRoot,
		force: flags.force,
		...(detected !== undefined ? { detected } : {}),
		...partial,
	});
};

/**
 * Shared runner consumed by both `init` (interactive) and `init:default`
 * (non-interactive). Takes pre-built answers (already merged with
 * detection by `detectAndDecorateAnswers`) and runs:
 *   1. Host-entry path resolution (S2, f00088).
 *   2. Bundle render (S2-S5).
 *   3. Dry-run / write dispatch (writers.ts).
 *
 * The function NEVER prompts — pure rendering + writing pipeline. The
 * `ctx.globals.extraOptions` overrides (`--options-<plugin>-<k>=<v>`)
 * are applied to the rendered config block before writing.
 */
export const runInitWithAnswers = async (
	ctx: ICliCommandContext,
	flags: IInitFlags,
	answers: IInitAnswers,
): Promise<ICliCommandResult> => {
	// f00088 S2: resolve the host entry path before rendering. When
	// `--mcp-vertex-root` is set, it wins; otherwise we probe the
	// consumer's workspace in priority order (node_modules, dist,
	// sibling mcp-vertex/, sibling mcp-vertex-core/). A typed error
	// surfaces the hint when nothing matches.
	let hostEntryPath: string;
	try {
		const resolved = resolveHostEntryPath(
			ctx.cwd,
			flags.mcpVertexRoot !== undefined
				? { explicitRoot: flags.mcpVertexRoot }
				: {},
		);
		hostEntryPath = resolved.path;
	} catch (error) {
		if (error instanceof HostEntryNotFoundError) {
			return {
				code: EXIT_CODE.NOT_FOUND,
				data: {
					ok: false,
					error: { reason: error.message, nextAction: 'retry' },
					attempted: error.attempted,
				},
			};
		}
		throw error;
	}
	const bundle = await renderInitBundle(answers, { hostEntryPath });

	if (flags.dryRun) {
		if (!ctx.globals.json) {
			printInitHumanSummary({
				answers,
				written: bundle.files.map((f) => ({
					path: join(answers.workspaceRoot, f.relPath),
					kind: 'written' as const,
				})),
				dryRun: true,
			});
		}
		return {
			code: EXIT_CODE.OK,
			data: {
				ok: true,
				dryRun: true,
				files: bundle.files,
				summary: bundle.summary,
			},
		};
	}

	const written: Array<{ path: string; kind: string }> = [];
	for (const file of bundle.files) {
		if (file.relPath === 'mcp-vertex.config.json') {
			const parsed = JSON.parse(file.content) as Record<string, unknown>;
			const withOverrides =
				ctx.globals.extraOptions === undefined
					? parsed
					: applyExtraOptions(parsed, ctx.globals.extraOptions);
			const result = await writeMcpVertexConfig(
				answers.workspaceRoot,
				withOverrides,
				answers.force,
			);
			written.push({ path: result.path, kind: result.kind });
			continue;
		}
		// `.vscode/mcp.json` is the only other file that needs a
		// merge-aware writer: the operator may already have other
		// MCP servers wired up (filesystem, github, docker, …) and
		// we must not silently overwrite them. `writeVscodeMcpJson`
		// reads the existing document, upserts the `mcp-vertex`
		// entry, and preserves everything else. See the writer for
		// the three-way outcome (`written` / `merged` / `exists`).
		if (file.relPath === '.vscode/mcp.json') {
			const hostEntryPath = answers.detected?.hostEntryPath ?? '';
			const result = await writeVscodeMcpJson(
				answers.workspaceRoot,
				hostEntryPath,
				answers.hostInstructions,
			);
			written.push({ path: result.path, kind: result.kind });
			continue;
		}
		const mode = answers.hostInstructions;
		const result = await writeWorkspaceText(
			answers.workspaceRoot,
			file.relPath,
			file.content,
			mode,
		);
		written.push({ path: result.path, kind: result.kind });
	}

	if (!ctx.globals.json) {
		printInitHumanSummary({
			answers,
			written: written.map((w) => ({
				path: w.path,
				kind: w.kind as 'written' | 'exists' | 'skipped',
			})),
			dryRun: false,
		});
	}

	return {
		code: EXIT_CODE.OK,
		data: { ok: true, written, summary: bundle.summary },
	};
};

export const initCommand: ICliCommand = {
	name: 'init',
	summary: 'Interactive workspace bootstrap for mcp-vertex.',
	usage: 'init [--dry-run] [--force] [--mcp-vertex-root=<path>] [--plugin-paths-root=<path>]',
	run: async (args, ctx): Promise<ICliCommandResult> => {
		const flags = parseFlags(args);
		// Detect first so the prompts can show the operator what was
		// found before the first question renders.
		const detectedAnswers = await detectAndDecorateAnswers(ctx.cwd, flags, {
			preset: 'swarm',
			extraPlugins: [],
			excludedPlugins: [],
			hostInstructions: 'append',
			copyCoreSkills: true,
			generateAgentMd: true,
			migrateFromLegacy: true,
		});
		// Run the interactive prompts — the operator can override any
		// default the detector populated.
		const answers = await collectInitAnswers(ctx.cwd, {
			...detectedAnswers,
			force: flags.force,
			workspaceRoot: ctx.cwd,
		});
		return runInitWithAnswers(ctx, flags, answers);
	},
};
