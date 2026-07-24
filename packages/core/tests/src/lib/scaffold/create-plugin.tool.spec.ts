import { describe, expect, it } from 'vitest';

import {
	createWorkspacePathProvider,
	runCreatePlugin,
	type IBatchAtomicWriter,
	type IPluginWiringFs,
	type IRegenerateCatalogArgs,
} from '@mcp-vertex/core/public';

const TS_BASE_SEED = `{
	"compilerOptions": {
		"paths": {
			"@mcp-vertex/core": ["./packages/core/src/index.ts"],
			"@mcp-vertex/proposals": ["./plugins/proposals/src/index.ts"],
			"@mcp-vertex/proposals/public": [
				"./plugins/proposals/src/public/index.ts"
			],
			"@mcp-vertex/proposals/*": ["./plugins/proposals/src/*"]
		}
	},
	"exclude": ["node_modules"]
}
`;

const VITEST_SEED = `import { resolve } from 'node:path';
import type { Alias } from 'vitest/config';

export const workspaceAliases = (workspaceRoot: string): Alias[] => {
\tconst core = resolve(workspaceRoot, 'packages/core/src');
\tconst proposals = resolve(\n\t\tworkspaceRoot,\n\t\t'plugins/proposals/src',\n\t);
\treturn [
\t\t{ find: '@mcp-vertex/core/public', replacement: resolve(core, 'public/index.ts') },
\t\t{
\t\t\tfind: '@mcp-vertex/proposals/public',
\t\t\treplacement: resolve(proposals, 'public/index.ts'),
\t\t},
\t\t{
\t\t\tfind: /^@mcp-vertex\\/proposals\\/lib\\/(.*)$/,
\t\t\treplacement: \`\${resolve(proposals, 'lib')}/$1\`,
\t\t},
\t\t{
\t\t\tfind: '@mcp-vertex/proposals',
\t\t\treplacement: resolve(proposals, 'index.ts'),
\t\t},
\t];
};
`;

const PLUGIN_DEFAULTS_SEED = `export const PLUGIN_DEFAULTS: Readonly<
\tRecord<string, Readonly<Record<string, unknown>>>
> = {
\tproposals: {
\t\tvalidationCommand: 'bun run validate',
\t},
};
`;

const PUBLISH_ORDER_SEED = `export const PUBLISH_ORDER: readonly string[] = [
\t'packages/core',
\t'packages/client',
\t'packages/cli',
\t'plugins/proposals',
];
`;

const PRESET_CATALOG_SEED = `export const PRESET_CATALOG: readonly IPresetDefinition[] = [
\t{
\t\tid: 'minimal',
\t\ttitle: 'minimal',
\t\tsummary: 'summary',
\t\tmembers: [{ plugin: 'git' }],
\t},
\t{
\t\tid: 'vertex',
\t\ttitle: 'vertex',
\t\tsummary: 'summary',
\t\tmembers: [{ plugin: 'proposals' }],
\t\tindependent: true,
\t},
];
`;

const CATALOG_SEED = `{
	"generatedAt": "2026-07-01T00:00:00Z",
	"mode": "compact",
	"tools": [
		{ "name": "x", "plugin": "proposals" }
	]
}
`;

const createMemoryFs = (
	seed: Readonly<Record<string, string>>,
): IPluginWiringFs & {
	readonly writes: readonly string[];
	readonly files: Map<string, string>;
} => {
	const files = new Map<string, string>(Object.entries(seed));
	const writes: string[] = [];
	return {
		files,
		writes,
		async readFile(path) {
			const value = files.get(path);
			if (value === undefined) {
				throw new Error(`seed missing: ${path}`);
			}
			return value;
		},
		async writeFile(path, content) {
			files.set(path, content);
			writes.push(path);
		},
		async pathExists(path) {
			return files.has(path);
		},
	};
};

