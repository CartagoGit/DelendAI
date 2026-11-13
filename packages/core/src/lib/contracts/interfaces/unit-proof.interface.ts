import type {
	ICertificationCommandRunner,
	ICertificationStepResult,
	IValidationGateStep,
} from './local-certification.interface';

/** What proving a unit before its publication needs. */
export interface IProveUnitRequest {
	/** The repository's own checkout. */
	readonly root: string;
	/** The unit's worktree, when it has one; else a temporary one is used. */
	readonly worktree: string | undefined;
	/**
	 * The agent the work command resolved: the compute slot names it while
	 * the proof waits or holds, so no proof reads as an unidentified one.
	 */
	readonly agent: string;
	/** The unit's tip: what is proved. */
	readonly tipSha: string;
	/** The integration head, whose declaration names the proof. */
	readonly integrationSha: string;
	readonly run?: ICertificationCommandRunner;
	/** What decides whether this proof takes the compute slot ahead of the rest. */
	readonly urgency?: {
		readonly args: readonly string[];
		readonly proposal: string | undefined;
		readonly policy: {
			readonly branches: { readonly integration: string };
		};
	};
}

/** The verdict of a unit's proof. */
export interface IUnitProofReport {
	/** The project declares a proof (a `prove` script, or its gate). */
	readonly declared: boolean;
	readonly passed: boolean;
	readonly steps: readonly (ICertificationStepResult | IValidationGateStep)[];
	/** The same tree passed the same proof before, so nothing ran. */
	readonly remembered?: boolean;
	/** Why the proof could not run at all; never a pass. */
	readonly setupFailure?: string;
}
