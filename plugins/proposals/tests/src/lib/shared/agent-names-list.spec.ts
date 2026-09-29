/**
 * agent-names-list.spec.ts — `agent_names { action: "list" }` answers who
 * is working now in brief, and the whole registry only when asked.
 */
import { describe, expect, it } from 'vitest';

import { listAgentNames } from '@delendai/proposals/lib/shared/agent-names-list';
import type {
	IAgentAssignment,
	IAgentRegistry,
} from '@delendai/proposals/lib/shared/agent-registry-store';

const assignment = (
	overrides: Partial<IAgentAssignment>,
): IAgentAssignment => ({
	task_id: 'f00001-S1',
	agent_name: 'ada',
	agent_slot: 'implementer',
	parent_task_id: null,
	depth: 1,
	topic: 'the work',
	adopted: false,
	assigned_at: '2026-09-29T08:00:00Z',
	last_seen: '2026-09-29T09:00:00Z',
	cooldown_until: null,
	status: 'active',
	...overrides,
});

const registry = (): IAgentRegistry => ({
	version: 2,
	assignments: [
		assignment({}),
		assignment({
			task_id: 'f00002-S1',
			agent_name: 'bea',
			status: 'cooldown',
			cooldown_until: '2026-09-29T10:00:00Z',
		}),
	],
	adopted: [{ name: 'cai', task_id: 'f00003-S1' }],
});

describe('listAgentNames', () => {
	it('lists the active agents in brief, with the counts', () => {
		const answer = listAgentNames(registry(), false, 'proposals');
		expect(answer.summary).toEqual({
			active: 1,
			cooldown: 1,
			orphan: 0,
			adopted: 1,
		});
		expect(answer.assignments).toEqual([
			{
				agent_name: 'ada',
				agent_slot: 'implementer',
				task_id: 'f00001-S1',
				parent_task_id: null,
				topic: 'the work',
				last_seen: '2026-09-29T09:00:00Z',
			},
		]);
		expect(answer.adopted).toBeUndefined();
		expect(answer.next).toContain('detail: true');
	});

	it('returns the registry as stored with detail', () => {
		const stored = registry();
		const answer = listAgentNames(stored, true, 'proposals');
		expect(answer.assignments).toEqual(stored.assignments);
		expect(answer.adopted).toEqual(stored.adopted);
		expect(answer.next).toBeUndefined();
	});
});
