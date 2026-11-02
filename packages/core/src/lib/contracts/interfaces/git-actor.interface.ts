/**
 * git-actor.interface.ts — what is known about whoever is running git.
 */
import type { IResolvedDevelopmentPolicy } from './development-policy.interface';

export interface IGitActorInput {
	readonly env: Readonly<Record<string, string | undefined>>;
	readonly policy: IResolvedDevelopmentPolicy;
	/** The agent a unit worktree (stamp or work branch) belongs to. */
	readonly unitAgent?: string | undefined;
}
