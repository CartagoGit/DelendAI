/** Contract shapes for the local certification of a merge candidate. */

import type { IResolvedDevelopmentPolicy } from './development-policy.interface';

/** One gate the project declares: where it was declared, and what runs. */
export interface IValidationGateStep {
	readonly scope: string;
	readonly command: string;
}

/**
 * Reads one file of the declaring tree, by its path relative to the
 * repository root; `undefined` when the tree has no such file.
 */
export type IDeclarationReader = (relativePath: string) => string | undefined;

/** What one gate step did when it ran against the candidate. */
export interface ICertificationStepResult extends IValidationGateStep {
	readonly passed: boolean;
	/** The last lines the step printed, present only when it failed. */
	readonly outputTail?: string | undefined;
}

/**
 * The evidence a certification produced. `declared: false` is its own
 * answer: a project that declares no gate has certified nothing, and the
 * merge engine refuses what nothing certified.
 */
export interface ILocalCertificationReport {
	readonly declared: boolean;
	readonly passed: boolean;
	/** The integration head the candidate was built on. */
	readonly againstIntegrationSha: string;
	/** The commit the gate ran on: the integration head plus the work. */
	readonly candidateSha: string;
	readonly steps: readonly ICertificationStepResult[];
	/** Set when the candidate could not be put on disk to run the gate. */
	readonly setupFailure?: string | undefined;
}

/** Runs one gate command in a directory; returns its exit code and output. */
export type ICertificationCommandRunner = (
	command: string,
	cwd: string,
) => { readonly code: number; readonly output: string };

/** Everything one certification needs. */
export interface ICertifyCandidateRequest {
	/** Repository root; the throwaway worktree is added from here. */
	readonly root: string;
	readonly candidateSha: string;
	readonly integrationSha: string;
	/** Runs a gate command; defaults to a shell with captured output. */
	readonly run?: ICertificationCommandRunner | undefined;
}

/** Certifies one candidate commit against one integration head. */
export type ICandidateCertifier = (
	request: ICertifyCandidateRequest,
) => Promise<ILocalCertificationReport>;

/** What landing a unit by merge needs; everything policy-shaped resolved. */
export interface ILandWorkUnitRequest {
	readonly root: string;
	readonly cwd: string;
	readonly policy: IResolvedDevelopmentPolicy;
	readonly remote: string;
	readonly workRef: string;
	readonly keepWorkRef: boolean;
	readonly keepWorkRefBecause?: string | undefined;
	/** Certifies a candidate; the real gate unless a spec injects one. */
	readonly certify?: ICandidateCertifier | undefined;
}
