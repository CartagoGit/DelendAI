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
}
