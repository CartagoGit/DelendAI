import type { IGuardHooksReport } from './guard-hooks-service.interface';

/**
 * What a project asks the server to do about the hooks that enforce its
 * development policy.
 */
export type IGuardHooksMode = 'install' | 'report' | 'off';

/** What the server did about them, and what to tell the operator. */
export interface IGuardAutoinstallOutcome {
	readonly mode: IGuardHooksMode | 'absent';
	readonly report?: IGuardHooksReport | undefined;
	/** One line per fact, for the operator's console. */
	readonly lines: readonly string[];
}
