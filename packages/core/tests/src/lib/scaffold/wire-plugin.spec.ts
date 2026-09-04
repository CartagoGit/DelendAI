import { describe, expect, it } from 'vitest';

import {
	buildTsconfigPathsEntry,
	diagnosePluginWiring,
	pluginDir,
	wirePluginIntoMonorepo,
	writePluginDefaults,
	writePresetCatalog,
	writePublishOrder,
	writeTsconfigBase,
	writeVitestShared,
	type IPluginWiringFs,
} from '@delendai/core/public';

/**
 * A deterministic, in-memory fs the wiring writers can run against. It
 * records every write and lets the test seed initial file contents.
 */
const createMemoryFs = (
	seed: Readonly<Record<string, string>>,
): IPluginWiringFs & {
	readonly reads: Map<string, number>;
	readonly writes: ReadonlyArray<{
		readonly path: string;
		readonly content: string;
	}>;
} => {
	const files = new Map<string, string>(Object.entries(seed));
	const writes: Array<{ path: string; content: string }> = [];
	const reads = new Map<string, number>();
	return {
		reads,
		writes,
		async readFile(path) {
			reads.set(path, (reads.get(path) ?? 0) + 1);
			const value = files.get(path);
			if (value === undefined) {
				throw new Error(`seed missing: ${path}`);
			}
			return value;
		},
		async writeFile(path, content) {
			files.set(path, content);
			writes.push({ path, content });
		},
		async pathExists(path) {
			return files.has(path);
		},
	};
};

/** Minimal but realistic tsconfig.base.json fixture with one anchor plugin. */
const TS_BASE_SEED = `{
	"compilerOptions": {
		"paths": {
			"@delendai/core": ["./packages/core/src/index.ts"],
			"@delendai/proposals": ["./plugins/proposals/src/index.ts"],
			"@delendai/proposals/public": [
				"./plugins/proposals/src/public/index.ts"
			],
			"@delendai/proposals/*": ["./plugins/proposals/src/*"]
		}
	},
	"exclude": ["node_modules"]
}
`;

/** Realistic vitest.shared.ts with one anchor plugin + a `return [` open. */
const VITEST_SEED = `import { resolve } from 'node:path';
import type { Alias } from 'vitest/config';

export const workspaceAliases = (workspaceRoot: string): Alias[] => {
\tconst core = resolve(workspaceRoot, 'packages/core/src');
\tconst proposals = resolve(\n\t\tworkspaceRoot,\n\t\t'plugins/proposals/src',\n\t);
\treturn [
\t\t{ find: '@delendai/core/public', replacement: resolve(core, 'public/index.ts') },
\t\t{
\t\t\tfind: '@delendai/proposals/public',
\t\t\treplacement: resolve(proposals, 'public/index.ts'),
\t\t},
\t\t{
\t\t\tfind: /^@mcp-vertex\\/proposals\\/lib\\/(.*)$/,
\t\t\treplacement: \`\${resolve(proposals, 'lib')}/$1\`,
\t\t},
\t\t{
\t\t\tfind: '@delendai/proposals',
\t\t\treplacement: resolve(proposals, 'index.ts'),
\t\t},
\t];
};
`;

/** Realistic plugin-defaults.ts with one anchor. */
const PLUGIN_DEFAULTS_SEED = `export const PLUGIN_DEFAULTS: Readonly<\n\tRecord<string, Readonly<Record<string, unknown>>>\n> = {
	proposals: {},
};
`;

/** Realistic release-plan.ts with a partial PUBLISH_ORDER block. */
const PUBLISH_ORDER_SEED = `export const PUBLISH_ORDER: readonly string[] = [
\t'packages/core',
\t'packages/client',
\t'packages/cli',
\t'plugins/proposals',
];
`;

