/**
 * agent-registry.service.spec.ts — the public registry of coding agents,
 * compacted to how each one is launched.
 */
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import {
	compactAgentRegistry,
	readAgentRegistry,
	shippedAgentRegistry,
} from '../../../../src/lib/shared/agent-registry.service';

const RAW = {
	version: '1.0.0',
	agents: [
		{
			id: 'qwen-code',
			name: 'Qwen Code',
			version: '0.25.3',
			description: 'Alibaba Qwen coding agent',
			distribution: {
				npx: {
					package: '@qwen-code/qwen-code@0.25.3',
					args: ['--acp'],
				},
			},
		},
		{
			id: 'opencode',
			name: 'OpenCode',
			version: '1.19.3',
			repository: 'https://github.com/anomalyco/opencode',
			distribution: {
				binary: {
					'linux-x86_64': {
						archive:
							'https://example.test/opencode-linux-x64.tar.gz',
						cmd: './opencode',
						args: ['acp'],
						sha256: 'ab',
					},
					'broken-os': { cmd: './x' },
				},
			},
		},
		{
			id: 'fast-agent',
			distribution: {
				uvx: { package: 'fast-agent-acp', env: { A: '1', B: 2 } },
			},
		},
		{ name: 'no id' },
		'not an object',
	],
};

describe('compactAgentRegistry', () => {
	it('keeps each agent with how it is launched', () => {
		const registry = compactAgentRegistry(RAW);
		expect(registry?.agents.map((agent) => agent.id)).toEqual([
			'qwen-code',
			'opencode',
			'fast-agent',
		]);
		const [qwen, opencode, fast] = registry?.agents ?? [];
		expect(qwen?.distribution.npx).toEqual({
			package: '@qwen-code/qwen-code@0.25.3',
			args: ['--acp'],
			env: undefined,
		});
		expect(Object.keys(opencode?.distribution.binary ?? {})).toEqual([
			'linux-x86_64',
		]);
		expect(opencode?.distribution.binary?.['linux-x86_64']?.sha256).toBe(
			'ab',
		);
		expect(fast?.name).toBe('fast-agent');
		expect(fast?.distribution.uvx?.env).toEqual({ A: '1' });
	});

	it('is nothing for what is not a registry', () => {
		expect(compactAgentRegistry(null)).toBeUndefined();
		expect(compactAgentRegistry({ agents: 'x' })).toBeUndefined();
		expect(compactAgentRegistry({ agents: [] })).toBeUndefined();
	});
});

describe('readAgentRegistry', () => {
	it('reads a source, and falls back to the dated snapshot shipped with delendai', async () => {
		const cacheDir = join(
			mkdtempSync(join(tmpdir(), 'agents-')),
			'catalogues',
		);
		const fromSource = await readAgentRegistry({
			cacheDir,
			sources: ['https://example.test/registry.json'],
			fetch: async () => ({ status: 200, body: JSON.stringify(RAW) }),
		});
		expect(fromSource?.agents).toHaveLength(3);
		const shipped = await shippedAgentRegistry();
		expect(shipped?.meta.source).toContain('agentclientprotocol.com');
		expect(
			shipped?.data.agents.some((agent) => agent.id === 'opencode'),
		).toBe(true);
		const offline = await readAgentRegistry({
			cacheDir: join(
				mkdtempSync(join(tmpdir(), 'agents-')),
				'catalogues',
			),
			sources: ['https://example.test/gone.json'],
			fetch: async () => {
				throw new Error('offline');
			},
		});
		expect(offline?.agents.length).toBe(shipped?.data.agents.length);
	});
});
