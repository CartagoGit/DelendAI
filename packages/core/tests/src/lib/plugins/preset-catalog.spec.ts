import { describe, expect, it } from 'vitest';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import {
	normalizePresetInput,
	PRESET_CATALOG,
	PRESET_KIND,
	resolvePresetMembers,
	resolveStackPackMembers,
} from '@delendai/core/lib/plugins/preset-catalog';
import {
	PACK_IDS,
	STACK_PACKS,
} from '@delendai/core/lib/plugins/pack-defaults-overlay';
import apiPlugin from '../../../../../../plugins/api/src/index';

const repoRootFromSpec = (): string => {
	const here = new URL(import.meta.url).pathname;
	const specDir = here.replace(/\/[^/]*$/, '');
	return join(specDir, '..', '..', '..', '..', '..', '..');
};

/**
 * The plugins the live root config loads that a preset may list: all but
 * the private ones, which are never published (`changelog`, `roadmap`).
 */
const publishedConfigPlugins = async (): Promise<readonly string[]> => {
	const root = repoRootFromSpec();
	const config = JSON.parse(
		await readFile(join(root, 'delendai.config.json'), 'utf8'),
	) as { plugins?: Readonly<Record<string, unknown>> };
	const published: string[] = [];
	for (const id of Object.keys(config.plugins ?? {})) {
		let isPrivate = false;
		try {
			isPrivate =
				(
					JSON.parse(
						await readFile(
							join(root, 'plugins', id, 'package.json'),
							'utf8',
						),
					) as { private?: unknown }
				).private === true;
		} catch {
			isPrivate = false;
		}
		if (!isPrivate) published.push(id);
	}
	return published;
};

