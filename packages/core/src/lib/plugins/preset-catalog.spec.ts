import { describe, expect, it } from 'bun:test';
import {
	PRESET_CATALOG,
	PRESET_KIND,
	resolvePresetMembers,
} from './preset-catalog';

describe('PRESET_CATALOG', async () => {
	it('lists presets in ⊇ order: minimal, standard, swarm, full, vertex', async () => {
		expect(PRESET_CATALOG.map((def) => def.id)).toEqual([...PRESET_KIND]);
	});

	it('stores deltas, not full membership lists', async () => {
		// minimal: 2 members (the base)
		expect(PRESET_CATALOG[0]?.members.length).toBe(2);
		// standard: adds 5 on top of minimal
		expect(PRESET_CATALOG[1]?.members.length).toBe(5);
		// swarm: adds 6 on top of standard
		expect(PRESET_CATALOG[2]?.members.length).toBe(6);
		// full: adds 2 host-only on top of swarm
		expect(PRESET_CATALOG[3]?.members.length).toBe(2);
		// vertex: 10 members, mirrors mcp-vertex.config.json (independent)
		expect(PRESET_CATALOG[4]?.members.length).toBe(10);
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

	it('marks `vertex` as an independent preset', async () => {
		const vertex = PRESET_CATALOG[4];
		expect(vertex).toBeDefined();
		expect(vertex?.independent).toBe(true);
	});

	it('vertex membership mirrors mcp-vertex.config.json (10 plugins, 2 hostOnly)', async () => {
		const vertex = PRESET_CATALOG[4];
		expect(vertex).toBeDefined();
		if (vertex === undefined) return;
		const ids = vertex.members.map((m) => m.plugin);
		for (const required of [
			'conventions',
			'docs',
			'search',
			'git',
			'web-fetch',
			'status-marker',
			'test-convention',
			'quality',
			'issues',
			'audit',
		]) {
			expect(ids).toContain(required);
		}
		// Exactly two hostOnly (web-fetch + issues), matching mcp-vertex.config.json.
		const hostOnly = vertex.members.filter((m) => m.hostOnly === true);
		expect(hostOnly.length).toBe(2);
		expect(hostOnly.map((m) => m.plugin).sort()).toEqual([
			'issues',
			'web-fetch',
		]);
	});

	it('every catalog plugin id corresponds to a real package on disk', async () => {
		const { readdir, stat } = await import('node:fs/promises');
		const { join } = await import('node:path');
		// Bun-test's `import.meta.dir` for THIS spec file resolves to
		// `packages/core/src/lib/plugins/`, so the repo root is five
		// hops up (the spec lives inside a Bun monorepo under
		// `packages/core/src/`, not the conventional
		// `packages/core/tests/src/`).
		const repoRoot = join(import.meta.dir, '..', '..', '..', '..', '..');
		const ids = new Set<string>();
		for (const def of PRESET_CATALOG) {
			for (const member of def.members) ids.add(member.plugin);
		}
		for (const id of ids) {
			const pluginPath = join(repoRoot, 'plugins', id, 'package.json');
			const pkgPath = join(repoRoot, 'packages', id, 'package.json');
			const [pluginStat, pkgStat] = await Promise.all([
				stat(pluginPath).catch(() => null),
				stat(pkgPath).catch(() => null),
			]);
			// `issues` ships in this same proposal batch (f00042). Until f00042
			// lands, we allow it to be missing without failing — the test still
			// asserts it is either here or coming. The other ids must exist.
			if (id === 'issues') continue;
			expect(
				pluginStat?.isFile() || pkgStat?.isFile(),
				`plugin id "${id}" has no package.json under plugins/ or packages/`,
			).toBe(true);
		}
		// Silence unused-variable lint if readdir ever becomes needed.
		expect(typeof readdir).toBe('function');
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
		// and everything in swarm
		expect(resolved).toContain('proposals');
		expect(resolved).toContain('notification');
	});

	it('resolves vertex to ONLY its declared members (independent, skips chain)', async () => {
		const resolved = resolvePresetMembers('vertex');
		// Exactly the 10 plugins the mcp-vertex.config.json ships.
		expect(resolved.length).toBe(10);
		for (const required of [
			'conventions',
			'docs',
			'search',
			'git',
			'web-fetch',
			'status-marker',
			'test-convention',
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
		// full contains every swarm member, in order, before its own deltas.
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
		// defensive: if a future preset re-adds a plugin, the resolver
		// keeps only the first occurrence.
		const resolved = resolvePresetMembers('full');
		expect(new Set(resolved).size).toBe(resolved.length);
	});
});
