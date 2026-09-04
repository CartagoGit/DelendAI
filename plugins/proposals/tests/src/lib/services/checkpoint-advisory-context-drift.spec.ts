import { describe, expect, it } from 'vitest';

import { assessContextDrift } from '@delendai/proposals/lib/services/checkpoint-advisory-context-drift.service';

describe('assessContextDrift', () => {
	it('does not warn when repeats make progress', () => {
		expect(
			assessContextDrift([
				{
					tool: 'fs_write',
					madeProgress: true,
					progressHash: 'a',
					agentId: 'copilot',
				},
				{
					tool: 'fs_write',
					madeProgress: true,
					progressHash: 'b',
					agentId: 'copilot',
				},
			]),
		).toBeNull();
	});

	it('does not treat repeated orientation as drift', () => {
		expect(
			assessContextDrift([
				{
					tool: 'mcp-vertex_overview',
					madeProgress: false,
					progressHash: 'same',
					agentId: 'copilot',
					isOrientation: true,
				},
				{
					tool: 'mcp-vertex_overview',
					madeProgress: false,
					progressHash: 'same',
					agentId: 'copilot',
					isOrientation: true,
				},
				{
					tool: 'mcp-vertex_overview',
					madeProgress: false,
					progressHash: 'same',
					agentId: 'copilot',
					isOrientation: true,
				},
			]),
		).toBeNull();
	});

	it('emits strong CONTEXT_DRIFT on a no-progress sequence', () => {
		const advisory = assessContextDrift([
			{
				tool: 'search',
				madeProgress: false,
				progressHash: 'stuck',
				agentId: 'copilot',
			},
			{
				tool: 'search',
				madeProgress: false,
				progressHash: 'stuck',
				agentId: 'copilot',
			},
			{
				tool: 'search',
				madeProgress: false,
				progressHash: 'stuck',
				agentId: 'copilot',
			},
		]);
		expect(advisory?.code).toBe('CONTEXT_DRIFT');
		expect(advisory?.severity).toBe('strong');
		expect(advisory?.nextAction).toBe('handoff-to-fresh-agent');
		expect(advisory?.dedupeKey).toBe('CONTEXT_DRIFT:copilot:stuck');
	});

	it('clears when a fresh progress hash appears', () => {
		expect(
			assessContextDrift([
				{
					tool: 'search',
					madeProgress: false,
					progressHash: 'stuck',
					agentId: 'copilot',
				},
				{
					tool: 'search',
					madeProgress: false,
					progressHash: 'stuck',
					agentId: 'copilot',
				},
				{
					tool: 'fs_write',
					madeProgress: true,
					progressHash: 'fresh',
					agentId: 'copilot',
				},
			]),
		).toBeNull();
	});

	it('does not emit for swarm workers (interactive:false)', () => {
		expect(
			assessContextDrift(
				[
					{
						tool: 'search',
						madeProgress: false,
						progressHash: 'stuck',
						agentId: 'falcon',
					},
					{
						tool: 'search',
						madeProgress: false,
						progressHash: 'stuck',
						agentId: 'falcon',
					},
					{
						tool: 'search',
						madeProgress: false,
						progressHash: 'stuck',
						agentId: 'falcon',
					},
				],
				{ interactive: false },
			),
		).toBeNull();
	});
});
