import type z from 'zod';
import type { IToolTextResult } from '@delendai/core/public';
import type { IGitRunner } from '../../shared/git-runner';
import type { IValidateEvidenceDeps } from '../../tools/proposal-transition.tool';
import type {
	IAuthoringToolOptions,
	ICloseSliceValidationDecision,
} from '../../tools/authoring-options';
import type { ICloseSliceQualityResult } from './close-slice-gate.interface';
import type { IPersistResult } from '../../tools/auto-work-persist';
import type { SLICE_IN } from '../constants/create-proposal-schema.constant';

type ICloseSlicePersistConfig = {
	readonly mode: 'none' | 'commit' | 'commit-and-push';
	readonly messageTemplate?: string;
	readonly pushTarget?: string;
	readonly protectedBranches?: readonly string[];
};

/**
 * x00156 S5 — the `close_slice` write-path throws a plain `Error`
 * decorated with these extra fields (quality-gate failure, or a
 * validation-error kind checked defensively though nothing currently
 * throws it) instead of a dedicated Error subclass. Named once and
 * shared between the throw site and the catch site so neither needs
 * `catch (err: any)`.
 */
export type ICloseSliceThrownError = Error & {
	readonly kind?:
		| 'validation-error'
		| 'quality-failed'
		| 'gate-pending'
		| 'gate-unverifiable'
		| 'peer-review-required';
	readonly output?: string;
	readonly persist?: IPersistResult;
	readonly detail?: ICloseSliceQualityResult;
	readonly validationDecision?: ICloseSliceValidationDecision;
};

/**
 * x00156 S5 — the review-transition write-path (`approve` /
 * `request_changes`) throws a plain `Error` decorated with a
 * pre-built `toolError(...)` envelope (see the identity-check guard
 * above) so the catch site can re-surface it verbatim.
 */
export type IToolErrorCarryingError = Error & {
	readonly toolError?: IToolTextResult;
};

export interface IProposalReviewEvidence {
	readonly commitHash: string;
	readonly validateExitCode: number;
	readonly testsPassing: number;
	readonly testsTotal: number;
	readonly runId?: string | undefined;
	readonly acceptanceCriteria?:
		| readonly {
				readonly criterion: string;
				readonly evidence: string;
		  }[]
		| undefined;
}

export type IPeerReviewPersistedEntry = {
	readonly ts: string;
	readonly proposal_id: string;
	readonly slice_id: string;
	readonly agent: string;
	readonly verdict: 'approved' | 'request_changes';
	readonly note?: string;
};

type ICreateProposalSlice = z.infer<typeof SLICE_IN>;

export type IFrontmatterPrimitive = boolean | number | string;

export interface ICreateProposalRequest {
	readonly id?: string | undefined;
	readonly kind?: string | undefined;
	readonly title: string;
	readonly goal?: string | undefined;
	readonly status?: string | undefined;
	readonly track?: string | undefined;
	readonly why?: string | undefined;
	readonly nonGoals?: readonly string[] | undefined;
	readonly globalGate?: 'lint' | 'type' | 'e2e' | 'none' | undefined;
	readonly slices?: readonly ICreateProposalSlice[] | undefined;
	readonly extraFrontmatter?:
		| Readonly<Record<string, IFrontmatterPrimitive>>
		| undefined;
}

export interface ICreateProposalWriteResult {
	readonly ok: true;
	/**
	 * The allocated (or supplied) proposal id.
	 *
	 * Carried explicitly because callers need it to name the publication
	 * ref, and re-deriving it by slicing the filename is a regex that
	 * silently breaks the first time the naming convention moves.
	 */
	readonly id: string;
	readonly file: string;
	readonly path: string;
	readonly disjointnessIssues: readonly {
		readonly first: string;
		readonly second: string;
		readonly file: string;
	}[];
	readonly indexCount: number;
	readonly redactedSecrets: number;
	/** The proposal was already on disk from an earlier call; nothing was written. */
	readonly reused?: boolean;
}

export interface ICreateProposalWriteError {
	readonly ok: false;
	readonly reason: string;
	readonly nextAction: string;
}

export type ICloseSliceValidateOptions = IAuthoringToolOptions & {
	readonly validateEvidenceDeps?: IValidateEvidenceDeps;
	readonly persist?: ICloseSlicePersistConfig;
	readonly persistGit?: IGitRunner;
};

export interface IAgentLockReleaseResult {
	readonly removed?: number;
}
