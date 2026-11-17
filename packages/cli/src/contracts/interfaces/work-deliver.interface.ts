import type { ICliCommandResult } from './cli-command.interface';

/** What delivering needs from the unit engine and the proposals tool. */
export interface IWorkDeliverPorts {
	/** The slice this unit was entered for; `all` for a whole proposal. */
	readonly slice: string;
	/** Publish the unit alone, without handing the proposal to review. */
	readonly publish: () => Promise<ICliCommandResult>;
	readonly locate: () => Promise<ICliCommandResult>;
	readonly prove: () => Promise<ICliCommandResult>;
	/** Ask the tool whether the hand-over would be accepted; nothing is moved. */
	readonly preflight: (checkout: string | undefined) => Promise<unknown>;
	readonly transition: (
		to: 'in-progress' | 'review',
		checkout: string | undefined,
	) => Promise<unknown>;
}

/** What one `work deliver` runs on: the proposal, the reason, the unit's flags. */
export interface IDeliverRun {
	readonly id: string;
	readonly reason: string;
	readonly agent: string | undefined;
	readonly urgent: string | undefined;
	readonly unitFlags: readonly string[];
}