/** Realistic preset-catalog.ts with one preset the writer can target. */
const PRESET_CATALOG_SEED = `export const PRESET_CATALOG: readonly IPresetDefinition[] = [
	{
		id: 'minimal',
		title: 'minimal',
		summary: 'summary',
		members: [
			{ plugin: 'git' },
			{ plugin: 'docs' },
		],
	},
	{
		id: 'vertex',
		title: 'vertex',
		summary: 'summary',
		members: [
			{ plugin: 'proposals' },
			{ plugin: 'rules' },
		],
		independent: true,
	},
];
`;

describe('pluginDir', () => {
	it('returns the canonical plugins/<id> path', () => {
		expect(pluginDir('my-plugin')).toBe('plugins/my-plugin');
	});
});

describe('buildTsconfigPathsEntry', () => {
	it('emits the three expected entries in order', () => {
		const block = buildTsconfigPathsEntry('demo');
		expect(block).toContain('"@delendai/demo":');
		expect(block).toContain('"@delendai/demo/public":');
		expect(block).toContain('"@delendai/demo/*":');
		expect(block).toContain('./plugins/demo/src/index.ts');
	});
});

describe('writeTsconfigBase', () => {
	it('inserts the three paths entries idempotently', async () => {
		const fs = createMemoryFs({ 'tsconfig.base.json': TS_BASE_SEED });
		const first = await writeTsconfigBase({
			pluginId: 'demo',
			fs,
			dryRun: false,
		});
		expect(first.wired).toBe(true);
		expect(first.edits[0]?.noop).toBe(false);
		expect(fs.writes).toHaveLength(1);
		const written = fs.writes[0]?.content ?? '';
		expect(written).toContain('"@delendai/demo":');
		expect(written).toContain('"@delendai/demo/public":');
		expect(written).toContain('"@delendai/demo/*":');
		// Anchor plugin entries still present.
		expect(written).toContain('"@delendai/proposals"');

		const second = await writeTsconfigBase({
			pluginId: 'demo',
			fs,
			dryRun: false,
		});
		expect(second.edits[0]?.noop).toBe(true);
		expect(fs.writes).toHaveLength(1); // no new write on re-run
	});
});

describe('writeVitestShared', () => {
	it('adds the const declaration + three alias entries idempotently', async () => {
		const fs = createMemoryFs({ 'vitest.shared.ts': VITEST_SEED });
		const first = await writeVitestShared({
			pluginId: 'demo',
			fs,
			dryRun: false,
		});
		expect(first.wired).toBe(true);
		const written = fs.writes[0]?.content ?? '';
		expect(written).toContain('const demo = resolve(');
		expect(written).toContain("find: '@delendai/demo/public'");
		expect(written).toContain('@delendai/demo\\/lib');
		expect(written).toContain("find: '@delendai/demo'");

		const second = await writeVitestShared({
			pluginId: 'demo',
			fs,
			dryRun: false,
		});
		expect(second.edits[0]?.noop).toBe(true);
	});
});

describe('writePluginDefaults', () => {
	it('appends an empty `id: {}` entry idempotently', async () => {
		const fs = createMemoryFs({
			'packages/core/src/lib/plugins/plugin-defaults.ts':
				PLUGIN_DEFAULTS_SEED,
		});
		const first = await writePluginDefaults({
			pluginId: 'demo',
			fs,
			dryRun: false,
		});
		expect(first.wired).toBe(true);
		const written = fs.writes[0]?.content ?? '';
		expect(written).toContain('"demo":');

		const second = await writePluginDefaults({
			pluginId: 'demo',
			fs,
			dryRun: false,
		});
		expect(second.edits[0]?.noop).toBe(true);
	});
});

describe('writePublishOrder', () => {
	it('appends the plugin dir idempotently', async () => {
		const fs = createMemoryFs({
			'tools/scripts/release/release-plan.ts': PUBLISH_ORDER_SEED,
		});
		const first = await writePublishOrder({
			pluginId: 'demo',
			fs,
			dryRun: false,
		});
		expect(first.wired).toBe(true);
		const written = fs.writes[0]?.content ?? '';
		expect(written).toContain("'plugins/demo',");

		const second = await writePublishOrder({
			pluginId: 'demo',
			fs,
			dryRun: false,
		});
		expect(second.edits[0]?.noop).toBe(true);
	});
});

