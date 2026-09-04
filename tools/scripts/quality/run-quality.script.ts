#!/usr/bin/env bun
/**
 * run-quality.script.ts
 *
 * Post-test quality gate for `bun run validate`. Reuses the same scope
 * resolution and command runner as the quality plugin, but runs as a
 * plain Bun script so the root validate chain can fail on quality
 * severity=`error` without booting an MCP host.
 */

import {
	createWorkspaceFileReader,
	createWorkspacePathProvider,
	parseConfigFile,
} from '@delendai/core/public';
import {
	createCommandRunner,
	resolveScopes,
	runAllScopes,
	type ICommandPolicy,
} from '@delendai/quality/public';

export interface IRunQualityScriptOptions {
	readonly workspaceRoot: string;
	readonly json: boolean;
	readonly scopes?: readonly string[];
}

export interface IRunQualityScriptReport {
	readonly ok: boolean;
	readonly severity: 'ok' | 'error';
	readonly findings: readonly string[];
	readonly summary?: {
		readonly ok: boolean;
		readonly scopes: number;
	};
}

const parseArgs = (argv: readonly string[]): IRunQualityScriptOptions => {
	let workspaceRoot = process.cwd();
	let json = false;
	const scopes: string[] = [];
	for (const arg of argv) {
		if (arg === '--json') {
			json = true;
			continue;
		}
		if (arg.startsWith('--workspace=')) {
			workspaceRoot = arg.slice('--workspace='.length);
			continue;
		}
		if (arg.startsWith('--scope='))
			scopes.push(arg.slice('--scope='.length));
	}
	return {
		workspaceRoot,
		json,
		...(scopes.length > 0 ? { scopes } : {}),
	};
};

const readQualityOptions = async (
	workspaceRoot: string,
): Promise<{
	readonly scopes?: Readonly<Record<string, readonly string[]>>;
	readonly timeoutMs?: number;
	readonly commandPolicy?: ICommandPolicy;
}> => {
	const workspace = createWorkspacePathProvider(workspaceRoot);
	const reader = createWorkspaceFileReader(workspace);
	const config = parseConfigFile(
		await reader.readFile('mcp-vertex.config.json'),
	);
	const raw = (config.plugins?.quality?.options ?? {}) as {
		scopes?: Readonly<Record<string, readonly string[]>>;
		timeoutMs?: number;
		commandPolicy?: ICommandPolicy;
	};
	return {
		...(raw.scopes !== undefined ? { scopes: raw.scopes } : {}),
		...(typeof raw.timeoutMs === 'number'
			? { timeoutMs: raw.timeoutMs }
			: {}),
		...(raw.commandPolicy !== undefined
			? { commandPolicy: raw.commandPolicy }
			: {}),
	};
};

export const summarizeQualityReport = (report: {
	readonly results: readonly {
		scope: string;
		errors: readonly string[];
	}[];
	readonly summary: { readonly ok: boolean; readonly scopes: number };
}): IRunQualityScriptReport => {
	const findings = report.results.flatMap((result) =>
		result.errors.map((error) => `${result.scope}: ${error}`),
	);
	return {
		ok: report.summary.ok,
		severity: report.summary.ok ? 'ok' : 'error',
		findings,
		summary: report.summary,
	};
};

export const runQualityScript = async (
	options: IRunQualityScriptOptions,
): Promise<IRunQualityScriptReport> => {
	const workspace = createWorkspacePathProvider(options.workspaceRoot);
	const reader = createWorkspaceFileReader(workspace);
	const qualityOptions = await readQualityOptions(options.workspaceRoot);
	const scopes = await resolveScopes(
		reader,
		qualityOptions.scopes !== undefined
			? { scopes: qualityOptions.scopes }
			: {},
	);
	if (Object.keys(scopes).length === 0) {
		return {
			ok: false,
			severity: 'error',
			findings: ['no quality scopes configured'],
			summary: { ok: false, scopes: 0 },
		};
	}
	const selectedScopes =
		options.scopes === undefined
			? scopes
			: Object.fromEntries(
					options.scopes
						.map((name) => [name, scopes[name]])
						.filter(
							(
								entry,
							): entry is [string, (typeof scopes)[string]] =>
								entry[1] !== undefined,
						),
				);
	if (Object.keys(selectedScopes).length === 0) {
		return {
			ok: false,
			severity: 'error',
			findings: ['none of the requested quality scopes are configured'],
			summary: { ok: false, scopes: 0 },
		};
	}
	const report = await runAllScopes(
		selectedScopes,
		options.workspaceRoot,
		createCommandRunner(qualityOptions.timeoutMs),
		qualityOptions.commandPolicy,
	);
	return summarizeQualityReport(report);
};

const formatHuman = (report: IRunQualityScriptReport): string => {
	if (report.ok) {
		return `quality ok (${report.summary?.scopes ?? 0} scopes)`;
	}
	return ['quality failed', ...report.findings].join('\n');
};

if (import.meta.main) {
	const options = parseArgs(process.argv.slice(2));
	const report = await runQualityScript(options);
	const output = options.json ? JSON.stringify(report) : formatHuman(report);
	console.log(output);
	process.exit(report.severity === 'error' ? 1 : 0);
}
