/**
 * `agent-loop-detector` contract guard (l103 s1).
 *
 * Pins the pure-function contract so the integration layers in
 * s2/s3/s4 can adapt the detector (git-diff signal, handoff
 * packet, CLI flag, auto_work integration) without breaking the
 * base semantics.
 *
 * The detector is pure: no FS, no clock, no random. Tests pass
 * synthetic `IToolCall[]` arrays and assert on the returned verdict.
 */
import { describe, expect, it } from 'vitest';

import {
	buildWindow,
	detectAgentLoop,
	type IToolCall,
} from '@mcp-vertex/proposals/lib/agents/agent-loop-detector';

const mkCall = (
	tool: string,
	args: unknown,
	agent = 'agent-1',
	timestamp = 0,
): IToolCall => ({ tool, args, agent, timestamp });

// x00074 S1: extended mkCall with explicit outcome. Optional so the
// legacy tests above keep passing — defaults to 'ok' here is wrong
// (would change the test contract), so we require the caller to pass
// it explicitly when they care.
const mkCallWithOutcome = (
	tool: string,
	args: unknown,
	agent: string,
	timestamp: number,
	outcome: 'ok' | 'retryable-error' | 'permanent-error' | 'unknown',
): IToolCall => ({ tool, args, agent, timestamp, outcome });

describe('detectAgentLoop', async () => {
	it('returns isStuck=false on an empty window', async () => {
		const out = detectAgentLoop([]);
		expect(out).toEqual({
			isStuck: false,
			pattern: null,
			repeatCount: 0,
			offendingTool: null,
			offendingAgent: null,
			suggestHandoff: false,
			offendingHash: null,
		});
	});

	it('flags stuck when the same agent repeats the same (tool, args) 3 times in the window', async () => {
		const calls = [
			mkCall('read_file', { path: 'foo.ts' }, 'a1', 1),
			mkCall('read_file', { path: 'foo.ts' }, 'a1', 2),
			mkCall('read_file', { path: 'foo.ts' }, 'a1', 3),
		];
		const out = detectAgentLoop(calls);
		expect(out.isStuck).toBe(true);
		expect(out.pattern).toBe('exact-repeat');
		expect(out.repeatCount).toBe(3);
		expect(out.offendingTool).toBe('read_file');
		expect(out.offendingAgent).toBe('a1');
		expect(out.offendingHash).not.toBeNull();
	});

	it('does NOT flag stuck when only 2 repeats occur (below default threshold)', async () => {
		const calls = [
			mkCall('read_file', { path: 'foo.ts' }, 'a1', 1),
			mkCall('read_file', { path: 'foo.ts' }, 'a1', 2),
		];
		const out = detectAgentLoop(calls);
		expect(out.isStuck).toBe(false);
		expect(out.repeatCount).toBe(0);
	});

	it('treats args with shuffled object keys as equal (stable stringify)', async () => {
		// Same logical payload, different key insertion order — the
		// detector must hash them identically.
		const calls = [
			mkCall(
				'edit_file',
				{ path: 'foo.ts', old: 'a', new: 'b' },
				'a1',
				1,
			),
			mkCall(
				'edit_file',
				{ new: 'b', path: 'foo.ts', old: 'a' },
				'a1',
				2,
			),
			mkCall(
				'edit_file',
				{ old: 'a', path: 'foo.ts', new: 'b' },
				'a1',
				3,
			),
		];
		const out = detectAgentLoop(calls);
		expect(out.isStuck).toBe(true);
		expect(out.repeatCount).toBe(3);
	});

	it('does NOT confuse two agents calling the same tool with the same args', async () => {
		const calls = [
			mkCall('read_file', { path: 'foo.ts' }, 'a1', 1),
			mkCall('read_file', { path: 'foo.ts' }, 'a1', 2),
			mkCall('read_file', { path: 'foo.ts' }, 'a2', 3),
			mkCall('read_file', { path: 'foo.ts' }, 'a2', 4),
		];
		const out = detectAgentLoop(calls);
		// Each agent has only 2 repeats (below default threshold of 3).
		expect(out.isStuck).toBe(false);
	});

	it('respects the custom exactRepeatThreshold option', async () => {
		const calls = [
			mkCall('read_file', { path: 'foo.ts' }, 'a1', 1),
			mkCall('read_file', { path: 'foo.ts' }, 'a1', 2),
		];
		expect(
			detectAgentLoop(calls, { exactRepeatThreshold: 2 }).isStuck,
		).toBe(true);
		expect(
			detectAgentLoop(calls, { exactRepeatThreshold: 5 }).isStuck,
		).toBe(false);
	});

	it('respects ringSize — old calls fall off the window', async () => {
		const calls = [
			// 5 unique calls before the repeat pattern starts.
			mkCall('read_file', { path: 'a.ts' }, 'a1', 1),
			mkCall('read_file', { path: 'b.ts' }, 'a1', 2),
			mkCall('read_file', { path: 'c.ts' }, 'a1', 3),
			mkCall('read_file', { path: 'd.ts' }, 'a1', 4),
			mkCall('read_file', { path: 'e.ts' }, 'a1', 5),
			// Now 3 repeats of the same args — within a ringSize of 5,
			// the unique calls fall off and only the 3 repeats remain.
			mkCall('edit_file', { path: 'foo.ts' }, 'a1', 6),
			mkCall('edit_file', { path: 'foo.ts' }, 'a1', 7),
			mkCall('edit_file', { path: 'foo.ts' }, 'a1', 8),
		];
		// ringSize 5 keeps only the last 5 calls (4,5,6,7,8) →
		// 3 repeats of edit_file in that window → stuck.
		const stuck = detectAgentLoop(calls, { ringSize: 5 });
		expect(stuck.isStuck).toBe(true);
		expect(stuck.offendingTool).toBe('edit_file');
		// ringSize 10 keeps all 8 calls → only 3 repeats of edit_file
		// (still above threshold of 3? — 3 ≥ 3 = stuck).
		// Use a higher threshold to demonstrate ring-size effect:
		const notStuck = detectAgentLoop(calls, {
			ringSize: 10,
			exactRepeatThreshold: 5,
		});
		expect(notStuck.isStuck).toBe(false);
	});

	it('returns the most-recent offender when multiple groups exceed the threshold', async () => {
		const calls = [
			mkCall('read_file', { path: 'a.ts' }, 'a1', 1),
			mkCall('read_file', { path: 'a.ts' }, 'a1', 2),
			mkCall('read_file', { path: 'a.ts' }, 'a1', 3),
			// Later, a different tool also loops.
			mkCall('write_file', { path: 'b.ts', content: 'x' }, 'a1', 10),
			mkCall('write_file', { path: 'b.ts', content: 'x' }, 'a1', 11),
			mkCall('write_file', { path: 'b.ts', content: 'x' }, 'a1', 12),
		];
		const out = detectAgentLoop(calls);
		expect(out.isStuck).toBe(true);
		expect(out.offendingTool).toBe('write_file');
		expect(out.offendingHash).not.toBeNull();
	});
});

