import type { IExternalToolRun } from '../contracts/interfaces/external-tool.interface';
import { GH_CLI_TOOL } from './known-tools.constant';
import { runExternalTool } from './run-external-tool';

/**
 * Shared `gh` adapter: wraps the authenticated GitHub CLI through the
 * external-tool runner, redacts `--body` values, and returns the raw
 * run outcome. GitHub-facing plugins call this instead of each writing
 * their own `runExternalTool({ tool: GH_CLI_TOOL, ... })` block, which
 * keeps the descriptor + redaction policy in one place.
 */
export const runGhCli = async (
	args: readonly string[],
	options?: { readonly cwd?: string | undefined },
): Promise<IExternalToolRun> =>
	runExternalTool({
		tool: GH_CLI_TOOL,
		args,
		...(options?.cwd !== undefined ? { cwd: options.cwd } : {}),
		redact: ['--body'],
	});
