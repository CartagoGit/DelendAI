/** The state of the work model, as numbers a supervising agent can read. */
export interface IWorkflowKpis {
	readonly invariants: {
		readonly total: number;
		readonly broken: number;
		readonly brokenIds: readonly string[];
	};
	/** Unit work refs in the swarm view. */
	readonly units: number;
	/** Publications that carry commits the integration branch lacks. */
	readonly publicationsWaiting: number;
	/** Agents in the roster. */
	readonly agents: number;
	/** Roster entries that joined and produced nothing. */
	readonly agentsThatProducedNothing: number;
	/** What the integration branch took in that coordinated, not delivered. */
	readonly coordination?: ICoordinationCost | undefined;
}

/** The commits of a window, and the share that only coordinated. */
export interface ICoordinationCost {
	readonly windowDays: number;
	readonly commits: number;
	readonly merges: number;
	/** Regenerated views and the tools' own records (claims, verdicts, transitions). */
	readonly bookkeeping: number;
	/** (merges + bookkeeping) / commits, to three decimals; 0 with no commits. */
	readonly tax: number;
}
