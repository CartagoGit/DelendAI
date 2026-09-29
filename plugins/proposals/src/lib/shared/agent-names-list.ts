/**
 * agent-names-list.ts — what `agent_names { action: "list" }` answers.
 *
 * The registry keeps every assignment it ever made, released and cooled
 * down ones included, and `list` returned all of them in full: about 8.7 KB
 * a call, measured from the usage log (f00645), for a question that is
 * usually "who is working now". The default answer is the active
 * assignments in brief; `detail: true` returns the registry as stored.
 */
import type { IAgentAssignmentBrief } from '../contracts/interfaces/agent-assignment-brief.interface';
import type { IAgentAssignment, IAgentRegistry } from './agent-registry-store';

const brief = (assignment: IAgentAssignment): IAgentAssignmentBrief => ({
	agent_name: assignment.agent_name,
	agent_slot: assignment.agent_slot,
	task_id: assignment.task_id,
	parent_task_id: assignment.parent_task_id,
	topic: assignment.topic,
	last_seen: assignment.last_seen,
});

/** The `list` answer: counts, then the active agents, or everything. */
export const listAgentNames = (
	registry: IAgentRegistry,
	detail: boolean,
	namespacePrefix: string,
): Record<string, unknown> => {
	const count = (status: IAgentAssignment['status']): number =>
		registry.assignments.filter((a) => a.status === status).length;
	const summary = {
		active: count('active'),
		cooldown: count('cooldown'),
		orphan: count('orphan'),
		adopted: registry.adopted.length,
	};
	if (detail) {
		return {
			summary,
			assignments: registry.assignments,
			adopted: registry.adopted,
		};
	}
	return {
		summary,
		assignments: registry.assignments
			.filter((a) => a.status === 'active')
			.map(brief),
		next: `${namespacePrefix}_agent_names { action: "who_uses", agent: "<name>" } for one agent; { action: "list", detail: true } for every assignment, released ones and adoptions included.`,
	};
};
