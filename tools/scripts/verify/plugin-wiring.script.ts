#!/usr/bin/env bun
/**
 * f00120 S4 — `verify:plugin-wiring` gate.
 *
 * Reads each of the six wiring files (the same ones the writer touches),
 * asks the in-source-of-truth checkers whether each wiring point is
 * present, and exits non-zero if any are missing. Pass with a one-liner:
 *
 *   bun tools/scripts/verify/plugin-wiring.script.ts plugins/<id>
 *
 * Exits 0 when every point is wired, 1 with a remediation list when not.
 *
 * The script is **read-only** by design. The writer (wire-plugin.ts) is the
 * thing that produces the writes; the doctor is the thing that asserts the
 * end state. They share the `IPluginWiringFs` interface and the in-test
 * fixtures, so a writer + doctor pair are guaranteed to agree.
 */
import { resolve } from 'node:path';

import { readFile } from 'node:fs/promises';

import {
	PLUGIN_DEFAULTS,
	PRESET_CATALOG,
	type IPluginWiringFs,
	type IPluginWiringPoint,
	type IPluginWiringReport,
} from '@mcp-vertex/core/public';
import { PUBLISH_ORDER } from '../release/release-plan';

const REPO_ROOT = resolve(import.meta.dir, '../../..');

const realFs: IPluginWiringFs = {
	async readFile(path) {
		const absolute = path.startsWith('/') ? path : resolve(REPO_ROOT, path);
		return readFile(absolute, 'utf8');
	},
	async writeFile() {
		throw new Error('plugin-wiring doctor is read-only');
	},
	async pathExists() {
		return true;
	},
};

const TSCONFIG_PATHS = 'tsconfig.base.json';
const VITEST_SHARED = 'vitest.shared.ts';
const PLUGIN_DEFAULTS_FILE = 'packages/core/src/lib/plugins/plugin-defaults.ts';
const RELEASE_PLAN_FILE = 'tools/scripts/release/release-plan.ts';
const PRESET_CATALOG_FILE = 'packages/core/src/lib/plugins/preset-catalog.ts';
const CATALOG_ARTIFACT = 'docs/mcp-vertex/agent-catalog.generated.json';

const readSource = (path: string): Promise<string> => realFs.readFile(path);

const checkTsconfigBase = async (
	pluginId: string,
): Promise<IPluginWiringPoint> => {
	const text = await readSource(TSCONFIG_PATHS);
	const scoped = `@mcp-vertex/${pluginId}`;
	const ok =
		text.includes(`"${scoped}":`) &&
		text.includes(`"${scoped}/public":`) &&
		text.includes(`"${scoped}/*":`);
	return {
		id: 'tsconfig-base',
		path: TSCONFIG_PATHS,
		wired: ok,
		summary: `tsconfig.base.json compilerOptions.paths entries for "${scoped}"`,
		...(ok
			? {}
			: {
					remediation: `Add paths entries for "${scoped}", "${scoped}/public", "${scoped}/*" pointing under plugins/${pluginId}/src.`,
				}),
	};
};

const checkVitestShared = async (
	pluginId: string,
): Promise<IPluginWiringPoint> => {
	const text = await readSource(VITEST_SHARED);
	const scoped = `@mcp-vertex/${pluginId}`;
	// Plain string match is enough: the regex literal in `vitest.shared.ts`
	// is fixed-shape (`find: /^<scoped>\/lib\/(.*)$/,`), so a substring
	// probe of the literal text is unambiguous.
	const literalNeedle = `find: /^${scoped.replace(/\//gu, '\\/')}\\/lib\\/(.*)$/`;
	const ok =
		text.includes(`find: '${scoped}'`) &&
		text.includes(`find: '${scoped}/public'`) &&
		text.includes(literalNeedle);
	return {
		id: 'vitest-shared',
		path: VITEST_SHARED,
		wired: ok,
		summary: `vitest.shared.ts workspaceAliases for "${scoped}"`,
		...(ok
			? {}
			: {
					remediation: `Add a const declaration + three alias entries to workspaceAliases() in vitest.shared.ts.`,
				}),
	};
};

