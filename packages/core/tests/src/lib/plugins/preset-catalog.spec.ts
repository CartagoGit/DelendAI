import { describe, expect, it } from 'vitest';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import {
	PRESET_CATALOG,
	PRESET_KIND,
	resolvePresetMembers,
} from '@delendai/core/lib/plugins/preset-catalog';
import apiPlugin from '../../../../../../plugins/api/src/index';

const repoRootFromSpec = (): string => {
	const here = new URL(import.meta.url).pathname;
	const specDir = here.replace(/\/[^/]*$/, '');
	return join(specDir, '..', '..', '..', '..', '..', '..');
};

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
		// standard: adds 17 on top of minimal (f00115 added test-policy, f00123 added refactor, f00128 S1 added database, f00132 S1 added diagram, f00133 added container, f00135 added env, f00137 added skills-pack, f00138 added prompts-pack, f00158 added error-reporting, x00230 added auto-agent-selector, q00007 added agent-orchestrator)
		expect(PRESET_CATALOG[2]?.members.length).toBe(17);
		// swarm: adds 9 on top of standard (f00121 S3 added forge,
		// completion added by the completion plugin)
		expect(PRESET_CATALOG[3]?.members.length).toBe(9);
		// full: adds 2 host-only + api + prompt-eval + orchestrator on top of
		// swarm, plus the three remote-provider plugins
		// (remote-provider-core, github, gitlab)
		// (f00177 / MAN-001: `changelog` removed — `private: true`, never
		// published to npm, cannot be a member of a preset an external
		// adopter installs), plus the 5 plugins that used to be reachable
		// from no preset at all (audit-orchestrator, browser, cache,
		// external-mcps, observability — lazily indexed, so they cost a
		// catalog entry until one of their tools is called).
		expect(PRESET_CATALOG[4]?.members.length).toBe(13);
		// vertex: 38 members, exactly mirroring mcp-vertex.config.json's
		// `plugins` object (x00166 — corrected a long-stale drift where
		// this preset had 6 phantom plugins not actually loaded and was
		// missing 17 real ones, including `proposals`; f00165 added
		// context-for-change; f00169 adds impact-analysis; f00166 adds
		// project-health; f00167 adds quality-policy; f00168 adds
		// adaptive-optimizer.
		expect(PRESET_CATALOG[5]?.members.length).toBe(38);
	});

	it('defines `lean` as an independent essentials preset', async () => {
		const lean = PRESET_CATALOG[1];
		expect(lean?.id).toBe('lean');
		expect(lean?.independent).toBe(true);
		expect(lean?.role).toBe('habitual-work');
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
		expect(vertex?.role).toBe('mcp-vertex-dogfood');
	});

	it('marks every stack pack (web-app, backend-api, cli-tool) as independent', async () => {
		for (const id of ['web-app', 'backend-api', 'cli-tool']) {
			const def = PRESET_CATALOG.find((d) => d.id === id);
			expect(def, `pack ${id} missing from PRESET_CATALOG`).toBeDefined();
			expect(def?.independent).toBe(true);
		}
	});

	it('stack packs resolve to exactly their own members (no chain accumulation)', async () => {
		// `standard` resolves to 19 plugins. None of those should leak
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
		const repoRoot = repoRootFromSpec();
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

	it('keeps the api plugin catalog aligned with backend-api preset membership', async () => {
		const registration = await apiPlugin.register({
			namespacePrefix: 'api',
			options: {},
			cacheDir: '.cache/mcp-vertex',
			pluginCacheDir: '.cache/mcp-vertex/api',
			pluginDocsDir: 'docs/plugins/api',
			workspace: {
				root: '/workspace',
				resolve: (path: string) => `/workspace/${path}`,
			},
			corePaths: {
				cacheDir: '.cache/mcp-vertex',
				docsDir: 'docs/mcp-vertex',
			},
			keepLegacy: false,
			agentWorktreeEnabled: false,
			commitAuthor: {
				mode: 'workspace-config',
				identity: 'Copilot',
				named: 'Copilot',
			},
			args: [],
			cacheEvictionRegistry: {
				register: () => undefined,
			},
			peerPlugins: {},
		} as never);
		const knowledge = registration.knowledge?.find(
			(entry) => entry.id === 'api-plugin-catalog',
		);
		expect(knowledge).toBeDefined();
		const expectedLine = `- \`backend-api\` — the preset currently ships ${resolvePresetMembers(
			'backend-api',
		)
			.map((plugin) => `\`${plugin}\``)
			.join(', ')
			.replace(
				/, ([^,]+)$/u,
				', and $1',
			)}; it does not include \`api\` by default.`;
		expect(knowledge?.body).toContain(expectedLine);
	});

	it('derives backend-api summary from actual membership without stale opt-in claims', async () => {
		const backendApi = PRESET_CATALOG.find(
			(definition) => definition.id === 'backend-api',
		);
		expect(backendApi).toBeDefined();
		expect(backendApi?.summary).toContain('16 plugins');
		expect(backendApi?.summary).not.toContain('audit');
		expect(backendApi?.summary).not.toContain('perf');
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
			'auto-agent-selector',
			'agent-orchestrator',
		]);
		expect(resolvePresetMembers('swarm').length).toBe(27);
		// f00177 / MAN-001: `changelog` removed from `full` (private,
		// never published to npm); the three remote-provider plugins
		// (remote-provider-core, github, gitlab) raise it back to 34, and
		// the 5 previously preset-less plugins bring it to 39.
		expect(resolvePresetMembers('full').length).toBe(39);
		expect(resolvePresetMembers('swarm')).not.toContain('lean');
	});

	it('resolves standard = minimal + memory/docs/rules/quality/refactor/deps/test-policy/database/diagram/container/env', async () => {
		const resolved = resolvePresetMembers('standard');
		expect(
			PRESET_CATALOG.find((definition) => definition.id === 'standard')
				?.role,
		).toBe('adaptive-task-aware');
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
		expect(resolved).toContain('auto-agent-selector');
		expect(resolved.length).toBe(19);
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

	it('resolves vertex to ONLY the plugin keys from the live root config', async () => {
		const resolved = resolvePresetMembers('vertex');
		const config = JSON.parse(
			await readFile(
				join(repoRootFromSpec(), 'mcp-vertex.config.json'),
				'utf8',
			),
		) as {
			plugins?: Readonly<Record<string, unknown>>;
		};
		expect([...resolved].sort()).toEqual(
			Object.keys(config.plugins ?? {}).sort(),
		);
	});

	it('documents the canonical preset roles from PRE-004', async () => {
		expect(
			PRESET_CATALOG.slice(0, 5).map((definition) => definition.role),
		).toEqual([
			'orientation',
			'habitual-work',
			'adaptive-task-aware',
			'multi-agent',
			'diagnostic',
		]);
	});

	it('declares measured budget metadata for every preset', async () => {
		for (const definition of PRESET_CATALOG) {
			expect(definition.budget.toolCount.source).toBe('measured-runtime');
			expect(definition.budget.toolCount.value).toBeGreaterThan(0);
			expect(definition.budget.schemaBytes.source).toBe(
				'measured-runtime',
			);
			expect(definition.budget.schemaBytes.value).toBeGreaterThan(0);
			expect(definition.budget.coldStartTokens.source).toBe(
				'estimated-from-schema-bytes',
			);
			expect(definition.budget.coldStartTokens.value).toBeGreaterThan(0);
			expect(
				definition.budget.coldStartTokens.bytesPerEstimatedToken,
			).toBe(4);
			expect(definition.budget.permissions.source).toBe(
				'measured-tool-effects',
			);
			expect(definition.budget.permissions.values.length).toBeGreaterThan(
				0,
			);
			expect(definition.budget.capabilities.source).toBe('role-profile');
			expect(
				definition.budget.capabilities.values.length,
			).toBeGreaterThan(0);
		}
	});

	it('derives budget permissions from effective preset membership', async () => {
		const standard = PRESET_CATALOG.find(
			(definition) => definition.id === 'standard',
		);
		expect(standard).toBeDefined();
		expect(standard?.budget.permissions.values).toEqual([
			'container',
			'database',
			'env-read',
			'filesystem-read',
			'filesystem-write',
			'forge-write',
			'git-read',
			'git-write',
			'network',
			'process',
		]);
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
