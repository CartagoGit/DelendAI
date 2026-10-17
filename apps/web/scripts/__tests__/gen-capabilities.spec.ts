/**
 * gen-capabilities.spec.ts — the site's registry of tools is the registry
 * the server serves.
 *
 * The generator named 13 of the 61 first-party plugins by hand, so the
 * site listed 142 of 280 tools and nothing failed. It now loads every
 * plugin under `plugins/`; this harvests for real and holds it to that.
 */
import { readdirSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { collectTools, loadAllPlugins } from '../gen-capabilities';

const ROOT = join(import.meta.dirname, '..', '..', '..', '..');

describe('the site capabilities harvest', () => {
	it('lists the tools of plugins the old hand-written list left out, each documented', async () => {
		await loadAllPlugins();
		const { tools } = await collectTools();
		const namespaces = new Set(tools.map((tool) => tool.namespace));
		for (const plugin of [
			'orchestrator-runner',
			'agent-orchestrator',
			'external-mcps',
		])
			expect(namespaces).toContain(plugin);
		expect(tools.length).toBeGreaterThan(200);
		expect(
			tools.filter((tool) => tool.description.trim().length === 0),
		).toEqual([]);
		expect(readdirSync(join(ROOT, 'plugins')).length).toBeGreaterThan(50);
	}, 240_000);
});
