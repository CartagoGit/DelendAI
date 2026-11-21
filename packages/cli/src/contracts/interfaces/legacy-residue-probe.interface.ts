import type { IUserHostConfigReport } from '@delendai/core/cli';

export interface ILegacyResidueProbe {
	readonly scan: (workspace: string) => Promise<IUserHostConfigReport>;
	/** The running processes as `pid command` lines. */
	readonly processes: () => Promise<readonly string[]>;
}
