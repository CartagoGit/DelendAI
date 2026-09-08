#!/usr/bin/env bun
/**
 * routing-coherence.script.ts — c00160 S1.
 *
 * The routing stack is only coherent when the five routing-scope
 * plugins can be loaded together without three classes of surprises:
 *
 *  1. two advertised tools resolve to the same MCP tool name,
 *  2. the package/manifest relationships inside the stack disagree,
 *  3. a routed tool exists with no explicit token-budget coverage.
 *
 * This stays deliberately narrow and deterministic. It only inspects
 * the five plugins named by the proposal, reads the tool ids from the
 * source files that actually advertise them today, and treats
 * TOKEN-BUDGETS.md as the explicit coverage ledger.
 */

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { repoRoot } from '../lib/monorepo-paths';

const CORE_PACKAGE = '@delendai/core';
const TOKEN_BUDGETS_REL = 'docs/delendai/TOKEN-BUDGETS.md';
const GOVERNED_PRESET_IDS = new Set([
	'minimal',
	'lean',
	'standard',
	'swarm',
	'full',
	'dogfood',
	'web-app',
	'backend-api',
	'cli-tool',
]);

export interface IRoutingStackPlugin {
	readonly pluginId: string;
	readonly packageName: string;
	readonly manifestRel: string;
	readonly packageRel: string;
	readonly toolSourceFiles: readonly string[];
}

export type IRoutingCoherenceFindingKind =
	| 'missing-manifest-file'
	| 'missing-package-file'
	| 'manifest-package-mismatch'
	| 'missing-manifest-core-dependency'
	| 'missing-core-peer-dependency'
	| 'missing-core-dev-workspace-dependency'
	| 'missing-workspace-dependency'
	| 'unexpected-workspace-dependency'
	| 'tool-name-collision'
	| 'missing-token-budget-coverage'
	| 'budgeted-tool-count-mismatch'
	| 'missing-tool-source';

export interface IRoutingCoherenceFinding {
	readonly kind: IRoutingCoherenceFindingKind;
	readonly relPath: string;
	readonly detail: string;
	readonly pluginId?: string | undefined;
	readonly toolName?: string | undefined;
}

export interface IRoutingCoherenceReport {
	readonly findings: readonly IRoutingCoherenceFinding[];
	readonly errors: number;
	readonly ok: boolean;
}

export const ROUTING_STACK: readonly IRoutingStackPlugin[] = [
	{
		pluginId: 'auto-agent-selector',
		packageName: '@delendai/auto-agent-selector',
		manifestRel: 'plugins/auto-agent-selector/plugin.manifest.ts',
		packageRel: 'plugins/auto-agent-selector/package.json',
		toolSourceFiles: [
			'plugins/auto-agent-selector/src/lib/tools/auto-status.tool.ts',
			'plugins/auto-agent-selector/src/lib/tools/auto-recommend.tool.ts',
			'plugins/auto-agent-selector/src/lib/tools/auto-record.tool.ts',
			'plugins/auto-agent-selector/src/lib/tools/auto-evaluate.tool.ts',
			'plugins/auto-agent-selector/src/lib/tools/auto-run.tool.ts',
		],
	},
	{
		pluginId: 'auto-plugin-selector',
		packageName: '@delendai/auto-plugin-selector',
		manifestRel: 'plugins/auto-plugin-selector/plugin.manifest.ts',
		packageRel: 'plugins/auto-plugin-selector/package.json',
		toolSourceFiles: [
			'plugins/auto-plugin-selector/src/lib/tools/plugins-recommend.tool.ts',
		],
	},
	{
		pluginId: 'agent-orchestrator',
		packageName: '@delendai/agent-orchestrator',
		manifestRel: 'plugins/agent-orchestrator/plugin.manifest.ts',
		packageRel: 'plugins/agent-orchestrator/package.json',
		toolSourceFiles: [
			'plugins/agent-orchestrator/src/lib/tools/plan.tool.ts',
			'plugins/agent-orchestrator/src/lib/tools/dispatch.tool.ts',
			'plugins/agent-orchestrator/src/lib/tools/telemetry.tool.ts',
		],
	},
	{
		pluginId: 'orchestrator-runner',
		packageName: '@delendai/orchestrator-runner',
		manifestRel: 'plugins/orchestrator-runner/plugin.manifest.ts',
		packageRel: 'plugins/orchestrator-runner/package.json',
		toolSourceFiles: [
			'plugins/orchestrator-runner/src/lib/tools/advise-routing.tool.ts',
			'plugins/orchestrator-runner/src/lib/tools/advise-spend.tool.ts',
			'plugins/orchestrator-runner/src/lib/tools/bootstrap.tool.ts',
			'plugins/orchestrator-runner/src/lib/tools/cancel-invocation.tool.ts',
			'plugins/orchestrator-runner/src/lib/tools/discover.tool.ts',
			'plugins/orchestrator-runner/src/lib/tools/format-handoff.tool.ts',
			'plugins/orchestrator-runner/src/lib/tools/get-quota.tool.ts',
			'plugins/orchestrator-runner/src/lib/tools/healthcheck-providers.tool.ts',
			'plugins/orchestrator-runner/src/lib/tools/invoke.tool.ts',
			'plugins/orchestrator-runner/src/lib/tools/list-models.tool.ts',
			'plugins/orchestrator-runner/src/lib/tools/set-provider-state.tool.ts',
		],
	},
	{
		pluginId: 'usage-tracking',
		packageName: '@delendai/usage-tracking',
		manifestRel: 'plugins/usage-tracking/plugin.manifest.ts',
		packageRel: 'plugins/usage-tracking/package.json',
		toolSourceFiles: [
			'plugins/usage-tracking/src/lib/tools/report.tool.ts',
			'plugins/usage-tracking/src/lib/tools/clear.tool.ts',
			'plugins/usage-tracking/src/lib/tools/session-hygiene.tool.ts',
		],
	},
] as const;