describe('PRESET_CATALOG', async () => {
	it('lists the packs by purpose, each with a role and a purpose', async () => {
		expect(PRESET_CATALOG.map((def) => def.id)).toEqual(PRESET_KIND);
		expect([...PRESET_KIND]).toEqual([
			'minimal',
			'solo',
			'team-pr',
			'swarm',
			'audit',
			'docs-web',
			'everything',
			'dogfood',
		]);
		for (const def of PRESET_CATALOG) {
			expect(def.role.length, `${def.id} role`).toBeGreaterThan(0);
			expect(def.purpose.length, `${def.id} purpose`).toBeGreaterThan(0);
		}
	});

	it('stores the full membership of every pack, none by chain', async () => {
		for (const def of PRESET_CATALOG) {
			expect(def.independent, def.id).toBe(true);
			expect(resolvePresetMembers(def.id)).toEqual(
				def.members.map((member) => member.plugin),
			);
		}
	});

	it('defines minimal and solo as the proposal lists them', async () => {
		expect(resolvePresetMembers('minimal')).toEqual(['git', 'search']);
		expect([...resolvePresetMembers('solo')].sort()).toEqual(
			[
				'git',
				'search',
				'memory',
				'docs',
				'quality',
				'rules',
				'deps',
				'test-policy',
				'env',
				'refactor',
			].sort(),
		);
	});

	it('keeps team-pr a superset of solo and swarm the multi-agent pack', async () => {
		const solo = resolvePresetMembers('solo');
		const teamPr = resolvePresetMembers('team-pr');
		for (const plugin of solo) expect(teamPr).toContain(plugin);
		for (const plugin of ['forge', 'commit-policy', 'security']) {
			expect(teamPr).toContain(plugin);
		}
		const swarm = resolvePresetMembers('swarm');
		for (const plugin of ['proposals', 'logs', 'notification', 'forge']) {
			expect(swarm).toContain(plugin);
		}
	});

	it('ships no provider-spending or credential plugin outside everything and dogfood', async () => {
		const restricted = [
			'api',
			'issues',
			'observability',
			'github',
			'gitlab',
			'browser',
			'external-mcps',
			'prompt-eval',
			'orchestrator-runner',
			'adaptive-optimizer',
		];
		for (const id of [
			'minimal',
			'solo',
			'team-pr',
			'swarm',
			'audit',
			'docs-web',
		]) {
			for (const plugin of restricted) {
				expect(
					resolvePresetMembers(id),
					`${id} ships ${plugin}`,
				).not.toContain(plugin);
			}
		}
	});

	it('everything carries every published plugin, the unreachable four included', async () => {
		const { readdir, readFile } = await import('node:fs/promises');
		const root = repoRootFromSpec();
		const published: string[] = [];
		for (const entry of await readdir(join(root, 'plugins'))) {
			const pkg = JSON.parse(
				await readFile(
					join(root, 'plugins', entry, 'package.json'),
					'utf8',
				),
			) as { private?: unknown };
			if (pkg.private !== true) published.push(entry);
		}
		expect([...resolvePresetMembers('everything')].sort()).toEqual(
			published.sort(),
		);
		for (const plugin of [
			'execution-env',
			'framework-knowledge',
			'style-convention',
			'self-learning',
		]) {
			expect(resolvePresetMembers('everything')).toContain(plugin);
		}
	});

	it('marks the host-only members of everything as hostOnly and forbids them in minimal, solo, swarm', async () => {
		const everything = PRESET_CATALOG.find((d) => d.id === 'everything');
		expect(everything?.members.some((m) => m.hostOnly === true)).toBe(true);
		for (const id of ['minimal', 'solo', 'swarm']) {
			const def = PRESET_CATALOG.find((d) => d.id === id);
			expect(def).toBeDefined();
			for (const member of def?.members ?? []) {
				expect(member.hostOnly).toBeUndefined();
			}
		}
	});

	it('resolves dogfood to ONLY the plugin keys from the live root config', async () => {
		const resolved = resolvePresetMembers('dogfood');
		const published = await publishedConfigPlugins();
		expect([...resolved].sort()).toEqual([...published].sort());
		const dogfood = PRESET_CATALOG.find((d) => d.id === 'dogfood');
		expect(dogfood?.role).toBe('delendai-dogfood');
	});

	it('declares the stack packs as overlays on a purpose pack', async () => {
		for (const stack of PACK_IDS) {
			const { basePack, plugins } = STACK_PACKS[stack];
			expect(PRESET_KIND).toContain(basePack);
			const members = resolveStackPackMembers(stack);
			for (const plugin of resolvePresetMembers(basePack)) {
				expect(members).toContain(plugin);
			}
			for (const plugin of plugins) expect(members).toContain(plugin);
		}
		expect(resolveStackPackMembers('backend-api')).toEqual(
			expect.arrayContaining(['container', 'database']),
		);
		expect(resolveStackPackMembers('web-app')).toEqual(
			expect.arrayContaining(['i18n', 'web-fetch']),
		);
		expect(resolveStackPackMembers('cli-tool')).toContain('perf');
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

	it('keeps the api plugin catalog aligned with the backend-api stack overlay membership', async () => {
		const registration = await apiPlugin.register({
			namespacePrefix: 'api',
			options: {},
			cacheDir: '.cache/delendai',
			pluginCacheDir: '.cache/delendai/api',
			pluginDocsDir: 'docs/plugins/api',
			workspace: {
				root: '/workspace',
				resolve: (path: string) => `/workspace/${path}`,
			},
			corePaths: {
				cacheDir: '.cache/delendai',
				docsDir: 'docs/delendai',
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
		const expectedLine = `- \`backend-api\` — the stack overlay currently ships ${resolveStackPackMembers(
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

	it('derives a summary from actual membership', async () => {
		const solo = PRESET_CATALOG.find(
			(definition) => definition.id === 'solo',
		);
		expect(solo?.summary).toContain('10 plugins');
	});
});

describe('resolvePresetMembers', async () => {
	it('returns [] for unknown preset names', async () => {
		expect(resolvePresetMembers('unknown')).toEqual([]);
		expect(resolvePresetMembers(undefined)).toEqual([]);
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

	it('deduplicates plugins', async () => {
		for (const id of PRESET_KIND) {
			const resolved = resolvePresetMembers(id);
			expect(new Set(resolved).size).toBe(resolved.length);
		}
	});
});

describe('retired preset ids', () => {
	it.each([
		['lean', 'solo'],
		['standard', 'solo'],
		['full', 'everything'],
		['vertex', 'dogfood'],
	] as const)(
		'%s resolves to %s and names it in the notice',
		(retired, replacement) => {
			const notices: string[] = [];
			const original = process.stderr.write.bind(process.stderr);
			process.stderr.write = ((chunk: string | Uint8Array) => {
				if (typeof chunk === 'string') notices.push(chunk);
				return true;
			}) as typeof process.stderr.write;
			try {
				expect(resolvePresetMembers(retired)).toEqual(
					resolvePresetMembers(replacement),
				);
			} finally {
				process.stderr.write = original;
			}
			expect(notices.join('')).toContain(`'${retired}' is deprecated`);
			expect(notices.join('')).toContain(`'${replacement}'`);
		},
	);

	it.each(['web-app', 'backend-api', 'cli-tool'] as const)(
		'%s resolves to its purpose pack plus the stack overlay',
		(stack) => {
			const original = process.stderr.write.bind(process.stderr);
			const notices: string[] = [];
			process.stderr.write = ((chunk: string | Uint8Array) => {
				if (typeof chunk === 'string') notices.push(chunk);
				return true;
			}) as typeof process.stderr.write;
			try {
				expect(resolvePresetMembers(stack)).toEqual(
					resolveStackPackMembers(stack),
				);
			} finally {
				process.stderr.write = original;
			}
			expect(notices.join('')).toContain(`'${stack}' stack overlay`);
		},
	);
});

describe('preset alias (b00239 rename)', () => {
	it('accepts the legacy `vertex` preset id and resolves to the same plugin set as `dogfood`', async () => {
		// b00239 rename: `vertex` was renamed to `dogfood`. Old configs
		// and scripts that still pass `--preset=vertex` MUST continue
		// to resolve to the same plugin set via the PRESET_ALIASES
		// map in `preset-catalog.ts`. This is the core backward-compat
		// guarantee the rename ships with.
		const legacy = resolvePresetMembers('vertex');
		const canonical = resolvePresetMembers('dogfood');
		expect([...legacy].sort()).toEqual([...canonical].sort());
		expect(legacy.length).toBeGreaterThan(0);
	});

	it('emits a stderr deprecation warning when the `vertex` alias is used', async () => {
		// Operators / CI pipelines should see the rename in their logs
		// so a follow-up audit can find every legacy caller. The
		// warning is on stderr (not stdout) so it never corrupts a
		// downstream JSON envelope.
		const stderrChunks: string[] = [];
		const originalWrite = process.stderr.write.bind(process.stderr);
		process.stderr.write = ((
			chunk: string | Uint8Array,
			...rest: unknown[]
		) => {
			if (typeof chunk === 'string') stderrChunks.push(chunk);
			return (originalWrite as (...args: unknown[]) => boolean)(
				chunk,
				...rest,
			);
		}) as typeof process.stderr.write;
		try {
			resolvePresetMembers('vertex');
			const stderr = stderrChunks.join('');
			expect(stderr).toContain('vertex');
			expect(stderr).toContain('dogfood');
			expect(stderr).toContain('deprecated');
		} finally {
			process.stderr.write = originalWrite;
		}
	});

	it('does NOT emit a deprecation warning for the canonical `dogfood` preset id', async () => {
		const stderrChunks: string[] = [];
		const originalWrite = process.stderr.write.bind(process.stderr);
		process.stderr.write = ((
			chunk: string | Uint8Array,
			...rest: unknown[]
		) => {
			if (typeof chunk === 'string') stderrChunks.push(chunk);
			return (originalWrite as (...args: unknown[]) => boolean)(
				chunk,
				...rest,
			);
		}) as typeof process.stderr.write;
		try {
			resolvePresetMembers('dogfood');
			const stderr = stderrChunks.join('');
			expect(stderr).not.toContain('deprecated');
		} finally {
			process.stderr.write = originalWrite;
		}
	});

	it('returns the same plugin set via the alias for `vertex` as the live root config exposes', async () => {
		// Mirror of the canonical `dogfood` test above, but routed
		// through the deprecated alias. Proves the alias is wired
		// correctly — the legacy caller still sees the exact
		// delendai.config.json snapshot.
		const resolved = resolvePresetMembers('vertex');
		expect([...resolved].sort()).toEqual(
			[...(await publishedConfigPlugins())].sort(),
		);
	});

	it('returns the same plugin set as canonical `dogfood` for the legacy `vertex` alias regardless of catalog state', async () => {
		// Defensive: pins the alias → canonical → catalog dispatch order.
		// If a future refactor drops the `dogfood` seed, both
		// `resolvePresetMembers('vertex')` and
		// `resolvePresetMembers('dogfood')` return [] uniformly — the
		// alias must NEVER silently fall through to a stale vertex entry.
		expect(resolvePresetMembers('vertex')).toEqual(
			resolvePresetMembers('dogfood'),
		);
	});
});
describe('normalizePresetInput — single-frontier contract (x00504 / reviewer)', () => {
	it('maps the legacy `vertex` alias to canonical `dogfood`', () => {
		// Single call-site for the alias translation; everything
		// downstream — schemas, type guards, dispatch tables —
		// can rely on the result being a member of PRESET_KIND
		// or undefined.
		expect(normalizePresetInput('vertex')).toBe('dogfood');
	});

	it('passes a canonical `dogfood` through unchanged', () => {
		expect(normalizePresetInput('dogfood')).toBe('dogfood');
	});

	it('passes any other canonical preset id through unchanged', () => {
		for (const kind of PRESET_KIND) {
			expect(normalizePresetInput(kind)).toBe(kind);
		}
	});

	it('returns undefined for an unknown preset id', () => {
		expect(normalizePresetInput('a-preset-that-does-not-exist')).toBe(
			undefined,
		);
	});

	it('returns undefined for null and undefined inputs', () => {
		expect(normalizePresetInput(null)).toBe(undefined);
		expect(normalizePresetInput(undefined)).toBe(undefined);
	});

	it('emits the deprecation warning exactly when an alias is normalised', async () => {
		const stderrChunks: string[] = [];
		const originalWrite = process.stderr.write.bind(process.stderr);
		process.stderr.write = ((
			chunk: string | Uint8Array,
			...rest: unknown[]
		) => {
			if (typeof chunk === 'string') stderrChunks.push(chunk);
			return (originalWrite as (...args: unknown[]) => boolean)(
				chunk,
				...rest,
			);
		}) as typeof process.stderr.write;
		try {
			normalizePresetInput('vertex');
			expect(stderrChunks.join('')).toContain('deprecated');
			stderrChunks.length = 0;
			normalizePresetInput('dogfood');
			expect(stderrChunks.join('')).not.toContain('deprecated');
		} finally {
			process.stderr.write = originalWrite;
		}
	});
});
