/**
 * pre-edit-guard.service.ts — `delendai guard pre-edit`, the editor-side
 * barrier a host runs before an edit tool writes a file.
 *
 * Claude Code's PreToolUse hook hands the tool call over as JSON on stdin
 * and blocks it when the hook exits with 2, showing the hook's stderr to
 * the agent. An edit by an agent that holds a unit, to a path in the
 * repository outside that unit's worktree, is refused there; everything
 * else passes, and so does a call this cannot read (x01003).
 */
import {
	agentFor,
	editOutsideUnitRefusal,
	EXIT_CODE,
	readWorkspacePolicy,
} from '@delendai/core/cli';

import type { ICliCommandResult } from '../contracts/interfaces/cli-command.interface';
import { EDITING_TOOLS } from '../contracts/constants/pre-edit-guard.constant';

/** The file an editing tool call writes, when it is one. */
const editedPath = (call: unknown): string | undefined => {
	if (call === null || typeof call !== 'object') return undefined;
	const { tool_name: tool, tool_input: given } = call as {
		readonly tool_name?: unknown;
		readonly tool_input?: unknown;
	};
	if (typeof tool !== 'string' || !EDITING_TOOLS.includes(tool))
		return undefined;
	if (given === null || typeof given !== 'object') return undefined;
	const { file_path: file, notebook_path: notebook } = given as {
		readonly file_path?: unknown;
		readonly notebook_path?: unknown;
	};
	const path = typeof file === 'string' ? file : notebook;
	return typeof path === 'string' && path.length > 0 ? path : undefined;
};

/** Judge one editing tool call, as the host's pre-edit hook hands it over. */
export const judgePreEdit = async (input: {
	readonly stdin: string;
	readonly workspace: string;
}): Promise<ICliCommandResult> => {
	let call: unknown;
	try {
		call = JSON.parse(input.stdin);
	} catch {
		return { code: EXIT_CODE.OK };
	}
	const path = editedPath(call);
	if (path === undefined) return { code: EXIT_CODE.OK };
	const cwd =
		typeof (call as { cwd?: unknown }).cwd === 'string'
			? (call as { cwd: string }).cwd
			: input.workspace;
	const policy = await readWorkspacePolicy(input.workspace);
	const refusal = editOutsideUnitRefusal({
		cwd,
		path,
		agent: agentFor([], input.workspace, policy.identity),
		policy,
	});
	if (refusal === undefined) return { code: EXIT_CODE.OK };
	// 2 is the code Claude Code reads as "block this call".
	return {
		code: EXIT_CODE.USAGE,
		error: `delendai guard (pre-edit): refused — ${refusal.reason}\n${refusal.remedy}`,
	};
};
