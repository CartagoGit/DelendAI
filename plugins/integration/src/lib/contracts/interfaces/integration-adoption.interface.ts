import type { ILandWorkflowIdentity } from '@delendai/core/cli';

import type { IRehearsalFileChange } from './rehearsal.interface';

/** The values of the adopting project, read from its policy and its CI. */
export interface IAdoptionInput {
	readonly integrationBranch: string;
	readonly releaseBranch: string;
	readonly identity: ILandWorkflowIdentity;
	/** The watchdog's schedule. */
	readonly cron: string;
	/** The project's own CI jobs the signal waits on: its required checks. */
	readonly requiredJobs: readonly string[];
	/** The CLI version the rendered workflows pin. */
	readonly version: string;
}

/** What adoption writes, and the job to append to the project's own CI. */
export interface IAdoptionOutput {
	readonly files: readonly IRehearsalFileChange[];
	readonly signalJob: string;
}
