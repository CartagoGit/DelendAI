#!/usr/bin/env bun
/**
 * preset-drift.script.ts — x00226.
 *
 * Consolidated preset integrity gate.
 *
 * PRE-001 — eliminate hand-kept preset comparisons by moving them into a lint.
 * PRE-002 — verify the `vertex` preset against the real project config.
 *
 * Scope:
 *   - the original docs / UI prose scan from `no-preset-drift`
 *   - catalog members must resolve to real plugin packages on disk
 *   - `hostOnly` members stay out of the non-host chain presets
 *   - stack-pack overlays only target plugins that the pack actually ships
 *   - migrated plugin manifests agree with preset membership where manifests exist
 *   - `vertex` matches the live root `mcp-vertex.config.json` plugin keys exactly
 *
 * Usage:
 *   bun tools/scripts/lint/preset-drift.script.ts
 *   bun tools/scripts/lint/preset-drift.script.ts --report
 *   bun tools/scripts/lint/preset-drift.script.ts --root=/abs/path/to/repo
 *
 * Exit codes:
 *   0 — clean, or advisory `--report`
 *   1 — one or more strict findings
 */
import { access, readdir, readFile } from 'node:fs/promises';
import { join, relative, resolve } from 'node:path';

import {
	PACK_DEFAULTS_OVERLAY,
	PACK_IDS,
	PRESET_CATALOG,
	PRESET_KIND,
	resolvePresetMembers,
	type IPresetDefinition,
} from '@delendai/core/public';

// Internal path on purpose: the generated lazy index is a build-time
// artifact this gate reads, not a runtime API consumers should depend
// on — exporting it publicly would spend the core's public-surface
// budget on a lint. `tools/scripts/lint/` is excluded from
// `no-internal-core-imports` for exactly this case.
import { MANAGED_LAZY_PLUGIN_CATALOG } from '@delendai/core/lib/plugins/managed-lazy-catalog.generated';

import {
	buildCompatibilityMatrix,
	loadPluginManifests,
	type ICompatibilityRow,
} from '../generate/from-manifests.script.ts';

const REPO_ROOT = process.cwd();

const SCAN_ROOTS: readonly string[] = [
	'docs',
	'apps/shared/src',
	'apps/web/src',
	'extensions/vscode/src',
];

const FILE_GLOBS = /\.(md|mdx|astro|ts|tsx|js|mjs)$/;

const NON_HOST_CHAIN_PRESETS = [
	'minimal',
	'lean',
	'standard',
	'swarm',
] as const;

const PRESET_MEMBERSHIPS: Readonly<Record<string, readonly string[]>> =
	Object.fromEntries(
		PRESET_KIND.map((id) => [id, resolvePresetMembers(id)] as const),
	);

export interface IPresetDriftFinding {
	readonly absPath: string;
	readonly relPath: string;
	readonly line: number;
	readonly kind:
		| 'broken-core-launch'
		| 'unknown-preset'
		| 'verbatim-preset-list'
		| 'catalog-plugin-missing-package'
		| 'host-only-chain-violation'
		| 'stack-pack-overlay-drift'
		| 'manifest-preset-drift'
		| 'preset-member-not-lazy-indexed'
		| 'vertex-config-drift'
		| 'vertex-config-read-failure';
	readonly detail: string;
}

export interface IPresetDriftOptions {
	readonly rootDir?: string;
	readonly scanRoots?: readonly string[];
	readonly includeDocumentationChecks?: boolean;
	readonly includeCatalogChecks?: boolean;
}

export interface IMembershipDiff {
	readonly missing: readonly string[];
	readonly unexpected: readonly string[];
}

const normalizePlugins = (raw: string): readonly string[] =>
	raw
		.split(',')
		.map((entry) => entry.trim())
		.filter((entry) => entry.length > 0)
		.sort();

const sameSet = (a: readonly string[], b: readonly string[]): boolean => {
	if (a.length !== b.length) return false;
	for (let i = 0; i < a.length; i += 1) {
		if (a[i] !== b[i]) return false;
	}
	return true;
};

export const diffMembership = (
	expected: readonly string[],
	actual: readonly string[],
): IMembershipDiff => {
	const expectedSet = new Set(expected);
	const actualSet = new Set(actual);
	return {
		missing: expected.filter((plugin) => !actualSet.has(plugin)),
		unexpected: actual.filter((plugin) => !expectedSet.has(plugin)),
	};
};

