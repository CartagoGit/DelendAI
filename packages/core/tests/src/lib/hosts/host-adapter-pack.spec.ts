import { describe, expect, it } from 'vitest';

import { buildHostAdapterPack } from '@delendai/core/public';

describe('buildHostAdapterPack', () => {
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
