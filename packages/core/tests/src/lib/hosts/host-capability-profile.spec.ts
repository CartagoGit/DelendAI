import { describe, expect, it } from 'vitest';

import {
	buildHostCapabilityPlan,
	type IHostCapabilityProfile,
} from '@delendai/core/public';

describe('buildHostCapabilityPlan', () => {
	it('makes the live MCP surface mandatory and host extensions optional', () => {
		const profile: IHostCapabilityProfile = {
			id: 'generic-mcp',
			capabilities: {
				mcp: { tools: true, prompts: true, resources: true },
				instructions: 'none',
				skills: 'mcp-tool',
				lifecycle: 'none',
				continuation: 'manual',
			},
		};

		expect(buildHostCapabilityPlan(profile)).toEqual({
			hostId: 'generic-mcp',
			baseline: [
				{ capability: 'mcp', mode: 'tools', required: true },
				{ capability: 'mcp', mode: 'prompts', required: true },
				{ capability: 'mcp', mode: 'resources', required: true },
			],
			optional: [
				{ capability: 'skills', mode: 'mcp-tool', required: false },
			],
			continuation: {
				mode: 'manual',
				fallback: 'handoff-and-new-turn',
			},
		});
	});

	it('makes automatic continuation adapter-owned, never an MCP side effect', () => {
		const plan = buildHostCapabilityPlan({
			id: 'lifecycle-host',
			capabilities: {
				mcp: { tools: true, prompts: false, resources: false },
				instructions: 'workspace-file',
				skills: 'native',
				lifecycle: 'hooks',
				continuation: 'host-loop',
			},
		});

		expect(plan.continuation).toEqual({
			mode: 'host-loop',
			fallback: 'adapter-owned-loop',
		});
		expect(plan.optional).toEqual([
			{
				capability: 'instructions',
				mode: 'workspace-file',
				required: false,
			},
			{ capability: 'skills', mode: 'native', required: false },
			{ capability: 'lifecycle', mode: 'hooks', required: false },
		]);
	});

	it('rejects an invalid profile before an adapter pack can be emitted', () => {
		expect(() =>
			buildHostCapabilityPlan({
				id: 'Not a host id',
				capabilities: {
					mcp: { tools: true, prompts: false, resources: false },
					instructions: 'none',
					skills: 'none',
					lifecycle: 'none',
					continuation: 'manual',
				},
			}),
		).toThrow('kebab-case');
	});
});