const createBatchWriter = (fs: IPluginWiringFs): IBatchAtomicWriter => ({
	async writeAll(operations) {
		for (const operation of operations) {
			await fs.writeFile(operation.path, operation.content);
		}
		return {
			ok: true,
			committed: operations.map((op) => op.path),
			errors: [],
		};
	},
});

const appendCatalogEntry = async ({
	pluginId,
	fs,
}: IRegenerateCatalogArgs): Promise<void> => {
	const path = 'docs/mcp-vertex/agent-catalog.generated.json';
	const parsed = JSON.parse(await fs.readFile(path)) as {
		tools: Array<Record<string, unknown>>;
	};
	parsed.tools.push({ name: `${pluginId}_ping`, plugin: pluginId });
	await fs.writeFile(path, JSON.stringify(parsed));
};

const buildWorkspace = () => createWorkspacePathProvider('/virtual-workspace');

const buildSeed = (): Record<string, string> => ({
	'tsconfig.base.json': TS_BASE_SEED,
	'vitest.shared.ts': VITEST_SEED,
	'packages/core/src/lib/plugins/plugin-defaults.ts': PLUGIN_DEFAULTS_SEED,
	'tools/scripts/release/release-plan.ts': PUBLISH_ORDER_SEED,
	'packages/core/src/lib/plugins/preset-catalog.ts': PRESET_CATALOG_SEED,
	'docs/mcp-vertex/agent-catalog.generated.json': CATALOG_SEED,
});

describe('runCreatePlugin (f00120 S4)', () => {
	it('scaffolds, wires and self-checks against an in-memory fs', async () => {
		const fs = createMemoryFs(buildSeed());
		const report = await runCreatePlugin(
			{
				name: 'demo-plugin',
				description: 'Demo plugin.',
			},
			{
				workspace: buildWorkspace(),
				fs,
				batchWriter: createBatchWriter(fs),
				regenerateCatalog: appendCatalogEntry,
			},
		);
		expect(report.ok).toBe(true);
		expect(report.pluginId).toBe('demo-plugin');
		expect(report.scaffolded.files).toContain(
			'plugins/demo-plugin/src/index.ts',
		);
		expect(report.wired).toHaveLength(6);
		expect(report.doctor.fullyWired).toBe(true);
		expect(fs.files.has('plugins/demo-plugin/package.json')).toBe(true);
	});

	it('surfaces doctor failures when the catalog point is still missing', async () => {
		const fs = createMemoryFs(buildSeed());
		const report = await runCreatePlugin(
			{
				name: 'doctor-miss',
				description: 'Doctor miss.',
			},
			{
				workspace: buildWorkspace(),
				fs,
				batchWriter: createBatchWriter(fs),
				regenerateCatalog: async () => {},
			},
		);
		expect(report.ok).toBe(false);
		expect(report.doctor.fullyWired).toBe(false);
		expect(report.doctor.missing).toContain('catalog-regen');
	});

	it('rejects names that cannot resolve to a kebab-case plugin id', async () => {
		const fs = createMemoryFs(buildSeed());
		await expect(
			runCreatePlugin(
				{
					name: '!!!',
					description: 'Broken.',
				},
				{
					workspace: buildWorkspace(),
					fs,
					batchWriter: createBatchWriter(fs),
				},
			),
		).rejects.toThrow(/non-empty kebab-case/i);
	});

	it('supports dry-run without mutating the provided fs', async () => {
		const fs = createMemoryFs(buildSeed());
		const report = await runCreatePlugin(
			{
				name: 'dry-run-demo',
				description: 'Dry run.',
				dryRun: true,
			},
			{
				workspace: buildWorkspace(),
				fs,
				batchWriter: createBatchWriter(fs),
				regenerateCatalog: appendCatalogEntry,
			},
		);
		expect(report.ok).toBe(true);
		expect(fs.writes).toEqual([]);
		expect(fs.files.has('plugins/dry-run-demo/package.json')).toBe(false);
	});
});