/** Parse `--preset=NAME` and `--plugins=A,B,…` from a chunk of text. */
export const scanText = (
	text: string,
	absPath: string,
	relPath: string,
): readonly IPresetDriftFinding[] => {
	const findings: IPresetDriftFinding[] = [];
	const lines = text.split('\n');
	for (let i = 0; i < lines.length; i += 1) {
		const line = lines[i] ?? '';

		if (
			/\b(?:bunx|npx(?:\s+-y)?|pnpm\s+dlx|yarn\s+dlx)\s+@mcp-vertex\/core\b/.test(
				line,
			) ||
			/\bdeno\s+run\s+-A\s+npm:@mcp-vertex\/core\b/.test(line)
		) {
			findings.push({
				absPath,
				relPath,
				line: i + 1,
				kind: 'broken-core-launch',
				detail: '@delendai/core is a library package and has no executable. Run @delendai/cli (or use the canonical explicit package/bin MCP launch) instead.',
			});
		}

		const presetMatch = line.match(/--preset=([a-z][a-z0-9-]*)/);
		if (presetMatch?.[1] !== undefined) {
			const name = presetMatch[1];
			if (!(PRESET_KIND as readonly string[]).includes(name)) {
				findings.push({
					absPath,
					relPath,
					line: i + 1,
					kind: 'unknown-preset',
					detail: `--preset=${name} is not a known preset (known: ${PRESET_KIND.join(', ')})`,
				});
			}
		}

		const pluginsMatch = line.match(
			/--plugins=([a-z][a-z0-9-]*(?:,\s*[a-z][a-z0-9-]*)*)/,
		);
		if (pluginsMatch?.[1] !== undefined) {
			const listed = normalizePlugins(pluginsMatch[1]);
			for (const [presetId, members] of Object.entries(
				PRESET_MEMBERSHIPS,
			)) {
				if (sameSet(listed, [...members].sort())) {
					findings.push({
						absPath,
						relPath,
						line: i + 1,
						kind: 'verbatim-preset-list',
						detail:
							`--plugins=${pluginsMatch[1]} is a verbatim copy of preset "${presetId}". ` +
							`Use --preset=${presetId} or read from PRESET_CATALOG instead.`,
					});
				}
			}
		}
	}
	return findings;
};

const walk = async (root: string): Promise<readonly string[]> => {
	const out: string[] = [];
	const stack = [root];
	while (stack.length > 0) {
		const dir = stack.pop();
		if (dir === undefined) break;
		let entries: import('node:fs').Dirent[];
		try {
			entries = await readdir(dir, { withFileTypes: true });
		} catch {
			continue;
		}
		for (const entry of entries) {
			const full = join(dir, entry.name);
			if (entry.isDirectory()) {
				if (
					entry.name === 'node_modules' ||
					entry.name === 'dist' ||
					entry.name === 'coverage' ||
					entry.name === '.bun' ||
					entry.name === '.cache' ||
					entry.name === 'proposals'
				) {
					continue;
				}
				stack.push(full);
				continue;
			}
			if (entry.isFile() && FILE_GLOBS.test(entry.name)) {
				out.push(full);
			}
		}
	}
	return out;
};

export const detectDocumentationPresetDrift = async (
	roots: readonly string[] = SCAN_ROOTS,
	rootDir = REPO_ROOT,
): Promise<readonly IPresetDriftFinding[]> => {
	const findings: IPresetDriftFinding[] = [];
	for (const root of roots) {
		const absRoot = resolve(rootDir, root);
		const files = await walk(absRoot);
		for (const file of files) {
			const content = await readFile(file, 'utf8').catch(() => '');
			if (content.length === 0) continue;
			findings.push(...scanText(content, file, relative(rootDir, file)));
		}
	}
	return findings;
};

const hasPackageJson = async (
	rootDir: string,
	pluginId: string,
): Promise<boolean> => {
	for (const relPath of [
		`plugins/${pluginId}/package.json`,
		`packages/${pluginId}/package.json`,
	]) {
		try {
			await access(resolve(rootDir, relPath));
			return true;
		} catch {}
	}
	return false;
};

export const findHostOnlyChainViolations = (
	catalog: readonly IPresetDefinition[] = PRESET_CATALOG,
): readonly IPresetDriftFinding[] =>
	catalog.flatMap((definition) => {
		if (
			!(NON_HOST_CHAIN_PRESETS as readonly string[]).includes(
				definition.id,
			)
		) {
			return [];
		}
		return definition.members
			.filter((member) => member.hostOnly === true)
			.map((member) => ({
				absPath: '',
				relPath: 'packages/core/src/lib/plugins/preset-catalog.ts',
				line: 0,
				kind: 'host-only-chain-violation' as const,
				detail: `preset "${definition.id}" includes host-only plugin "${member.plugin}"; host-only members belong only in full/vertex or independent host-facing packs.`,
			}));
	});

