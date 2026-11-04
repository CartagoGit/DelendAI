/** How a project wants its agents to work (`core.agentPolicy`). */
export interface IDelendaiAgentPolicyConfig {
	/** True: agents decide and carry on. False: they ask the user first. */
	readonly autonomous?: boolean;
	readonly principles?: ReadonlyArray<string>;
}
