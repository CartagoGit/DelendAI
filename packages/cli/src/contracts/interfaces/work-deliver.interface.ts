import type { ICliCommandResult } from './cli-command.interface';

/** What delivering needs from the unit engine and the proposals tool. */
export interface IWorkDeliverPorts {
	readonly prove: () => Promise<ICliCommandResult>;
	readonly transition: (to: 'in-progress' | 'review') => Promise<unknown>;
}