const TOOL_ID_RE = /\bid\s*:\s*['"]([^'"]+)['"]/gu;
const MANIFEST_PACKAGE_RE = /\bpackage\s*:\s*['"]([^'"]+)['"]/u;
const MANIFEST_DEPENDENCIES_RE = /\bdependencies\s*:\s*\[([\s\S]*?)\]/u;
const QUOTED_STRING_RE = /['"]([^'"]+)['"]/gu;
const TABLE_ROW_RE = /^\|(.+)\|$/gmu;

type PackageJsonShape = {
	readonly name?: string;
	readonly dependencies?: Readonly<Record<string, string>>;
	readonly devDependencies?: Readonly<Record<string, string>>;
	readonly peerDependencies?: Readonly<Record<string, string>>;
};

const readText = (root: string, relPath: string): string | undefined => {
	const absPath = join(root, relPath);
	if (!existsSync(absPath)) return undefined;
	return readFileSync(absPath, 'utf8');
};

const parsePackageJson = (
	root: string,
	relPath: string,
): PackageJsonShape | undefined => {
	const text = readText(root, relPath);
	if (text === undefined) return undefined;
	return JSON.parse(text) as PackageJsonShape;
};

export const parseManifestDependencies = (
	manifestSource: string,
): readonly string[] => {
	const block = MANIFEST_DEPENDENCIES_RE.exec(manifestSource)?.[1];
	if (block === undefined) return [];
	return [...block.matchAll(QUOTED_STRING_RE)]
		.map((match) => match[1] ?? '')
		.filter((value) => value.length > 0);
};

export const parseManifestPackageName = (
	manifestSource: string,
): string | undefined => MANIFEST_PACKAGE_RE.exec(manifestSource)?.[1];

export const extractToolIdsFromSource = (source: string): readonly string[] => {
	const found = new Set<string>();
	for (const match of source.matchAll(TOOL_ID_RE)) {
		const id = match[1];
		if (id !== undefined) found.add(id);
	}
	return [...found].sort();
};

export interface IMeasuredBudgetOwnerRow {
	readonly owner: string;
	readonly tools: number;
}

export const collectMeasuredBudgetOwnerRows = (
	source: string,
): ReadonlyMap<string, IMeasuredBudgetOwnerRow> => {
	const rows = new Map<string, IMeasuredBudgetOwnerRow>();
	for (const match of source.matchAll(TABLE_ROW_RE)) {
		const matchedGroup = match[1];
		if (matchedGroup === undefined) continue;
		const cells = matchedGroup.split('|').map((cell) => cell.trim());
		if (cells.length < 6) continue;
		const [
			preset,
			measurementSurface,
			runtimeSurface,
			sourceLabel,
			owner,
			tools,
		] = cells;
		if (
			preset === undefined ||
			!GOVERNED_PRESET_IDS.has(preset) ||
			measurementSurface === undefined ||
			runtimeSurface === undefined ||
			sourceLabel === undefined ||
			owner === undefined ||
			tools === undefined
		) {
			continue;
		}
		if (owner === 'Owner' || owner === 'core') continue;
		const parsedTools = Number.parseInt(tools, 10);
		if (!Number.isFinite(parsedTools)) continue;
		const previous = rows.get(owner);
		if (previous === undefined || parsedTools > previous.tools) {
			rows.set(owner, { owner, tools: parsedTools });
		}
	}
	return rows;
};

