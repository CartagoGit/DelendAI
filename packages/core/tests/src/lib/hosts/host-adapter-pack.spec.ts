import { describe, expect, it } from 'vitest';

import {
	buildHostAdapterPack,
	buildHostCapabilityPlan,
	createHostCapabilityRegistry,
	type IHostCapabilityManifest,
	type IHostCapabilityProfile,
} from '@delendai/core/public';

describe('buildHostAdapterPack', () => {
	it('builds registry, profile plan and pack from the public surface only', () => {
		const manifest: IHostCapabilityManifest = {
			contract: 'delendai.host-capability-manifest',
			version: 1,
			hostId: 'portable-host',
			mcp: {
				tools: true,
				prompts: true,
				resources: false,
				structuredContent: true,
				listChanged: false,
				notifications: true,
			},
			skills: 'mcp-tool',
			subagents: 'none',
		};
		const profile: IHostCapabilityProfile = {
			id: manifest.hostId,
			capabilities: {
				mcp: {
					tools: manifest.mcp.tools,
					prompts: manifest.mcp.prompts,
					resources: manifest.mcp.resources,
				},
				instructions: 'prompt',
				skills: 'mcp-tool',
				lifecycle: 'observe',
				continuation: 'manual',
			},
		};

		const registry = createHostCapabilityRegistry([manifest]);
		const plan = buildHostCapabilityPlan(profile);
		const pack = buildHostAdapterPack(profile);

		expect(registry.get('portable-host')).toEqual(manifest);
		expect(registry.supportsPrompts('portable-host')).toBe(true);
		expect(plan.hostId).toBe('portable-host');
		expect(pack).toEqual({
			version: 1,
			hostId: 'portable-host',
			actions: [
				{ kind: 'connect-mcp', mode: 'tools', required: true },
				{ kind: 'connect-mcp', mode: 'prompts', required: true },
				{ kind: 'load-instructions', mode: 'prompt', required: false },
				{ kind: 'install-skills', mode: 'mcp-tool', required: false },
				{ kind: 'configure-lifecycle', mode: 'observe', required: false },
				{ kind: 'continue-work', mode: 'manual', required: false },
			],
			continuation: {
				mode: 'manual',
				requiresHostRunner: false,
				fallback: 'handoff-and-new-turn',
			},
		});
	});

	it('always emits the full declared MCP baseline before optional actions', () => {
		const pack = buildHostAdapterPack({
			id: 'portable-host',
			capabilities: {
				mcp: { tools: true, prompts: true, resources: true },
				instructions: 'prompt',
				skills: 'mcp-tool',
				lifecycle: 'observe',
				continuation: 'manual',
			},
		});

		expect(pack.actions).toEqual([
			{ kind: 'connect-mcp', mode: 'tools', required: true },
			{ kind: 'connect-mcp', mode: 'prompts', required: true },
			{ kind: 'connect-mcp', mode: 'resources', required: true },
			{ kind: 'load-instructions', mode: 'prompt', required: false },
			{ kind: 'install-skills', mode: 'mcp-tool', required: false },
			{ kind: 'configure-lifecycle', mode: 'observe', required: false },
			{ kind: 'continue-work', mode: 'manual', required: false },
		]);
		expect(pack.continuation).toEqual({
			mode: 'manual',
			requiresHostRunner: false,
			fallback: 'handoff-and-new-turn',
		});
	});

	it('does not invent unavailable native integrations', () => {
		const pack = buildHostAdapterPack({
			id: 'minimal-mcp',
			capabilities: {
				mcp: { tools: true, prompts: false, resources: false },
				instructions: 'none',
				skills: 'none',
				lifecycle: 'none',
				continuation: 'host-loop',
			},
		});

		expect(pack.actions).toEqual([
			{ kind: 'connect-mcp', mode: 'tools', required: true },
			{ kind: 'continue-work', mode: 'host-loop', required: false },
		]);
		expect(pack.continuation).toEqual({
			mode: 'host-loop',
			requiresHostRunner: true,
			fallback: 'adapter-owned-loop',
		});
	});
});
