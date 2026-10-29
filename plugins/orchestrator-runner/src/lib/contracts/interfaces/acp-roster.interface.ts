/**
 * acp-roster.interface.ts — an agent as roster proposals need it.
 */
export interface IProposedAgent {
	readonly id: string;
	/** Whether it can start here over ACP. */
	readonly canStart: boolean;
}

/** The models a detected client lists for one provider (OpenCode lists several). */
export interface IClientListedModels {
	readonly provider: string;
	readonly models: readonly string[];
}