/**
 * Every preset member must be indexed in
 * `managed-lazy-catalog.generated.ts`.
 *
 * The managed-lazy surface is all-or-nothing: `tryAssembleManagedLazy`
 * needs a catalog entry for EVERY effective plugin, because the runtime
 * routes tool calls through that index. One preset member missing from
 * it therefore does not degrade that plugin — it silently demotes the
 * whole surface to eager loading for every adopter of that preset, so
 * every plugin module is imported at boot and the entire tool surface is
 * registered up front. The runtime now says so on stderr
 * (`managed-lazy-demotion.ts`), but by then it has already shipped.
 *
 * This is the gate that keeps that from being committed at all. If you
 * add a plugin to a preset, run
 * `bun tools/scripts/generate/managed-lazy-catalog.script.ts` — do not
 * relax this check.
 */
export const findPresetMembersNotLazyIndexed = (
	catalog: readonly IPresetDefinition[] = PRESET_CATALOG,
	lazyIndex: readonly { readonly id: string }[] = MANAGED_LAZY_PLUGIN_CATALOG,
): readonly IPresetDriftFinding[] => {
	const indexed = new Set(lazyIndex.map((entry) => entry.id));
	const seen = new Set<string>();
	const findings: IPresetDriftFinding[] = [];
	for (const definition of catalog) {
		for (const member of definition.members) {
			if (indexed.has(member.plugin) || seen.has(member.plugin)) continue;
			seen.add(member.plugin);
			findings.push({
				absPath: '',
				relPath: 'packages/core/src/lib/plugins/preset-catalog.ts',
				line: 0,
				kind: 'preset-member-not-lazy-indexed',
				detail: `preset member "${member.plugin}" is not in managed-lazy-catalog.generated.ts, so every preset that ships it falls back to EAGER loading for the whole surface. Run \`bun tools/scripts/generate/managed-lazy-catalog.script.ts\`.`,
			});
		}
	}
	return findings;
};

export const findPackOverlayDrift = (
	packIds: readonly string[] = PACK_IDS,
	overlay: Readonly<
		Record<string, Readonly<Record<string, unknown>>>
	> = PACK_DEFAULTS_OVERLAY,
): readonly IPresetDriftFinding[] => {
	const findings: IPresetDriftFinding[] = [];
	for (const packId of packIds) {
		const memberSet = new Set(resolvePresetMembers(packId));
		for (const pluginId of Object.keys(overlay[packId] ?? {})) {
			if (memberSet.has(pluginId)) continue;
			findings.push({
				absPath: '',
				relPath:
					'packages/core/src/lib/plugins/pack-defaults-overlay.ts',
				line: 0,
				kind: 'stack-pack-overlay-drift',
				detail: `pack overlay "${packId}" configures plugin "${pluginId}", but PRESET_CATALOG does not ship that plugin in preset "${packId}".`,
			});
		}
	}
	return findings;
};

export const findManifestPresetDrift = (
	rows: readonly ICompatibilityRow[],
): readonly IPresetDriftFinding[] =>
	rows
		.filter((row) => row.matches === false)
		.map((row) => ({
			absPath: '',
			relPath: `plugins/${row.pluginId}/plugin.manifest.ts`,
			line: 0,
			kind: 'manifest-preset-drift' as const,
			detail: `manifest declares preset membership for plugin "${row.pluginId}" and preset "${row.presetId}" as ${row.declared ? 'present' : 'absent'}, but PRESET_CATALOG resolves it as ${row.catalogMember ? 'present' : 'absent'}.`,
		}));

export const findVertexConfigDrift = (
	configPluginIds: readonly string[],
	vertexMembers: readonly string[] = resolvePresetMembers('vertex'),
): IMembershipDiff =>
	diffMembership([...vertexMembers].sort(), [...configPluginIds].sort());

