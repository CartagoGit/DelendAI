#!/usr/bin/env bun
import { join } from 'node:path';

import type {
	ClientCapabilities,
	Implementation,
} from '@modelcontextprotocol/sdk/types.js';

import { repoRoot } from '../lib/monorepo-paths';
import {
	asPresetId,
	connectTokenBudgetClient,
	createTokenBudgetFixtureWorkspace,
	DYNAMIC_SURFACE_CLIENT_CAPABILITIES,
	DYNAMIC_SURFACE_CLIENT_INFO,
	destroyTokenBudgetFixtureWorkspace,
	listToolsMetrics,
	measureToolTextBytes,
} from '../report/token-budget-report-lib';

type SurfaceMode = 'native' | 'adaptive' | 'compact';

interface IClientProfile {
	readonly id: string;
	readonly info: Implementation;
	readonly capabilities: ClientCapabilities;
}

interface IMeasurementRow {
	readonly client: string;
	readonly mode: SurfaceMode;
	readonly toolCount: number;
	readonly toolsListBytes: number;
	readonly overviewCompactBytes: number;
	readonly loadErrorCount: number;
}

const CLIENTS: readonly IClientProfile[] = [
	{
		id: 'claude-code',
		info: { ...DYNAMIC_SURFACE_CLIENT_INFO, name: 'claude-code' },
		capabilities: DYNAMIC_SURFACE_CLIENT_CAPABILITIES,
	},
	{
		id: 'vscode-copilot',
		info: { ...DYNAMIC_SURFACE_CLIENT_INFO, name: 'vscode-copilot' },
		capabilities: DYNAMIC_SURFACE_CLIENT_CAPABILITIES,
	},
	{
		id: 'codex-cli',
		info: { ...DYNAMIC_SURFACE_CLIENT_INFO, name: 'codex-cli' },
		capabilities: DYNAMIC_SURFACE_CLIENT_CAPABILITIES,
	},
	{
		id: 'legacy-static',
		info: { name: 'legacy-static', version: '0.0.0' },
		capabilities: {},
	},
] as const;

const SURFACE_MODES: readonly SurfaceMode[] = ['native', 'adaptive', 'compact'];

const formatInt = (value: number): string => value.toLocaleString('en-US');

const measureSurface = async (
	client: IClientProfile,
	mode: SurfaceMode,
	workspace: string,
): Promise<IMeasurementRow> => {
	const connection = await connectTokenBudgetClient(workspace, {
		pluginList: asPresetId('swarm'),
		preset: true,
		surfaceMode: mode,
		clientInfo: client.info,
		capabilities: client.capabilities,
	});
	try {
		const metrics = await listToolsMetrics(
			connection.client,
			connection.pluginIds,
		);
		const overviewCompactBytes = await measureToolTextBytes(
			connection.client,
			'mcp-vertex_overview',
			{ compact: true },
		);
		return {
			client: client.id,
			mode,
			toolCount: metrics.toolCount,
			toolsListBytes: metrics.toolsListBytes,
			overviewCompactBytes,
			loadErrorCount: connection.loadErrors.length,
		};
	} finally {
		await connection.close();
	}
};

const renderMarkdownTable = (rows: readonly IMeasurementRow[]): string => {
	const lines = [
		'| Client | Mode | Tools | Tools/List Bytes | Overview Compact | Load Errors |',
		'| --- | --- | --- | --- | --- | --- |',
		...rows.map(
			(row) =>
				`| ${row.client} | ${row.mode} | ${row.toolCount} | ${formatInt(row.toolsListBytes)} | ${formatInt(row.overviewCompactBytes)} | ${row.loadErrorCount} |`,
		),
	];
	return lines.join('\n');
};

const buildDecisionYaml = (rows: readonly IMeasurementRow[]): string => {
	const grouped = new Map<string, IMeasurementRow[]>();
	for (const row of rows) {
		const entries = grouped.get(row.client) ?? [];
		entries.push(row);
		grouped.set(row.client, entries);
	}
	const decisions = [...grouped.entries()].map(([client, entries]) => {
		const adaptive = entries.find((row) => row.mode === 'adaptive');
		const native = entries.find((row) => row.mode === 'native');
		const recommendAdaptive =
			adaptive !== undefined &&
			native !== undefined &&
			adaptive.loadErrorCount === 0 &&
			adaptive.toolsListBytes < native.toolsListBytes;
		return [
			`  ${client}:`,
			`    recommended: ${recommendAdaptive ? 'adaptive' : 'native'}`,
			`    nativeToolsListBytes: ${native?.toolsListBytes ?? 0}`,
			`    adaptiveToolsListBytes: ${adaptive?.toolsListBytes ?? 0}`,
			`    rationale: "${
				recommendAdaptive
					? 'adaptive reduces cold-start bytes without load errors for this capability profile'
					: 'native remains the fallback for this capability profile'
			}"`,
		].join('\n');
	});
	return [
		`generatedAt: ${new Date().toISOString()}`,
		'preset: swarm',
		'decisions:',
		...decisions,
	].join('\n');
};

const main = async (): Promise<void> => {
	const workspace = createTokenBudgetFixtureWorkspace();
	try {
		const rows: IMeasurementRow[] = [];
		for (const client of CLIENTS) {
			for (const mode of SURFACE_MODES) {
				rows.push(await measureSurface(client, mode, workspace));
			}
		}
		const yaml = buildDecisionYaml(rows);
		const markdown = [
			'# Surface Mode Benchmark',
			'',
			'Reproducible synthetic capability benchmark for the swarm preset.',
			'',
			renderMarkdownTable(rows),
			'',
			'```yaml',
			yaml,
			'```',
		].join('\n');
		const outputPath = join(
			repoRoot(),
			'docs',
			'mcp-vertex',
			'configuration',
			'surface-mode-decision.yaml',
		);
		await Bun.write(outputPath, `${yaml}\n`);
		console.log(markdown);
		console.log(`\nwrote ${outputPath}`);
	} finally {
		destroyTokenBudgetFixtureWorkspace(workspace);
	}
};

main().catch((error: unknown) => {
	console.error(
		`surface-mode-compare failed: ${error instanceof Error ? error.message : String(error)}`,
	);
	process.exit(1);
});
