import {
	existsSync,
	mkdirSync,
	mkdtempSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
	diagnosePluginWiring,
	wirePluginIntoMonorepo,
	type IPluginWiringFs,
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
	proposals: {},
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

const CATALOG_SEED = `{
	"generatedAt": "2026-07-01T00:00:00Z",
	"mode": "compact",
	"tools": [
		{ "name": "x", "plugin": "proposals" },
		{ "name": "y", "plugin": "rules" }
	]
}
`;

const FIRST_PARTY_INDEX_SEED = `export const FIRST_PARTY_PLUGIN_INDEX = {
	origin: 'first-party',
	entries: [{ id: 'demo' }],
};
`;

const seedPath = (dir: string, path: string, content: string): string => {
	const absolute = join(dir, path);
	mkdirSync(absolute.slice(0, absolute.lastIndexOf('/')), {
		recursive: true,
	});
	writeFileSync(absolute, content);
	return absolute;
};

describe('plugin-wiring doctor (in-memory)', () => {
	let dir: string;
	let fs: IPluginWiringFs;

	beforeEach(() => {
		dir = mkdtempSync(join(tmpdir(), 'plugin-wiring-'));
		const seeds: ReadonlyArray<readonly [string, string]> = [
			['tsconfig.base.json', TS_BASE_SEED],
			['vitest.shared.ts', VITEST_SEED],
			[
				'packages/core/src/lib/plugins/plugin-defaults.ts',
				PLUGIN_DEFAULTS_SEED,
			],
			['tools/scripts/release/release-plan.ts', PUBLISH_ORDER_SEED],
			[
				'packages/core/src/lib/plugins/preset-catalog.ts',
				PRESET_CATALOG_SEED,
			],
			[
				'packages/core/src/lib/registry/first-party-index.ts',
				FIRST_PARTY_INDEX_SEED,
			],
			['docs/mcp-vertex/agent-catalog.generated.json', CATALOG_SEED],
		];
		for (const [path, content] of seeds) {
			seedPath(dir, path, content);
		}
		fs = {
			async readFile(path) {
				const absolute = join(dir, path);
				if (!existsSync(absolute)) {
					throw new Error(`seed missing: ${absolute}`);
				}
				return readFileSync(absolute, 'utf8');
			},
			async writeFile(path, content) {
				seedPath(dir, path, content);
			},
			async pathExists(path) {
				return existsSync(join(dir, path));
			},
		};
	});

	afterEach(() => {
		rmSync(dir, { recursive: true, force: true });
	});

	it('reports every point missing for a fresh plugin id', async () => {
		const report = await diagnosePluginWiring('demo', fs);
		expect(report.fullyWired).toBe(false);
		expect(report.missing).toEqual([
			'tsconfig-base',
			'vitest-shared',
			'plugin-defaults',
			'publish-order',
			'preset-catalog',
			'catalog-regen',
		]);
	});

	it('passes after wirePluginIntoMonorepo runs + catalog regen', async () => {
		const writes = await wirePluginIntoMonorepo({
			pluginId: 'demo',
			fs,
			dryRun: false,
		});
		expect(writes.every((w) => w.wired)).toBe(true);
		// Append the new plugin to the catalog so the catalog-regen point is
		// happy.
		const catalogPath = join(
			dir,
			'docs/mcp-vertex/agent-catalog.generated.json',
		);
		const catalog = JSON.parse(readFileSync(catalogPath, 'utf8'));
		catalog.tools.push({ name: 'x_demo', plugin: 'demo' });
		writeFileSync(catalogPath, JSON.stringify(catalog));

		const report = await diagnosePluginWiring('demo', fs);
		expect(report.missing).toEqual([]);
		expect(report.loadDiagnostics).toEqual([]);
		expect(report.fullyWired).toBe(true);
	});

	it('recognises single-quoted PLUGIN_DEFAULTS keys (canonical form)', async () => {
		// The real plugins/plugin-defaults.ts uses single-quoted keys
		// (`'auto-agent-selector': {},`). The doctor must accept this form,
		// not just the unquoted / double-quoted variants.
		const candidatePath =
			'packages/core/src/lib/plugins/plugin-defaults.ts';
		const singleQuoted = `export const PLUGIN_DEFAULTS = {\n\t'auto-agent-selector': {},\n};\n`;
		const unquoted = `export const PLUGIN_DEFAULTS = {\n\tauto-agent-selector: {},\n};\n`;
		const doubleQuoted = `export const PLUGIN_DEFAULTS = {\n\t"auto-agent-selector": {},\n};\n`;
		for (const text of [singleQuoted, unquoted, doubleQuoted]) {
			const target = join(dir, candidatePath);
			writeFileSync(target, text);
			const report = await diagnosePluginWiring(
				'auto-agent-selector',
				fs,
			);
			const point = report.points.find((p) => p.id === 'plugin-defaults');
			expect(point?.wired, `${text} should be wired`).toBe(true);
		}
	});

	it('recognises the escaped-slash form in vitest.shared.ts', async () => {
		// The real vitest.shared.ts carries JS RegExp literals with escaped
		// slashes (`@mcp-vertex\/demo`). The doctor must accept both forms.
		const candidatePath = 'vitest.shared.ts';
		const escaped = `import { resolve } from 'node:path';\nexport const workspaceAliases = () => [\n\t{ find: '@mcp-vertex/demo', replacement: 'x' },\n\t{ find: '@mcp-vertex/demo/public', replacement: 'x' },\n\t{ find: /^@mcp-vertex\\/demo\\/lib\\/(.*)$/, replacement: 'x' },\n];\n`;
		const canonical = `import { resolve } from 'node:path';\nexport const workspaceAliases = () => [\n\t{ find: '@mcp-vertex/demo', replacement: 'x' },\n\t{ find: '@mcp-vertex/demo/public', replacement: 'x' },\n\t{ find: /^@mcp-vertex/demo\\/lib\\/(.*)$/, replacement: 'x' },\n];\n`;
		for (const text of [escaped, canonical]) {
			const target = join(dir, candidatePath);
			writeFileSync(target, text);
			const report = await diagnosePluginWiring('demo', fs);
			const point = report.points.find((p) => p.id === 'vitest-shared');
			expect(point?.wired, `${text} should be wired`).toBe(true);
		}
	});
});