const checkPluginDefaults = (pluginId: string): IPluginWiringPoint => {
	const ok = Object.prototype.hasOwnProperty.call(PLUGIN_DEFAULTS, pluginId);
	return {
		id: 'plugin-defaults',
		path: PLUGIN_DEFAULTS_FILE,
		wired: ok,
		summary: `PLUGIN_DEFAULTS entry for "${pluginId}"`,
		...(ok
			? {}
			: {
					remediation: `Add a "${pluginId}": {} entry to PLUGIN_DEFAULTS in packages/core/src/lib/plugins/plugin-defaults.ts.`,
				}),
	};
};

const checkPublishOrder = (pluginId: string): IPluginWiringPoint => {
	const dir = `plugins/${pluginId}`;
	const ok = PUBLISH_ORDER.includes(dir);
	return {
		id: 'publish-order',
		path: RELEASE_PLAN_FILE,
		wired: ok,
		summary: `PUBLISH_ORDER entry for "${dir}"`,
		...(ok
			? {}
			: {
					remediation: `Add '${dir}' to PUBLISH_ORDER in tools/scripts/release/release-plan.ts.`,
				}),
	};
};

const checkPresetCatalog = (pluginId: string): IPluginWiringPoint => {
	const inAny = Object.values(PRESET_CATALOG).some((preset) =>
		preset.members.some((member) => member.plugin === pluginId),
	);
	return {
		id: 'preset-catalog',
		path: PRESET_CATALOG_FILE,
		wired: inAny,
		summary: `PRESET_CATALOG membership for "${pluginId}"`,
		...(inAny
			? {}
			: {
					remediation: `Add a { plugin: '${pluginId}' } entry to one of the presets in packages/core/src/lib/plugins/preset-catalog.ts.`,
				}),
	};
};

const checkCatalogRegen = async (
	pluginId: string,
): Promise<IPluginWiringPoint> => {
	const text = await readSource(CATALOG_ARTIFACT);
	// The catalog stores the plugin id under each tool entry as
	// `"plugin": "<id>"`. A single hit is sufficient to prove the catalog
	// has been regenerated against the plugin dir.
	const ok = new RegExp(`"plugin":\\s*"${escapeRegex(pluginId)}"`, 'u').test(
		text,
	);
	return {
		id: 'catalog-regen',
		path: CATALOG_ARTIFACT,
		wired: ok,
		summary: `agent catalog lists tools from "${pluginId}"`,
		...(ok
			? {}
			: {
					remediation: `Run \`bun run catalog:generate\` so the agent catalog picks up the new plugin.`,
				}),
	};
};

const escapeRegex = (value: string): string =>
	value.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');

/** Run every checker for one plugin id and produce a verdict. */
export const diagnosePluginWiring = async (
	pluginId: string,
): Promise<IPluginWiringReport> => {
	const points: IPluginWiringPoint[] = [
		await checkTsconfigBase(pluginId),
		await checkVitestShared(pluginId),
		checkPluginDefaults(pluginId),
		checkPublishOrder(pluginId),
		checkPresetCatalog(pluginId),
		await checkCatalogRegen(pluginId),
	];
	const missing = points
		.filter((point) => !point.wired)
		.map((point) => point.id);
	return {
		pluginId,
		points,
		fullyWired: missing.length === 0,
		missing,
	};
};

const formatReport = (report: IPluginWiringReport): string => {
	const header = report.fullyWired
		? `✓ plugin-wiring: ${report.pluginId} is fully wired`
		: `✗ plugin-wiring: ${report.pluginId} is missing ${report.missing.length} wiring point(s)`;
	const lines: string[] = [header];
	for (const point of report.points) {
		const mark = point.wired ? '✓' : '✗';
		lines.push(`  ${mark} ${point.id.padEnd(16)} ${point.summary}`);
		if (!point.wired && point.remediation !== undefined) {
			lines.push(`       → ${point.remediation}`);
		}
	}
	return `${lines.join('\n')}\n`;
};

export type IDoctorPluginId = string;

const main = async (argv: readonly string[]): Promise<void> => {
	const pluginId = argv[0]?.replace(/^plugins\//u, '');
	if (pluginId === undefined || pluginId.length === 0) {
		process.stderr.write(
			'usage: bun tools/scripts/verify/plugin-wiring.script.ts <plugin-id-or-plugins-dir>\n',
		);
		process.exitCode = 2;
		return;
	}
	const report = await diagnosePluginWiring(pluginId);
	process.stdout.write(formatReport(report));
	if (!report.fullyWired) {
		process.exitCode = 1;
	}
};

if (import.meta.main) {
	void main(process.argv.slice(2));
}
