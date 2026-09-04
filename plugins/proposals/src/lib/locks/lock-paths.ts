/**
 * lock-paths.ts — r00042 S3.
 *
 * Moved out of `locks/engine.ts` verbatim: the engine was 1,394 lines
 * against the 600-line ceiling this proposal sets, and it is
 * concurrency-sensitive code with a recorded history of subtle
 * correctness bugs. Declarations were relocated, never rewritten.
 */
import type {
	IAgentLockArgs,
	IAgentLockDeps,
} from '../contracts/interfaces/agent-lock.interface';
import { DEFAULT_PATH_LAYOUT } from '../contracts/constants/default-path-layout.constant';
import { deriveFileLockTablePath } from './file-lock-table';
import { stat } from 'node:fs/promises';

export const getLockPath = (deps: IAgentLockDeps = {}): string => {
	if (!deps.lockPath) {
		throw new Error(
			'agent-lock: deps.lockPath is required — inject the absolute lock path resolved from ctx.workspace.',
		);
	}
	return deps.lockPath;
};

export const getToolName = (deps: IAgentLockDeps = {}): string =>
	deps.toolName ?? 'agent_lock';

export const getLockFileLabel = (deps: IAgentLockDeps = {}): string =>
	deps.lockFileLabel ?? DEFAULT_PATH_LAYOUT.lockFile;

export const getNow = (deps: IAgentLockDeps = {}): string =>
	(deps.now ?? (() => new Date().toISOString()))();

export const getFileLockTablePath = (deps: IAgentLockDeps = {}): string =>
	deriveFileLockTablePath(getLockPath(deps), deps.fileLockTablePath);

export const getMutexOptions = (
	args: Pick<IAgentLockArgs, 'onContention'>,
	deps: IAgentLockDeps,
): {
	onContention?: 'steal' | 'fail';
	timeoutMs?: number;
	staleMs?: number;
	pollMs?: number;
} => ({
	...(args.onContention !== undefined
		? { onContention: args.onContention }
		: {}),
	...(deps.mutexTimeoutMs !== undefined
		? { timeoutMs: deps.mutexTimeoutMs }
		: {}),
	...(deps.mutexStaleMs !== undefined ? { staleMs: deps.mutexStaleMs } : {}),
	...(deps.mutexPollMs !== undefined ? { pollMs: deps.mutexPollMs } : {}),
});

export const readCurrentBranchName = async (
	deps: IAgentLockDeps,
): Promise<string | null> => {
	if (deps.currentBranchOverride !== undefined) {
		return deps.currentBranchOverride;
	}
	try {
		const { execFile } = await import('node:child_process');
		return await new Promise<string | null>((resolve) => {
			if (!deps.lockPath) {
				resolve(null);
				return;
			}
			const cwd = deps.lockPath.replace(/\/[^/]+$/u, '');
			execFile(
				'git',
				['rev-parse', '--abbrev-ref', 'HEAD'],
				{ cwd, encoding: 'utf8', timeout: 5_000 },
				(error, stdout) => {
					if (error) {
						resolve(null);
						return;
					}
					const branch = stdout.trim();
					resolve(branch.length === 0 ? 'HEAD' : branch);
				},
			);
		});
	} catch {
		return null;
	}
};

export const isAgentBranchName = (branch: string): boolean =>
	branch.startsWith('agent/') && branch.length > 'agent/'.length;

export const fileExists = async (path: string): Promise<boolean> => {
	try {
		await stat(path);
		return true;
	} catch {
		return false;
	}
};
