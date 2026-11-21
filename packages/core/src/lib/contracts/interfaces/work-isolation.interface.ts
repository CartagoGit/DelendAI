/** How agents are kept apart under a resolved development policy. */
export interface IWorkIsolation {
	/** True when each agent is expected to work in its own worktree. */
	readonly agentWorktrees: boolean;
	/**
	 * True when the worktree is made by `delendai work enter`, as a unit of
	 * work on a work ref, so `agent_worktree` must not create one.
	 */
	readonly unitWorktrees: boolean;
	/** The rule to give an agent, in one paragraph. */
	readonly rule: string;
	/** Why a request for an agent worktree is refused under this policy. */
	readonly worktreeRefusal: string;
}
