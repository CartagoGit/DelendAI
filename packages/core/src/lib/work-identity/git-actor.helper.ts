/**
 * git-actor.helper.ts — who is running git, decided in one place.
 *
 * The guard used to ask only "does this shell carry a Claude marker?", so
 * every other model family was judged as a person and the workflow it was
 * configured to follow silently did not apply. The answer now comes from
 * the strongest evidence available, in this order:
 *
 *   1. an agent marker in the environment (identity or host);
 *   2. the worktree delendai made for a unit, whatever the runtime;
 *   3. CI, which stays exempt when nothing above identified an agent;
 *   4. a delendai session (the CLI or server started this process);
 *   5. nothing known: the policy's `guard.unknownActor` decides.
 */
import { DELENDAI_SESSION_VARIABLE } from '../contracts/constants/agent-environment.constant';
import type { IResolvedDevelopmentPolicy } from '../contracts/interfaces/development-policy.interface';
import type { IGitActorInput } from '../contracts/interfaces/git-actor.interface';
import type { IUnknownActor } from '../contracts/interfaces/policy-guard.interface';

import { agentEnvironmentMarker } from './agent-environment.helper';

/**
 * What the policy assumes about an actor nothing identifies.
 *
 * A pinned shared checkout is where an unidentified writer does harm:
 * every agent reads it, and a commit there is invisible to the work
 * model. There the default is `agent`, because the cost of being wrong is
 * a refusal that names the way forward (and a person's `--no-verify` or
 * `unknownActor: "person"`), while the other error silently bypasses the
 * workflow. Elsewhere each agent has its own tree, so the default stays
 * `person`.
 */
export const unknownActorOf = (
	policy: IResolvedDevelopmentPolicy,
): IUnknownActor =>
	policy.guard?.unknownActor ??
	(policy.workspace.pinnedCheckout ? 'agent' : 'person');

/** The marker that identifies an agent, or `undefined` for a person. */
export const gitActorMarker = (input: IGitActorInput): string | undefined => {
	const { env, policy, unitAgent } = input;
	const declared = agentEnvironmentMarker(env);
	if (declared !== undefined) return declared;
	if (unitAgent !== undefined) {
		return `the worktree delendai made for ${unitAgent}`;
	}
	// A CI job is a throwaway copy that nobody shares, and `CI=true` alone
	// does not make an agent one (agent runtimes export it too, but they
	// also carry a marker, which was handled above).
	if (env.CI === 'true') return undefined;
	if ((env[DELENDAI_SESSION_VARIABLE] ?? '').trim().length > 0) {
		return `a delendai session (${DELENDAI_SESSION_VARIABLE})`;
	}
	return unknownActorOf(policy) === 'agent'
		? `an unidentified actor (development.guard.unknownActor is "agent")`
		: undefined;
};