// x00074 S1: outcome-aware sliding window. Successful re-intent chains
// (e.g. 8 successful `agent_lock claim` calls after rate-limit recovery)
// MUST NOT trip the detector — the 2026-06-27 false-positive case.
describe('f00074 S1 — outcome-aware sliding window', async () => {
	it('does NOT flag 8 successful calls (the 2026-06-27 regression fixture)', async () => {
		const calls = Array.from({ length: 8 }, (_, i) =>
			mkCallWithOutcome(
				'agent_lock',
				{ action: 'claim', task_id: 'f00056-S5', i },
				'copilot-minimax-m3',
				1_700_000_000_000 + i * 60_000,
				'ok',
			),
		);
		const out = detectAgentLoop(calls);
		expect(out.isStuck).toBe(false);
		expect(out.repeatCount).toBe(0);
	});

	it('DOES flag 8 mixed-outcome calls (1 retryable error in 7 successes is enough)', async () => {
		const calls = [
			mkCallWithOutcome('agent_lock', { action: 'claim' }, 'a1', 1, 'ok'),
			mkCallWithOutcome(
				'agent_lock',
				{ action: 'claim' },
				'a1',
				2,
				'retryable-error',
			),
			mkCallWithOutcome('agent_lock', { action: 'claim' }, 'a1', 3, 'ok'),
			mkCallWithOutcome('agent_lock', { action: 'claim' }, 'a1', 4, 'ok'),
			mkCallWithOutcome('agent_lock', { action: 'claim' }, 'a1', 5, 'ok'),
			mkCallWithOutcome('agent_lock', { action: 'claim' }, 'a1', 6, 'ok'),
			mkCallWithOutcome('agent_lock', { action: 'claim' }, 'a1', 7, 'ok'),
			mkCallWithOutcome('agent_lock', { action: 'claim' }, 'a1', 8, 'ok'),
		];
		const out = detectAgentLoop(calls);
		expect(out.isStuck).toBe(true);
		expect(out.repeatCount).toBe(8);
	});

	it('DOES flag 8 unknown-outcome calls (legacy compat)', async () => {
		const calls = Array.from({ length: 8 }, (_, i) =>
			mkCallWithOutcome(
				'agent_lock',
				{ action: 'claim', i },
				'a1',
				1_700_000_000_000 + i * 60_000,
				'unknown',
			),
		);
		const out = detectAgentLoop(calls);
		expect(out.isStuck).toBe(true);
		expect(out.repeatCount).toBe(8);
	});

	it('honours suppressSuccessfulReintents: false (legacy hosts)', async () => {
		const calls = Array.from({ length: 8 }, (_, i) =>
			mkCallWithOutcome(
				'agent_lock',
				{ action: 'claim', i },
				'a1',
				1_700_000_000_000 + i * 60_000,
				'ok',
			),
		);
		const out = detectAgentLoop(calls, {
			suppressSuccessfulReintents: false,
		});
		expect(out.isStuck).toBe(true);
		expect(out.repeatCount).toBe(8);
	});
});

describe('buildWindow', async () => {
	it('returns the last ringSize calls in chronological order', async () => {
		const calls = Array.from({ length: 100 }, (_, i) =>
			mkCall('read_file', { i }, 'a1', i),
		);
		const out = buildWindow(calls, 10);
		expect(out.length).toBe(10);
		expect(out[0]?.timestamp).toBe(90);
		expect(out[9]?.timestamp).toBe(99);
	});
});
