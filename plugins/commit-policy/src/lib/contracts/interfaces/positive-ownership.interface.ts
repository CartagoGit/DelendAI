/**
 * positive-ownership.interface.ts — what the agent-lock store answers
 * when asked which files an agent/task actually owns.
 */

export interface IPositiveOwnership {
	readonly agentId: string;
	readonly taskId: string;
	readonly ownedFiles: readonly string[];
}