export const detectCatalogPresetDrift = async (
	rootDir = REPO_ROOT,
): Promise<readonly IPresetDriftFinding[]> => {
	const findings: IPresetDriftFinding[] = [];
	const catalogPath = 'packages/core/src/lib/plugins/preset-catalog.ts';
	const configPath = 'mcp-vertex.config.json';
	const allMemberIds = new Set<string>();
	for (const definition of PRESET_CATALOG) {
		for (const member of definition.members) {
			allMemberIds.add(member.plugin);
		}
	}
	for (const pluginId of [...allMemberIds].sort()) {
		if (await hasPackageJson(rootDir, pluginId)) continue;
		findings.push({
			absPath: resolve(rootDir, catalogPath),
			relPath: catalogPath,
			line: 0,
			kind: 'catalog-plugin-missing-package',
			detail: `preset member "${pluginId}" has no package.json under plugins/ or packages/.`,
		});
	}
	findings.push(...findHostOnlyChainViolations());
	findings.push(...findPackOverlayDrift());
	findings.push(...findPresetMembersNotLazyIndexed());

	try {
		const configRaw = await readFile(resolve(rootDir, configPath), 'utf8');
		const config = JSON.parse(configRaw) as {
			plugins?: Readonly<Record<string, unknown>>;
		};
		const configPluginIds = Object.keys(config.plugins ?? {}).sort();
		const diff = findVertexConfigDrift(configPluginIds);
		if (diff.missing.length > 0 || diff.unexpected.length > 0) {
			const parts: string[] = [];
			if (diff.missing.length > 0) {
				parts.push(`missing from vertex: ${diff.missing.join(', ')}`);
			}
			if (diff.unexpected.length > 0) {
				parts.push(
					`unexpected in vertex: ${diff.unexpected.join(', ')}`,
				);
			}
			findings.push({
				absPath: resolve(rootDir, configPath),
				relPath: configPath,
				line: 0,
				kind: 'vertex-config-drift',
				detail: `vertex must mirror the live mcp-vertex.config.json plugins exactly; ${parts.join('; ')}.`,
			});
		}
	} catch (error) {
		findings.push({
			absPath: resolve(rootDir, configPath),
			relPath: configPath,
			line: 0,
			kind: 'vertex-config-read-failure',
			detail:
				error instanceof Error
					? error.message
					: `failed to read ${configPath}`,
		});
	}

	const manifests = await loadPluginManifests(rootDir).catch(() => []);
	if (manifests.length > 0) {
		findings.push(
			...findManifestPresetDrift(buildCompatibilityMatrix(manifests)),
		);
	}

	return findings;
};

export const detectPresetDrift = async (
	options: IPresetDriftOptions = {},
): Promise<readonly IPresetDriftFinding[]> => {
	const rootDir = options.rootDir ?? REPO_ROOT;
	const includeDocumentationChecks =
		options.includeDocumentationChecks ?? true;
	const includeCatalogChecks = options.includeCatalogChecks ?? true;
	const findings: IPresetDriftFinding[] = [];
	if (includeDocumentationChecks) {
		findings.push(
			...(await detectDocumentationPresetDrift(
				options.scanRoots ?? SCAN_ROOTS,
				rootDir,
			)),
		);
	}
	if (includeCatalogChecks) {
		findings.push(...(await detectCatalogPresetDrift(rootDir)));
	}
	return findings;
};

export const formatReport = (
	findings: readonly IPresetDriftFinding[],
	reportOnly = false,
): string => {
	if (reportOnly) {
		const counts = new Map<IPresetDriftFinding['kind'], number>();
		for (const finding of findings) {
			counts.set(finding.kind, (counts.get(finding.kind) ?? 0) + 1);
		}
		const summary = [...counts.entries()]
			.sort(([left], [right]) => left.localeCompare(right))
			.map(([kind, count]) => `${kind}=${count}`)
			.join(', ');
		return `preset-drift: ${findings.length} finding(s)${summary.length > 0 ? ` (${summary})` : ''}.\n`;
	}
	if (findings.length === 0) {
		return 'preset-drift: 0 findings.\n';
	}
	const lines: string[] = [
		`preset-drift: ${findings.length} finding${findings.length === 1 ? '' : 's'}.`,
		'',
	];
	for (const finding of findings) {
		const location =
			finding.line > 0
				? `${finding.relPath}:${finding.line}`
				: finding.relPath;
		lines.push(`  ${location}  [${finding.kind}]`);
		lines.push(`    ${finding.detail}`);
	}
	return `${lines.join('\n')}\n`;
};

const parseArgs = (
	argv: readonly string[],
): { readonly rootDir: string; readonly reportOnly: boolean } => {
	let rootDir = process.cwd();
	let reportOnly = false;
	for (const arg of argv) {
		if (arg === '--report') {
			reportOnly = true;
			continue;
		}
		if (arg.startsWith('--root=')) {
			rootDir = arg.slice('--root='.length);
		}
	}
	return { rootDir, reportOnly };
};

export const main = async (argv = process.argv.slice(2)): Promise<number> => {
	const { rootDir, reportOnly } = parseArgs(argv);
	const findings = await detectPresetDrift({ rootDir });
	process.stderr.write(formatReport(findings, reportOnly));
	if (reportOnly) return 0;
	return findings.length === 0 ? 0 : 1;
};

if (import.meta.main) {
	process.exit(await main());
}
