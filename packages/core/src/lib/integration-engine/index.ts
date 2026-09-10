/**
 * index.ts — the integration engine's public surface: one factory that
 * binds the cycle to a repository, plus the ports a host must satisfy.
 *
 * Callers should not assemble `IIntegrationEngineDeps` by hand. The
 * factory resolves the working-tree root from git itself and builds the
 * WIP engine and the git port against THAT root, for the same reason the
 * WIP engine does: every ref and every path in this cycle is interpreted
 * relative to the repository, and a caller's stale `cwd` is how "delete
 * the merged ref" becomes "delete the wrong repository's ref".
 *
 * What this engine promises:
 *
 *  1. STRICT LATEST. A candidate validated against integration head `A`
 *     cannot merge once the head is `A+X`. The head is re-read inside the
 *     critical section, and the merge itself is a compare-and-swap on
 *     both the candidate sha and the base sha, so a race is REFUSED
 *     rather than resolved optimistically.
 *  2. MINIMAL SERIALISATION. Only `read head → update candidate → final
 *     verdict → merge → record` is exclusive, keyed on the integration
 *     branch. Checkpointing and CI stay fully parallel.
 *  3. GREEN PROGRESS. A coherent green generation integrates immediately
 *     and the slice keeps going from the new head; nothing waits for the
 *     whole slice.
 *  4. EVIDENCE-BASED CLEANUP. A work ref is deleted only when it is
 *     provably represented in the integration branch. Never on age.
 *     Unmerged work is RECOVERABLE, never garbage.
 *  5. POLICY-DRIVEN. A project whose policy says `direct` gets a decline,
 *     not a pull request it never asked for.
 *  6. IDEMPOTENT. Running the cycle twice opens no second pull request,
 *     creates no second generation and emits no duplicate journal event.
 */

import { createWipEngine } from '../wip-engine/index';
import {
	createInMemoryCriticalSection,
	type ICriticalSection,
} from './critical-section';
import { disposeWorkRef, type ICleanupStepInput } from './cleanup-step';
import type { IIntegrationEngineDeps } from './engine-context.interface';
import { createIntegrationGit } from './git-operations';
import { runIntegrationCycle } from './run-cycle';
import type { IIntegrationCycleRequest } from './run-cycle';

import type {
	ICreateIntegrationEngineOptions,
	IIntegrationEngine,
} from './index.interface';

export type {
	ICreateIntegrationEngineOptions,
	IIntegrationEngine,
} from './index.interface';

export { collectEvidence, disposeWorkRef } from './cleanup-step';
export type { ICleanupStepInput } from './cleanup-step';
export {
	createInMemoryCriticalSection,
	integrationSectionKey,
	type ICriticalSection,
} from './critical-section';
export type { IIntegrationEngineDeps } from './engine-context.interface';
export type * from './forge-port.interface';
export { createIntegrationGit } from './git-operations';
export {
	createGithubIntegrationForge,
	type IGithubIntegrationForgeOptions,
} from './github-forge';
export type * from './git-port.interface';
export {
	candidateBody,
	candidateBranchName,
	integrationRepositoryUid,
} from './identity';
export { mergeCandidate } from './merge-step';
export type { IMergeStepInput, IMergeStepResult } from './merge-step';
export { gateIntegration, type IPolicyGateVerdict } from './policy-gate';
export { ensurePullRequest } from './pull-request-step';
export type {
	IPullRequestStepInput,
	IPullRequestStepResult,
} from './pull-request-step';
export { rebaseOntoHead } from './rebase-step';
export type { IRebaseOutcome, IRebaseStepInput } from './rebase-step';
export { runIntegrationCycle } from './run-cycle';
export type { IIntegrationCycleRequest } from './run-cycle';
export type * from './state-port.interface';
export type * from './types';
export { evaluateValidation, validationStateOf } from './validation-step';

/**
 * Bind the engine to the repository containing `cwd`. Returns
 * `undefined` when `cwd` is not inside a git working tree — a caller
 * that cannot reach git must find that out here, not halfway through a
 * merge.
 */
export const createIntegrationEngine = async (
	options: ICreateIntegrationEngineOptions,
): Promise<IIntegrationEngine | undefined> => {
	const git = await createIntegrationGit(options.cwd, options.timeoutMs);
	if (git === undefined) return undefined;
	const wip = await createWipEngine(git.root, options.timeoutMs);
	if (wip === undefined) return undefined;
	const deps: IIntegrationEngineDeps = {
		forge: options.forge,
		git,
		state: options.state,
		wip,
		criticalSection:
			options.criticalSection ?? createInMemoryCriticalSection(),
		clock: options.clock ?? (() => Date.now()),
	};
	return {
		deps,
		runIntegrationCycle: (request) => runIntegrationCycle(deps, request),
		disposeWorkRef: (input) => disposeWorkRef(deps, input),
	};
};
