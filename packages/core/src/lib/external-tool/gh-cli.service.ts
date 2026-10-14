import { GH_CLI_TOOL } from './known-tools.constant';
import { runExternalTool } from './run-external-tool';

/** The flattened `gh` run outcome exposed to plugin callers. */
export interface IGhCliRun {
	readonly ok: boolean;
	readonly code: number;
	readonly stdout: string;
	readonly stderr: string;
}

/**
 * Shared `gh` adapter: wraps the authenticated GitHub CLI through the
 * external-tool runner, redacts `--body` values, and returns the
 * flattened run outcome. GitHub-facing plugins call this instead of
 * each writing their own `runExternalTool({ tool: GH_CLI_TOOL, ... })`
 * block, which keeps the descriptor, the redaction policy and the
 * outcome projection in one place.
 */
export const runGhCli = async (
	args: readonly string[],
	options?: { readonly cwd?: string | undefined },
): Promise<IGhCliRun> => {
	const run = await runExternalTool({
		tool: GH_CLI_TOOL,
		args,
		...(options?.cwd !== undefined ? { cwd: options.cwd } : {}),
		redact: ['--body'],
	});
	return {
		ok: run.ok,
		code: run.code,
		stdout: run.stdout,
		stderr: run.stderr,
	};
};
