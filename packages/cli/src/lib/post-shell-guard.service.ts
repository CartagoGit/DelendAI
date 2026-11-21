/**
 * post-shell-guard.service.ts — `delendai guard post-shell`, the hook a
 * host runs after every shell command.
 *
 * The pre-edit hook cannot see a heredoc or `open().write()`: a shell
 * command is opaque until it has run. So the check comes after it. An
 * agent that holds a unit and left loose edits in the shared checkout has
 * them kept under a ref and the checkout restored at once, and is told
 * which unit worktree to write in. Claude Code shows a PostToolUse hook's
 * stderr to the agent when the hook exits 2. A clean checkout costs one
 * `git status` with optional locks off and prints nothing (x01052).
 */
import {
	agentFor,
	EXIT_CODE,
	readWorkspacePolicy,
	rescueAfterShell,
} from '@delendai/core/cli';

import type { ICliCommandResult } from '../contracts/interfaces/cli-command.interface';
import { SHELL_TOOLS } from '../contracts/constants/pre-edit-guard.constant';

/** Judge one finished shell tool call, as the host's post hook hands it over. */
export const judgePostShell = async (input: {
	readonly stdin: string;
	readonly workspace: string;
}): Promise<ICliCommandResult> => {
	let call: unknown;
	try {
		call = JSON.parse(input.stdin);
	} catch {
		return { code: EXIT_CODE.OK };
	}
	if (call === null || typeof call !== 'object')
		return { code: EXIT_CODE.OK };
	const { tool_name: tool, cwd: given } = call as {
		readonly tool_name?: unknown;
		readonly cwd?: unknown;
	};
	if (typeof tool !== 'string' || !SHELL_TOOLS.includes(tool))
		return { code: EXIT_CODE.OK };
	const policy = await readWorkspacePolicy(input.workspace);
	const verdict = rescueAfterShell({
		cwd: typeof given === 'string' ? given : input.workspace,
		agent: agentFor([], input.workspace, policy.identity),
		policy,
	});
	if (verdict.outcome === 'none') return { code: EXIT_CODE.OK };
	return {
		code: EXIT_CODE.USAGE,
		error: `delendai guard (post-shell): ${verdict.message ?? ''}`,
	};
};