export const findToolNameCollisions = (
	entries: readonly { name: string; pluginId: string }[],
): readonly IRoutingCoherenceFinding[] => {
	const owners = new Map<string, string[]>();
	for (const entry of entries) {
		owners.set(entry.name, [
			...(owners.get(entry.name) ?? []),
			entry.pluginId,
		]);
	}
	return [...owners.entries()]
		.filter(([, pluginIds]) => pluginIds.length > 1)
		.map(([name, pluginIds]) => ({
			kind: 'tool-name-collision' as const,
			relPath: 'plugins',
			detail: `${name} is advertised by multiple routing plugins: ${pluginIds.sort().join(', ')}`,
			toolName: name,
		}))
		.sort((left, right) => left.detail.localeCompare(right.detail));
};

const expectedQualifiedToolName = (pluginId: string, toolId: string): string =>
	`delendai_${pluginId}_${toolId}`;

const formatFinding = (finding: IRoutingCoherenceFinding): string =>
	`${finding.relPath} [${finding.kind}] ${finding.detail}`;

export const lintRoutingCoherence = (
	root: string,
	stack: readonly IRoutingStackPlugin[] = ROUTING_STACK,
): IRoutingCoherenceReport => {
	const findings: IRoutingCoherenceFinding[] = [];
	const advertisedTools: { name: string; pluginId: string }[] = [];
	const advertisedToolCounts = new Map<string, number>();
	const stackPackageNames = new Set(
		stack.map((plugin) => plugin.packageName),
	);
	const measuredOwners = collectMeasuredBudgetOwnerRows(
		readText(root, TOKEN_BUDGETS_REL) ?? '',
	);

	for (const plugin of stack) {
		const manifestSource = readText(root, plugin.manifestRel);
		if (manifestSource === undefined) {
			findings.push({
				kind: 'missing-manifest-file',
				relPath: plugin.manifestRel,
				detail: `missing manifest for ${plugin.pluginId}`,
				pluginId: plugin.pluginId,
			});
			continue;
		}

		const pkg = parsePackageJson(root, plugin.packageRel);
		if (pkg === undefined) {
			findings.push({
				kind: 'missing-package-file',
				relPath: plugin.packageRel,
				detail: `missing package.json for ${plugin.pluginId}`,
				pluginId: plugin.pluginId,
			});
			continue;
		}

		const manifestPackage = parseManifestPackageName(manifestSource);
		if (
			manifestPackage !== plugin.packageName ||
			pkg.name !== plugin.packageName
		) {
			findings.push({
				kind: 'manifest-package-mismatch',
				relPath: plugin.manifestRel,
				detail: `expected ${plugin.packageName}; manifest=${manifestPackage ?? 'missing'} package.json=${pkg.name ?? 'missing'}`,
				pluginId: plugin.pluginId,
			});
		}

		const manifestDependencies = new Set(
			parseManifestDependencies(manifestSource),
		);
		if (!manifestDependencies.has(CORE_PACKAGE)) {
			findings.push({
				kind: 'missing-manifest-core-dependency',
				relPath: plugin.manifestRel,
				detail: `${plugin.pluginId} manifest must declare ${CORE_PACKAGE}`,
				pluginId: plugin.pluginId,
			});
		}

		if ((pkg.peerDependencies ?? {})[CORE_PACKAGE] === undefined) {
			findings.push({
				kind: 'missing-core-peer-dependency',
				relPath: plugin.packageRel,
				detail: `${plugin.packageName} must peer-depend on ${CORE_PACKAGE}`,
				pluginId: plugin.pluginId,
			});
		}

		if ((pkg.devDependencies ?? {})[CORE_PACKAGE] !== 'workspace:*') {
			findings.push({
				kind: 'missing-core-dev-workspace-dependency',
				relPath: plugin.packageRel,
				detail: `${plugin.packageName} must devDepend on ${CORE_PACKAGE} via workspace:*`,
				pluginId: plugin.pluginId,
			});
		}

		const expectedWorkspaceDeps = [...manifestDependencies]
			.filter((dep) => dep !== CORE_PACKAGE && stackPackageNames.has(dep))
			.sort();
		for (const dep of expectedWorkspaceDeps) {
			if ((pkg.dependencies ?? {})[dep] === 'workspace:*') continue;
			findings.push({
				kind: 'missing-workspace-dependency',
				relPath: plugin.packageRel,
				detail: `${plugin.packageName} manifest depends on ${dep}, but package.json does not declare it as workspace:*`,
				pluginId: plugin.pluginId,
			});
		}

		for (const [dep, spec] of Object.entries(pkg.dependencies ?? {})) {
			if (dep === CORE_PACKAGE || !stackPackageNames.has(dep)) continue;
			if (spec !== 'workspace:*') continue;
			if (manifestDependencies.has(dep)) continue;
			findings.push({
				kind: 'unexpected-workspace-dependency',
				relPath: plugin.packageRel,
				detail: `${plugin.packageName} declares ${dep} as workspace:* without a matching manifest dependency`,
				pluginId: plugin.pluginId,
			});
		}

		for (const toolSourceFile of plugin.toolSourceFiles) {
			const toolSource = readText(root, toolSourceFile);
			if (toolSource === undefined) {
				findings.push({
					kind: 'missing-tool-source',
					relPath: toolSourceFile,
					detail: `missing advertised tool source for ${plugin.pluginId}`,
					pluginId: plugin.pluginId,
				});
				continue;
			}
			const toolIds = extractToolIdsFromSource(toolSource);
			advertisedToolCounts.set(
				plugin.pluginId,
				(advertisedToolCounts.get(plugin.pluginId) ?? 0) +
					toolIds.length,
			);
			for (const toolId of toolIds) {
				advertisedTools.push({
					name: expectedQualifiedToolName(plugin.pluginId, toolId),
					pluginId: plugin.pluginId,
				});
			}
		}
	}

	findings.push(...findToolNameCollisions(advertisedTools));

	for (const plugin of stack) {
		const measured = measuredOwners.get(plugin.pluginId);
		if (measured === undefined) {
			findings.push({
				kind: 'missing-token-budget-coverage',
				relPath: TOKEN_BUDGETS_REL,
				detail: `${plugin.pluginId} has no explicit owner-level budget row in TOKEN-BUDGETS.md`,
				pluginId: plugin.pluginId,
			});
			continue;
		}
		const advertisedCount = advertisedToolCounts.get(plugin.pluginId) ?? 0;
		if (measured.tools < advertisedCount) {
			findings.push({
				kind: 'budgeted-tool-count-mismatch',
				relPath: TOKEN_BUDGETS_REL,
				detail: `${plugin.pluginId} advertises ${String(advertisedCount)} tools but TOKEN-BUDGETS.md only measures ${String(measured.tools)}`,
				pluginId: plugin.pluginId,
			});
		}
	}

	for (const tool of advertisedTools.sort((left, right) =>
		left.name.localeCompare(right.name),
	)) {
		if (measuredOwners.has(tool.pluginId)) continue;
		findings.push({
			kind: 'missing-token-budget-coverage',
			relPath: TOKEN_BUDGETS_REL,
			detail: `${tool.name} is advertised by ${tool.pluginId}, whose budget owner row is missing`,
			pluginId: tool.pluginId,
			toolName: tool.name,
		});
	}

	findings.sort((left, right) => {
		const byPath = left.relPath.localeCompare(right.relPath);
		if (byPath !== 0) return byPath;
		const byKind = left.kind.localeCompare(right.kind);
		if (byKind !== 0) return byKind;
		return left.detail.localeCompare(right.detail);
	});

	return {
		findings,
		errors: findings.length,
		ok: findings.length === 0,
	};
};

export const main = (): number => {
	const report = lintRoutingCoherence(repoRoot());
	if (report.ok) {
		console.log('✓ routing-coherence: routing stack is coherent.');
		return 0;
	}
	console.error(
		`✖ routing-coherence: ${String(report.errors)} problem(s) in the routing plugin stack:`,
	);
	for (const finding of report.findings) {
		console.error(`  ${formatFinding(finding)}`);
	}
	return 1;
};

if (import.meta.main) {
	process.exit(main());
}
