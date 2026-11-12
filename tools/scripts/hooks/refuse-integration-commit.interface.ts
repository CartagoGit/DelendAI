/** Types for `./refuse-integration-commit.script`. */

/** Whether this commit may proceed, and the sentence that says why. */
export interface IIntegrationCommitVerdict {
	readonly refused: boolean;
	/** Always present, including when nothing is refused. */
	readonly reason: string;
}
