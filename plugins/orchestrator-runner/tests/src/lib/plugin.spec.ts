import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import plugin from '../../../src/index';

type Ctx = Parameters<typeof plugin.register>[0];

const makeCtx = (
	dir: string,
	over: { options?: Record<string, unknown>; peers?: readonly string[] } = {},
): Ctx =>
	({
		options: over.options ?? {},
		args: {},
		namespacePrefix: 'mcp-vertex_orchestrator-runner',
		pluginCacheDir: 'orchestrator-runner',
		cacheDir: '.cache/mcp-vertex',
		docsDir: 'docs/mcp-vertex',
		workspace: {
			root: dir,
			resolve: (rel: string) => join(dir, rel),
		},
		peerPlugins: {
			list: () => over.peers ?? [],
			has: (name: string) => (over.peers ?? []).includes(name),
		},
	}) as unknown as Ctx;

describe('orchestrator-runner plugin', () => {
	let dir: string;
	beforeEach(async () => {
		dir = await mkdtemp(join(tmpdir(), 'or-plugin-'));
	});
	afterEach(async () => {
		await rm(dir, { recursive: true, force: true });
	});

	it('declares its identity and the usage-tracking hard dependency (I15)', () => {
		expect(plugin.name).toBe('orchestrator-runner');
		expect(plugin.version).toBe('0.1.0');
		expect(plugin.dependsOn).toContain('usage-tracking');
	});

	it('registers exactly the 3 headless tools + the routing knowledge entry', async () => {
		const regs = await plugin.register(makeCtx(dir));
		const ids = (regs.tools ?? []).map((t) => t.id).sort();
		expect(ids).toEqual([
			'advise_routing',
			'get_quota',
			'healthcheck_providers',
		]);
		expect(regs.knowledge?.[0]?.id).toBe('orchestrator-runner-routing');
	});

	it('every tool declares a summary + i18n descriptionKey', async () => {
		const regs = await plugin.register(makeCtx(dir));
		for (const tool of regs.tools ?? []) {
			expect(tool.summary).toBeTruthy();
			expect(tool.descriptionKey).toMatch(
				/^mcp-vertex_orchestrator-runner_/,
			);
		}
	});

	it('defers to dependsOn when the peer registry is empty at register (no false trip)', () => {
		expect(() =>
			plugin.register(makeCtx(dir, { peers: [] })),
		).not.toThrow();
	});

	it('hard-throws (I15 layer 2) when a populated peer set lacks usage-tracking', () => {
		expect(() =>
			plugin.register(makeCtx(dir, { peers: ['proposals', 'memory'] })),
		).toThrow(/usage-tracking/);
	});

	it('passes when a populated peer set includes usage-tracking', () => {
		expect(() =>
			plugin.register(makeCtx(dir, { peers: ['usage-tracking'] })),
		).not.toThrow();
	});
});
