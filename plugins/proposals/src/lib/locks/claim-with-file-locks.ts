/**
 * claim-with-file-locks.ts — r00042 S3.
 *
 * Moved out of `locks/engine.ts` verbatim: the engine was 1,394 lines
 * against the 600-line ceiling this proposal sets, and it is
 * concurrency-sensitive code with a recorded history of subtle
 * correctness bugs. Declarations were relocated, never rewritten.
 */
import type {
	IAgentLockDeps,
	IAgentLockResponse,
} from '../contracts/interfaces/agent-lock.interface';
import { runAgentLockEngine } from './engine';

export const claimWithFileLocks = async (
	args: {
		readonly taskId: string;
		readonly agentId: string;
		readonly files: readonly string[];
		readonly parentTaskId?: string;
		readonly onContention?: 'steal' | 'fail';
	},
	deps: IAgentLockDeps = {},
): Promise<IAgentLockResponse> =>
	runAgentLockEngine(
		{
			action: 'claim',
			task_id: args.taskId,
			agent: args.agentId,
			files: [...args.files],
			...(args.parentTaskId !== undefined
				? { parent_task_id: args.parentTaskId }
				: {}),
			...(args.onContention !== undefined
				? { onContention: args.onContention }
				: {}),
		},
		deps,
	);
