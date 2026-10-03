#!/usr/bin/env bun
/**
 * local-repro.demo.script.ts — v00126 demo runner.
 *
 * Demonstrates the local-repro script against a real recent failed run.
 * Pick a run-id from the GitHub UI (or via `gh run list --status failure
 * --limit 1`) and pass it to this script; it invokes local-repro with the
 * right --repo / --output and forwards its exit status.
 *
 * Usage:
 *   bun tools/scripts/ci/local-repro.demo.script.ts <run-id>
 */

import { spawnSync } from 'node:child_process';

import { normalizeRunId } from './local-repro.script';
import { REPOSITORY_SLUG, REPOSITORY_URL } from '@delendai/core/public';

interface IRunListEntry {
	readonly databaseId?: number;
	readonly conclusion?: string | null;
	readonly name?: string;
	readonly url?: string;
}

export interface IDemoRunSelection {
	readonly runId: string;
	readonly source: 'argv' | 'gh' | 'fixture';
	readonly name?: string;
	readonly url?: string;
}

export interface IDemoGhResult {
	readonly status: number | null;
	readonly stdout: string;
	readonly stderr: string;
	readonly errorMessage?: string;
}

export type DemoGhRunner = (args: readonly string[]) => IDemoGhResult;

const DEFAULT_REAL_FAILED_RUN: IDemoRunSelection = {
	runId: '33281963947',
	source: 'fixture',
	name: 'quality-gate',
	url: `${REPOSITORY_URL}/actions/runs/33281963947`,
};

export const defaultDemoGhRunner: DemoGhRunner = (args) => {
	const result = spawnSync('gh', [...args], {
		encoding: 'utf8',
		maxBuffer: 1024 * 1024,
	});
	return {
		status: result.status,
		stdout: result.stdout ?? '',
		stderr: result.stderr ?? '',
		...(result.error?.message !== undefined
			? { errorMessage: result.error.message }
			: {}),
	};
};

export const pickLatestFailedRun = (
	jsonText: string,
): IDemoRunSelection | null => {
	const parsed = JSON.parse(jsonText) as readonly IRunListEntry[];
	for (const run of parsed) {
		if (run.conclusion !== 'failure') continue;
		if (typeof run.databaseId !== 'number') continue;
		return {
			runId: String(run.databaseId),
			source: 'gh',
			...(run.name !== undefined ? { name: run.name } : {}),
			...(run.url !== undefined ? { url: run.url } : {}),
		};
	}
	return null;
};

export const resolveDemoRun = (
	argv: readonly string[],
	ghRunner: DemoGhRunner = defaultDemoGhRunner,
): IDemoRunSelection | null => {
	const runInput = argv[0];
	if (runInput !== undefined && runInput.length > 0) {
		const runId = normalizeRunId(runInput);
		if (runId === null) return null;
		return { runId, source: 'argv' };
	}
	const result = ghRunner([
		'run',
		'list',
		'-L',
		'20',
		'--json',
		'databaseId,conclusion,name,url',
	]);
	if (result.status === 0) {
		const selected = pickLatestFailedRun(result.stdout);
		if (selected !== null) return selected;
	}
	return DEFAULT_REAL_FAILED_RUN;
};

export const main = (argv: readonly string[]): number => {
	const selection = resolveDemoRun(argv);
	if (selection === null) {
		console.error(
			'usage: local-repro.demo.script.ts <run-id-or-url> (or configure gh auth so the demo can auto-pick a recent failed run)',
		);
		return 2;
	}
	if (selection.source === 'gh') {
		console.error(
			`local-repro demo: using recent failed run ${selection.runId}${selection.name !== undefined ? ` (${selection.name})` : ''}`,
		);
	}
	if (selection.source === 'fixture') {
		console.error(
			`local-repro demo: using documented real failed run ${selection.runId}${selection.name !== undefined ? ` (${selection.name})` : ''}`,
		);
	}
	if (selection.url !== undefined) {
		console.error(`local-repro demo: run URL ${selection.url}`);
	}

	const repo = process.env.LOCAL_REPRO_REPO ?? REPOSITORY_SLUG;
	const output = process.env.LOCAL_REPRO_OUTPUT ?? 'build/ci';
	const step = process.env.LOCAL_REPRO_STEP;
	const args = [
		'tools/scripts/ci/local-repro.script.ts',
		'--run-id',
		selection.runId,
		'--repo',
		repo,
		'--output',
		output,
	];
	if (step !== undefined && step.length > 0) args.push('--step', step);

	const result = spawnSync('bun', args, { stdio: 'inherit' });
	if (result.error !== undefined) {
		console.error(
			`local-repro demo failed to start: ${result.error.message}`,
		);
		return 1;
	}
	return result.status ?? 1;
};

if (import.meta.main) process.exit(main(process.argv.slice(2)));
