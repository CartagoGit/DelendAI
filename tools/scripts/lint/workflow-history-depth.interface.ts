/** Contracts for `workflow-history-depth.script.ts`. */

/** One job that reads history without asking for it. */
export interface IDepthFinding {
	/** Repository-relative path of the workflow. */
	readonly file: string;
	/** The job id as it appears under `jobs:`. */
	readonly job: string;
	/** Which history-reading commands were found in it. */
	readonly commands: readonly string[];
}
