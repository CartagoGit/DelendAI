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
 */
import { EXIT_CODE } from '../../contracts/constants/exit-code.constant';
import type {
	ICliCommand,
	ICliCommandResult,
} from '../../contracts/interfaces/cli-command.interface';
import {
	HostEntryNotFoundError,
	resolveHostEntryPath,
} from './host-entry-resolver';
import { detectTargetProject, withDetection } from './init-detection';
import { collectInitAnswers } from './init-prompts';
import { renderInitBundle } from './init-render';
import { writeMcpVertexConfig, writeWorkspaceText } from './init-writers';

const applyExtraOptions = (
	config: Record<string, unknown>,
	extraOptions: Record<string, Record<string, unknown>>,
): Record<string, unknown> => {
	const plugins = config.plugins;
	if (plugins === undefined || typeof plugins !== 'object' || plugins === null) {
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
		const typedPluginConfig = pluginConfig as { options?: Record<string, unknown> };
		typedPluginConfig.options ??= {};
		for (const [key, value] of Object.entries(overrides)) {
			typedPluginConfig.options[key] = value;
		}
	}
	return config;
};

const parseFlags = (
	args: readonly string[],
): {
	dryRun: boolean;
	force: boolean;
	mcpVertexRoot?: string;
	pluginPathsRoot?: string;
} => {
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

export const initCommand: ICliCommand = {
	name: 'init',
	summary: 'Interactive workspace bootstrap for mcp-vertex.',
	usage: 'init [--dry-run] [--force]',
	run: async (args, ctx): Promise<ICliCommandResult> => {
		const { dryRun, force, mcpVertexRoot, pluginPathsRoot } =
			parseFlags(args);
		// f00088 S1: detect the target project shape BEFORE the
		// prompts run, so the operator sees "✓ detected: typescript +
		// angular + bun + yarn-workspaces" at the top of the prompt
		// flow. The detection is wrapped in `try/catch` so an analyzer
		// failure never aborts the bootstrap — we fall through with
		// `detected: undefined` and the legacy greenfield path runs.
		let preAnswers;
		try {
			preAnswers = await withDetection(
				{
					preset: 'swarm',
					extraPlugins: [],
					excludedPlugins: [],
					hostInstructions: 'append',
					copyCoreSkills: true,
					generateAgentMd: true,
					migrateFromLegacy: true,
					force,
					workspaceRoot: ctx.cwd,
				},
				ctx.cwd,
				pluginPathsRoot !== undefined
					? { explicitPluginPathsRoot: pluginPathsRoot }
					: {},
			);
		} catch {
			preAnswers = undefined;
		}
		const answers = await collectInitAnswers(ctx.cwd, {
			force,
			workspaceRoot: ctx.cwd,
			detected: preAnswers?.detected,
		});
		// f00088 S2: resolve the host entry path before rendering.
		// When `--mcp-vertex-root` is set, it wins; otherwise we
		// probe the consumer's workspace in priority order
		// (`node_modules/@mcp-vertex/core/...`, `dist/host/...`,
		// `../mcp-vertex/...`). A typed error surfaces the hint when
		// nothing matches.
		let hostEntryPath: string;
		try {
			const resolved = resolveHostEntryPath(
				ctx.cwd,
				mcpVertexRoot !== undefined
					? { explicitRoot: mcpVertexRoot }
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

		if (dryRun) {
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
				const parsed = JSON.parse(file.content) as Record<
					string,
					unknown
				>;
				const withOverrides =
					ctx.globals.extraOptions === undefined
						? parsed
						: applyExtraOptions(parsed, ctx.globals.extraOptions);
				const result = await writeMcpVertexConfig(
					answers.workspaceRoot,
					withOverrides,
					force,
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

		return {
			code: EXIT_CODE.OK,
			data: { ok: true, written, summary: bundle.summary },
		};
	},
};
