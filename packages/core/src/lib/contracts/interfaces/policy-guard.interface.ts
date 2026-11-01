/**
 * policy-guard.interface.ts — the git guard axis of the development policy.
 */
/**
 * How the git guard treats an actor nothing identifies: no agent marker,
 * no unit worktree, no delendai session, not CI.
 */
export const UNKNOWN_ACTORS = ['agent', 'person'] as const;
export type IUnknownActor = (typeof UNKNOWN_ACTORS)[number];

/** Git guard axis. Absent means the derived default (see `unknownActorOf`). */
export interface IPolicyGuard {
	readonly unknownActor: IUnknownActor;
}
