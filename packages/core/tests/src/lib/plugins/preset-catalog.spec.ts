import { describe, expect, it } from 'vitest';

import {
	PRESET_CATALOG,
	PRESET_KIND,
	resolvePresetMembers,
} from '@mcp-vertex/core/lib/plugins/preset-catalog';

describe('PRESET_CATALOG', async () => {
	it('lists presets in ⊇ order: minimal, standard, swarm, full', async () => {
		expect(PRESET_CATALOG.map((def) => def.id)).toEqual(PRESET_KIND);
	});

	it('stores deltas, not full membership lists', async () => {
		// minimal: 2 members (the base)
		expect(PRESET_CATALOG[0]?.members.length).toBe(2);
		// standard: adds 5 on top of minimal
		expect(PRESET_CATALOG[1]?.members.length).toBe(5);
		// swarm: adds 5 on top of standard
		expect(PRESET_CATALOG[2]?.members.length).toBe(5);
		// full: adds 2 host-only on top of swarm
		expect(PRESET_CATALOG[3]?.members.length).toBe(2);
	});

	it('marks every full-preset member as hostOnly', async () => {
		const full = PRESET_CATALOG[3];
		expect(full).toBeDefined();
		if (full === undefined) return;
		for (const member of full.members) {
			expect(member.hostOnly).toBe(true);
		}
	});

	it('forbids hostOnly in minimal, standard, swarm', async () => {
		for (const def of PRESET_CATALOG.slice(0, 3)) {
			for (const member of def.members) {
				expect(member.hostOnly).toBeUndefined();
			}
		}
	});

	it('every catalog plugin id corresponds to a real package on disk', async () => {
		const { stat } = await import('node:fs/promises');
		const { join } = await import('node:path');
		// The repo root is 4 levels up from this spec: tests/src/lib/plugins → src.
		const here = new URL(import.meta.url).pathname;
		const specDir = here.replace(/\/[^/]*$/, '');
		const repoRoot = join(specDir, '..', '..', '..', '..', '..', '..');
		const ids = new Set<string>();
		for (const def of PRESET_CATALOG) {
			for (const member of def.members) ids.add(member.plugin);
		}
		for (const id of ids) {
			// `issues` ships in f00042 in the same proposal batch. Until that
			// lands, we tolerate it being absent in this spec — the catalog
			// still references it, the install path is just not yet on disk.
			if (id === 'issues') continue;
			const pluginPath = join(repoRoot, 'plugins', id, 'package.json');
			const pkgPath = join(repoRoot, 'packages', id, 'package.json');
			const [pluginStat, pkgStat] = await Promise.all([
				stat(pluginPath).catch(() => null),
				stat(pkgPath).catch(() => null),
			]);
			expect(
				pluginStat?.isFile() || pkgStat?.isFile(),
				`plugin id "${id}" has no package.json under plugins/ or packages/`,
			).toBe(true);
		}
	});
});

describe('resolvePresetMembers', async () => {
	it('returns [] for unknown preset names', async () => {
		expect(resolvePresetMembers('unknown')).toEqual([]);
		expect(resolvePresetMembers(undefined)).toEqual([]);
	});

	it('resolves minimal = [git, search]', async () => {
		expect(resolvePresetMembers('minimal')).toEqual(['git', 'search']);
	});

	it('resolves standard = minimal + memory/docs/rules/quality/deps', async () => {
		const resolved = resolvePresetMembers('standard');
		expect(resolved).toContain('git');
		expect(resolved).toContain('search');
		expect(resolved).toContain('memory');
		expect(resolved).toContain('docs');
		expect(resolved).toContain('rules');
		expect(resolved).toContain('quality');
		expect(resolved).toContain('deps');
		expect(resolved.length).toBe(7);
	});

	it('resolves swarm = standard + proposals/notification/logs/status-marker/test-convention', async () => {
		const resolved = resolvePresetMembers('swarm');
		expect(resolved).toContain('proposals');
		expect(resolved).toContain('notification');
		expect(resolved).toContain('logs');
		expect(resolved).toContain('status-marker');
		expect(resolved).toContain('test-convention');
		expect(resolved).not.toContain('audit');
		expect(resolved).not.toContain('issues');
	});

	it('resolves full = swarm + web-fetch/issues', async () => {
		const resolved = resolvePresetMembers('full');
		expect(resolved).toContain('web-fetch');
		expect(resolved).toContain('issues');
		expect(resolved).not.toContain('audit');
		expect(resolved).toContain('logs');
		expect(resolved).toContain('proposals');
		expect(resolved).toContain('notification');
	});

	it('preserves the ⊇ chain ordering', async () => {
		const full = resolvePresetMembers('full');
		const swarm = resolvePresetMembers('swarm');
		const standard = resolvePresetMembers('standard');
		const minimal = resolvePresetMembers('minimal');
		for (let i = 0; i < swarm.length; i += 1) {
			expect(full[i]).toBe(swarm[i]);
		}
		for (let i = 0; i < standard.length; i += 1) {
			expect(full[i]).toBe(standard[i]);
		}
		for (let i = 0; i < minimal.length; i += 1) {
			expect(full[i]).toBe(minimal[i]);
		}
	});

	it('deduplicates plugins that appear in multiple deltas', async () => {
		const resolved = resolvePresetMembers('full');
		expect(new Set(resolved).size).toBe(resolved.length);
	});
});
