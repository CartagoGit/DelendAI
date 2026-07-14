import { describe, expect, it } from 'vitest';

import {
	PRESET_CATALOG,
	PRESET_KIND,
	resolvePresetMembers,
} from '@mcp-vertex/core/lib/plugins/preset-catalog';

describe('PRESET_CATALOG', async () => {
	it('lists presets in ⊇ order: minimal, lean, standard, swarm, full, vertex', async () => {
		expect(PRESET_CATALOG.map((def) => def.id)).toEqual(PRESET_KIND);
		expect([...PRESET_KIND]).toEqual([
			'minimal',
			'lean',
			'standard',
			'swarm',
			'full',
			'vertex',
		]);
	});

	it('stores deltas, not full membership lists', async () => {
		// minimal: 2 members (the base)
		expect(PRESET_CATALOG[0]?.members.length).toBe(2);
		// lean: 4 members, independent essentials preset
		expect(PRESET_CATALOG[1]?.members.length).toBe(4);
		// standard: adds 6 on top of minimal (f00115 added test-policy)
		expect(PRESET_CATALOG[2]?.members.length).toBe(6);
		// swarm: adds 6 on top of standard
		expect(PRESET_CATALOG[3]?.members.length).toBe(6);
		// full: adds 2 host-only on top of swarm
		expect(PRESET_CATALOG[4]?.members.length).toBe(2);
		// vertex: 11 members, mirrors mcp-vertex.config.json (independent)
		expect(PRESET_CATALOG[5]?.members.length).toBe(11);
	});

	it('defines `lean` as an independent essentials preset', async () => {
		const lean = PRESET_CATALOG[1];
		expect(lean?.id).toBe('lean');
		expect(lean?.independent).toBe(true);
		expect(lean?.members.map((m) => m.plugin)).toEqual([
			'git',
			'search',
			'memory',
			'docs',
		]);
		for (const member of lean?.members ?? []) {
			expect(member.hostOnly).toBeUndefined();
		}
	});

	it('marks every full-preset member as hostOnly', async () => {
		const full = PRESET_CATALOG[4];
		expect(full).toBeDefined();
		if (full === undefined) return;
		for (const member of full.members) {
			expect(member.hostOnly).toBe(true);
		}
	});

	it('forbids hostOnly in minimal, lean, standard, swarm', async () => {
		for (const id of ['minimal', 'lean', 'standard', 'swarm']) {
			const def = PRESET_CATALOG.find((d) => d.id === id);
			expect(def).toBeDefined();
			for (const member of def?.members ?? []) {
				expect(member.hostOnly).toBeUndefined();
			}
		}
	});

	it('marks `vertex` as an independent preset', async () => {
		const vertex = PRESET_CATALOG[5];
		expect(vertex).toBeDefined();
		expect(vertex?.independent).toBe(true);
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

	it('resolves lean to EXACTLY [git, search, memory, docs] (independent, no chain)', async () => {
		expect(resolvePresetMembers('lean')).toEqual([
			'git',
			'search',
			'memory',
			'docs',
		]);
		const resolved = resolvePresetMembers('lean');
		expect(resolved).not.toContain('rules');
		expect(resolved).not.toContain('quality');
		expect(resolved).not.toContain('deps');
		expect(resolved).not.toContain('proposals');
	});

	it('lean (independent) does NOT alter standard/swarm/full membership', async () => {
		expect(resolvePresetMembers('standard')).toEqual([
			'git',
			'search',
			'memory',
			'docs',
			'rules',
			'quality',
			'deps',
			'test-policy',
		]);
		expect(resolvePresetMembers('swarm').length).toBe(14);
		expect(resolvePresetMembers('full').length).toBe(16);
		expect(resolvePresetMembers('swarm')).not.toContain('lean');
	});

	it('resolves standard = minimal + memory/docs/rules/quality/deps/test-policy', async () => {
		const resolved = resolvePresetMembers('standard');
		expect(resolved).toContain('git');
		expect(resolved).toContain('search');
		expect(resolved).toContain('memory');
		expect(resolved).toContain('docs');
		expect(resolved).toContain('rules');
		expect(resolved).toContain('quality');
		expect(resolved).toContain('deps');
		expect(resolved).toContain('test-policy');
		expect(resolved.length).toBe(8);
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

	it('resolves vertex to ONLY its declared members (independent, skips chain)', async () => {
		const resolved = resolvePresetMembers('vertex');
		expect(resolved.length).toBe(11);
		for (const required of [
			'conventions',
			'docs',
			'search',
			'git',
			'web-fetch',
			'status-marker',
			'test-convention',
			'test-policy',
			'quality',
			'issues',
			'audit',
		]) {
			expect(resolved).toContain(required);
		}
		// Independent presets do NOT inherit swarm — those plugins
		// are intentionally absent from mcp-vertex.config.json.
		expect(resolved).not.toContain('memory');
		expect(resolved).not.toContain('rules');
		expect(resolved).not.toContain('deps');
		expect(resolved).not.toContain('proposals');
		expect(resolved).not.toContain('notification');
		expect(resolved).not.toContain('logs');
	});

	it('preserves the ⊇ chain ordering for chain presets', async () => {
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
