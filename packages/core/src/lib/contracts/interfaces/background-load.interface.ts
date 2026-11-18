/**
 * background-load.interface.ts — a command moved to low priority.
 */

export interface ILowPriorityCommand {
	readonly command: string;
	readonly args: readonly string[];
}
