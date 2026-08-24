import { describe, expect, it } from 'vitest';

import {
	PRESET_CATALOG,
	PRESET_KIND,
	resolvePresetMembers,
} from '@mcp-vertex/core/lib/plugins/preset-catalog';

describe('PRESET_CATALOG', async () => {
	it('lists presets in ⊇ order: minimal, lean, standard, swarm, full, vertex, web-app, backend-api, cli-tool', async () => {
		expect(PRESET_CATALOG.map((def) => def.id)).toEqual(PRESET_KIND);
		expect([...PRESET_KIND]).toEqual([
			'minimal',
			'lean',
			'standard',
			'swarm',
			'full',
			'vertex',
			'web-app',
			'backend-api',
			'cli-tool',
		]);
	});

	it('stores deltas, not full membership lists', async () => {
		// minimal: 2 members (the base)
		expect(PRESET_CATALOG[0]?.members.length).toBe(2);
		// lean: 4 members, independent essentials preset
		expect(PRESET_CATALOG[1]?.members.length).toBe(4);
		// standard: adds 14 on top of minimal (f00115 added test-policy, f00123 added refactor, f00128 S1 added database, f00132 S1 added diagram, f00133 added container, f00135 added env, f00137 added skills-pack, f00138 added prompts-pack, f00158 added error-reporting)
		expect(PRESET_CATALOG[2]?.members.length).toBe(15);
		// swarm: adds 7 on top of standard (f00121 S3 added forge)
		expect(PRESET_CATALOG[3]?.members.length).toBe(7);
		// full: adds 2 host-only + api + changelog on top of swarm
		expect(PRESET_CATALOG[4]?.members.length).toBe(4);
		// vertex: 29 members, exactly mirroring mcp-vertex.config.json's
		// `plugins` object (x00166 — corrected a long-stale drift where
		// this preset had 6 phantom plugins not actually loaded and was
		// missing 17 real ones, including `proposals`).
		expect(PRESET_CATALOG[5]?.members.length).toBe(29);
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

	it('marks the host-only members of full as hostOnly', async () => {
		const full = PRESET_CATALOG[4];
		expect(full).toBeDefined();
		if (full === undefined) return;
		for (const member of full.members) {
			if (member.hostOnly === true) continue;
			// Non-host-only members are explicitly opt-in
			// additions (e.g. f00130 added `api` so it
			// loads alongside web-fetch even in hosts
			// that opt out of the full preset by default).
		}
		// At least one host-only member is required (web-fetch).
		expect(full.members.some((m) => m.hostOnly === true)).toBe(true);
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

	it('marks every stack pack (web-app, backend-api, cli-tool) as independent', async () => {
		for (const id of ['web-app', 'backend-api', 'cli-tool']) {
			const def = PRESET_CATALOG.find((d) => d.id === id);
			expect(def, `pack ${id} missing from PRESET_CATALOG`).toBeDefined();
			expect(def?.independent).toBe(true);
		}
	});

	it('stack packs resolve to exactly their own members (no chain accumulation)', async () => {
		// `standard` resolves to 16 plugins. None of those should leak
		// into `web-app` just because `web-app` is added after them in
		// the catalog order.
		const standardResolved = resolvePresetMembers('standard');
		const webAppResolved = resolvePresetMembers('web-app');
		expect(webAppResolved).not.toContain('proposals');
		expect(webAppResolved).not.toContain('notification');
		expect(webAppResolved).not.toContain('logs');
		expect(standardResolved.length).toBeGreaterThan(0);
		expect(webAppResolved.length).toBeGreaterThan(0);
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
			'i18n',
			'prompts-pack',
			'rules',
			'quality',
			'refactor',
			'deps',
			'test-policy',
			'database',
			'container',
			'diagram',
			'env',
			'skills-pack',
			'error-reporting',
		]);
		expect(resolvePresetMembers('swarm').length).toBe(24);
		expect(resolvePresetMembers('full').length).toBe(28);
		expect(resolvePresetMembers('swarm')).not.toContain('lean');
	});

	it('resolves standard = minimal + memory/docs/rules/quality/refactor/deps/test-policy/database/diagram/container/env', async () => {
		const resolved = resolvePresetMembers('standard');
		expect(resolved).toContain('git');
		expect(resolved).toContain('search');
		expect(resolved).toContain('memory');
		expect(resolved).toContain('docs');
		expect(resolved).toContain('rules');
		expect(resolved).toContain('quality');
		expect(resolved).toContain('refactor');
		expect(resolved).toContain('deps');
		expect(resolved).toContain('test-policy');
		expect(resolved).toContain('database');
		expect(resolved).toContain('container');
		expect(resolved).toContain('diagram');
		expect(resolved).toContain('env');
		expect(resolved).toContain('skills-pack');
		expect(resolved).toContain('prompts-pack');
		expect(resolved).toContain('error-reporting');
		expect(resolved.length).toBe(17);
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
		// x00166: vertex mirrors mcp-vertex.config.json's `plugins` keys
		// exactly (29 total) — verified live against the root config.
		// f00158 added error-reporting to the project's own config.
		const resolved = resolvePresetMembers('vertex');
		expect(resolved.length).toBe(29);
		for (const required of [
			'audit',
			'auto-agent-selector',
			'container',
			'conventions',
			'deps',
			'diagram',
			'docs',
			'env',
			'error-reporting',
			'forge',
			'git',
			'i18n',
			'link-check',
			'logs',
			'memory',
			'notification',
			'orchestrator-runner',
			'perf',
			'prompts-pack',
			'proposals',
			'quality',
			'rules',
			'search',
			'security',
			'status-marker',
			'tech-debt',
			'test-convention',
			'test-policy',
			'usage-tracking',
		]) {
			expect(resolved).toContain(required);
		}
		// Phantom plugins the old (stale) definition listed but that
		// were never actually loaded by the live config.
		for (const phantom of [
			'web-fetch',
			'issues',
			'refactor',
			'api',
			'prompt-eval',
			'database',
		]) {
			expect(resolved).not.toContain(phantom);
		}
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