describe('writePresetCatalog', () => {
	it('appends a `plugin` entry to the target preset idempotently', async () => {
		const fs = createMemoryFs({
			'packages/core/src/lib/plugins/preset-catalog.ts':
				PRESET_CATALOG_SEED,
		});
		const first = await writePresetCatalog({
			pluginId: 'demo',
			fs,
			dryRun: false,
		});
		expect(first.wired).toBe(true);
		const written = fs.writes[0]?.content ?? '';
		expect(written).toContain("{ plugin: 'demo' }");

		const second = await writePresetCatalog({
			pluginId: 'demo',
			fs,
			dryRun: false,
		});
		expect(second.edits[0]?.noop).toBe(true);
	});

	it('fails when the target preset symbol cannot be found', async () => {
		const fs = createMemoryFs({
			'packages/core/src/lib/plugins/preset-catalog.ts':
				PRESET_CATALOG_SEED.replace("id: 'vertex'", "id: 'full'"),
		});
		await expect(
			writePresetCatalog({
				pluginId: 'demo',
				fs,
				dryRun: false,
			}),
		).rejects.toThrow(/preset vertex/i);
	});
});

describe('wirePluginIntoMonorepo (façade)', () => {
	it('runs every writer once and reports wired:true per point', async () => {
		const fs = createMemoryFs({
			'tsconfig.base.json': TS_BASE_SEED,
			'vitest.shared.ts': VITEST_SEED,
			'packages/core/src/lib/plugins/plugin-defaults.ts':
				PLUGIN_DEFAULTS_SEED,
			'tools/scripts/release/release-plan.ts': PUBLISH_ORDER_SEED,
			'packages/core/src/lib/plugins/preset-catalog.ts':
				PRESET_CATALOG_SEED,
		});
		const result = await wirePluginIntoMonorepo({
			pluginId: 'demo',
			fs,
			dryRun: false,
		});
		expect(result).toHaveLength(6);
		for (const write of result) {
			expect(write.wired).toBe(true);
		}
		expect(fs.writes.map((w) => w.path).sort()).toEqual([
			'packages/core/src/lib/plugins/plugin-defaults.ts',
			'packages/core/src/lib/plugins/preset-catalog.ts',
			'tools/scripts/release/release-plan.ts',
			'tsconfig.base.json',
			'vitest.shared.ts',
		]);
	});

	it('surfaces created-but-not-loaded diagnostics when the plugin is indexed but absent from host config', async () => {
		const fs = createMemoryFs({
			'tsconfig.base.json': TS_BASE_SEED,
			'vitest.shared.ts': VITEST_SEED,
			'packages/core/src/lib/plugins/plugin-defaults.ts':
				PLUGIN_DEFAULTS_SEED,
			'tools/scripts/release/release-plan.ts': PUBLISH_ORDER_SEED,
			'packages/core/src/lib/plugins/preset-catalog.ts':
				PRESET_CATALOG_SEED,
			'packages/core/src/lib/registry/first-party-index.ts':
				"export const FIRST_PARTY_PLUGIN_INDEX = { entries: [{ id: 'demo' }] };\n",
			'docs/mcp-vertex/agent-catalog.generated.json': '{"tools":[]}',
			'mcp-vertex.config.json': JSON.stringify({ plugins: { git: {} } }),
			'plugins/demo/src/index.ts': 'export default {}\n',
		});
		const report = await diagnosePluginWiring('demo', fs);
		expect(report.fullyWired).toBe(false);
		expect(report.loadDiagnostics).toHaveLength(1);
		expect(report.loadDiagnostics[0]?.reason).toContain('does not load it');
	});
});
