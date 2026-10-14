/** One active agent, as `agent_names { action: "list" }` lists it. */
export interface IAgentAssignmentBrief {
	readonly agent_name: string;
	readonly agent_slot: string;
	readonly task_id: string;
	readonly parent_task_id: string | null;
	readonly topic: string;
	readonly last_seen: string;
}
