/**
 * agent-lock-engine.ts (moved from the host project)
 *
 * File-level write-ownership mutex with stale-claim GC: claim before
 * editing, release after editing, status/gc for stale claims. The
 * host injects its tool name (used in payloads), the workspace-
 * relative label, and the lock path; defaults come from
 * `DEFAULT_PATH_LAYOUT`.
 */

import { LockContentionError, withFileMutex } from '@delendai/core/public';

// r00042 S3: the vocabulary moved to contracts/interfaces; re-exported
// here so no importer of `engine.ts` had to change.
export type {
	IAgentLockAction,
	IAgentLockArgs,
	IAgentLockDeps,
	IAgentLockResponse,
	IAgentLockTmpFileInfo,
	ILockEntry,
	ILockFile,
	IReleaseAuditEntry,
} from '../contracts/interfaces/agent-lock.interface';
import { lockResult, validateArgs } from './lock-args';
import {
	getFileLockTablePath,
	getLockFileLabel,
	getMutexOptions,
	getToolName,
	isAgentBranchName,
	readCurrentBranchName,
} from './lock-paths';
import {
	applyPersistedSessionBalance,
	setLastSessionWorkspaceRoot,
	resolveSessionWorkspaceRoot,
} from './session-balance';

// r00042 S3 — the engine was split into cohesive modules; every symbol it
// used to export is re-exported here so no importer had to change. The
// split moved declarations verbatim, which is what makes that promise
// safe to make.
export {
	getAgentLockSessionBalance,
	resetAgentLockSessionBalance,
} from './session-balance';
export {
	listStaleAgentLockTmpFiles,
	sweepStaleAgentLockTmpFiles,
} from './tmp-file-sweeper';
export { readLock, removeStale } from './lock-store';
export {
	cleanupStaleAgentLockState,
	releaseAgentSessionClaims,
} from './lock-lifecycle';
export { claimWithFileLocks } from './claim-with-file-locks';

import type {
	IAgentLockArgs,
	IAgentLockDeps,
	IAgentLockResponse,
} from '../contracts/interfaces/agent-lock.interface';
import { executeLockAction } from './execute-lock-action';
import {
	AGENT_LOCK_TMP_STALE_MS,
	CONTENTION_NEXT,
} from '../contracts/constants/agent-lock-engine.constant';
export { AGENT_LOCK_TMP_STALE_MS };

export async function runAgentLockEngine(
	args: IAgentLockArgs,
	deps: IAgentLockDeps = {},
): Promise<IAgentLockResponse> {
	setLastSessionWorkspaceRoot(resolveSessionWorkspaceRoot(deps));
	const v = validateArgs(args);
	const toolName = getToolName(deps);
	const lockFileLabel = getLockFileLabel(deps);
	if (!v.ok) {
		return lockResult(
			{
				tool: toolName,
				action: args.action,
				path: lockFileLabel,
				error: v.error,
				blockerType: 'invalid-input',
				nextAction:
					'Correct the missing lock arguments once; if the intended files are unclear, inspect the proposal ownership before retrying.',
				summary: `invalid-input: ${v.error}`,
			},
			{ isError: true },
		);
	}

	if (args.action === 'claim' && deps.agentWorktreeEnabled === true) {
		const branch = await readCurrentBranchName(deps);
		if (branch === null) {
			return lockResult(
				{
					tool: toolName,
					action: args.action,
					path: lockFileLabel,
					error: 'agent_lock claim requires a per-agent worktree when the host gate is on, but the active branch could not be read',
					blockerType: 'needs-worktree',
					nextAction:
						'proposals_agent_worktree { action: "create", agent: "<your-agent-name>" } and retry the claim.',
					summary:
						'needs-worktree: active branch unreadable; create a worktree first',
				},
				{ isError: true },
			);
		}
		if (!isAgentBranchName(branch)) {
			return lockResult(
				{
					tool: toolName,
					action: args.action,
					path: lockFileLabel,
					activeBranch: branch,
					error: `agent_lock claim requires a per-agent worktree when the host gate is on; active branch is "${branch}", expected "agent/<name>"`,
					blockerType: 'needs-worktree',
					nextAction:
						'proposals_agent_worktree { action: "create", agent: "<your-agent-name>" } and retry the claim.',
					summary: `needs-worktree: active branch is "${branch}"`,
				},
				{ isError: true },
			);
		}
	}

	if (args.action === 'status') {
		return applyPersistedSessionBalance(
			await executeLockAction(args, deps),
			args,
			deps,
		);
	}

	try {
		return await applyPersistedSessionBalance(
			await withFileMutex(
				getFileLockTablePath(deps),
				() => executeLockAction(args, deps),
				getMutexOptions(args, deps),
			),
			args,
			deps,
		);
	} catch (error) {
		if (error instanceof LockContentionError) {
			return lockResult(
				{
					tool: toolName,
					action: args.action,
					path: lockFileLabel,
					error: error.message,
					blockerType: 'lock-contention',
					nextAction: CONTENTION_NEXT,
					summary: `lock-contention: ${error.message}`,
				},
				{ isError: true },
			);
		}
		throw error;
	}
}
