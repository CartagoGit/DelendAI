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
import { collectInitAnswers } from './init-prompts';
import { renderInitBundle } from './init-render';
import { writeMcpVertexConfig, writeWorkspaceText } from './init-writers';

const parseFlags = (
	args: readonly string[],
): { dryRun: boolean; force: boolean } => {
	const out = { dryRun: false, force: false };
	for (const arg of args) {
		if (arg === '--dry-run') out.dryRun = true;
		else if (arg === '--force') out.force = true;
	}
	return out;
};

export const initCommand: ICliCommand = {
	name: 'init',
	summary: 'Interactive workspace bootstrap for mcp-vertex.',
	usage: 'init [--dry-run] [--force]',
	run: async (args, ctx): Promise<ICliCommandResult> => {
		const { dryRun, force } = parseFlags(args);
		const answers = await collectInitAnswers(ctx.cwd, {
			force,
			workspaceRoot: ctx.cwd,
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
