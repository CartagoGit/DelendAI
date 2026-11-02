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
	/** The unit's tip: what is proved. */
	readonly tipSha: string;
	/** The integration head, whose declaration names the proof. */
	readonly integrationSha: string;
	readonly run?: ICertificationCommandRunner;
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
