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
import { detectTargetProject, withDetection } from './init-detection';
import { collectInitAnswers } from './init-prompts';
import { renderInitBundle } from './init-render';
import { writeMcpVertexConfig, writeWorkspaceText } from './init-writers';

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
		const bundle = await renderInitBundle(answers);

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
				const result = await writeMcpVertexConfig(
					answers.workspaceRoot,
					parsed,
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
