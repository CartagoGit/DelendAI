/**
 * declare-workflow.interface.ts — the shape of the work-model
 * declaration the server prints before it goes live.
 *
 * A declaration is not documentation. It is DERIVED from the resolved
 * policy, so it cannot describe a model the project did not configure,
 * and it is imperative, so an agent reading it has nothing left to
 * decide. Both properties are load-bearing: the failure this exists to
 * prevent is an agent inferring a work model from the repository it
 * happens to find, which is how work ends up on the wrong ref.
 */

/** One imperative instruction, and the policy fact that produced it. */
export interface IWorkflowStep {
	/** 1-based. The order of the steps is the order of the work. */
	readonly order: number;
	/** Imperative, one sentence. No alternatives, no hedging. */
	readonly instruction: string;
	/**
	 * The policy field this was derived from, named so a reader can
	 * audit the claim instead of trusting the sentence.
	 */
	readonly derivedFrom: string;
}

/** The whole work model, as an agent must execute it. */
export interface IWorkflowDeclaration {
	readonly profile: string;
	readonly integrationBranch: string;
	readonly releaseBranch: string;
	readonly steps: readonly IWorkflowStep[];
}
