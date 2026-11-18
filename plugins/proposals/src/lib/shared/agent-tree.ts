import type { IAgentAssignment, IAgentRegistry } from './agent-registry-store';

export type IAgentNode = IAgentAssignment & {
	children?: IAgentNode[];
};

export type IAgentNodeInput = IAgentAssignment;

const buildNode = (
	a: IAgentAssignment,
	byId: Map<string, IAgentNode>,
): IAgentNode => {
	const existing = byId.get(a.task_id);
	if (existing) return existing;
	const node: IAgentNode = { ...a, children: [] };
	byId.set(a.task_id, node);
	return node;
};

/**
 * Build a forest of subagent trees from a flat registry.
 *
 * Roots are entries with `parent_task_id === null`. Children are linked
 * by `parent_task_id`. If a child references a parent that does not
 * exist in the registry, it is treated as a root (defensive: registry
 * can be in an inconsistent state during a race; we still render it).
 */
export const buildAgentTree = (registry: IAgentRegistry): IAgentNode[] => {
	const byId = new Map<string, IAgentNode>();
	const all = registry.assignments.map((a) => {
		const node = buildNode(a, byId);
		node.children = node.children ?? [];
		return node;
	});

	const roots: IAgentNode[] = [];
	for (const node of all) {
		const parent = node.parent_task_id
			? byId.get(node.parent_task_id)
			: null;
		if (parent) {
			parent.children = parent.children ?? [];
			parent.children.push(node);
		} else {
			roots.push(node);
		}
	}
	return roots;
};
