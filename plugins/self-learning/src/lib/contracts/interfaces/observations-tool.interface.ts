/** Contract shapes for `../../tools/observations.tool`. */

import type { IWorkspaceTextReader } from './observation.interface';

export interface IObservationsToolOptions {
	readonly namespacePrefix: string;
	/** Absolute path of this project's observation store. */
	readonly storePathAbs: string;
	/** Absolute path of the test failure journal this project writes. */
	readonly testJournalPathAbs: string;
	readonly maxObservations?: number;
	/** Absolute workspace root — the containment root for store writes. */
	readonly workspaceRootAbs?: string;
	/** Every read this tool makes goes through it. */
	readonly readText: IWorkspaceTextReader;
}
