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

export const main = (argv: readonly string[]): number => {
	const runId = argv[0];
	if (runId === undefined || runId.length === 0) {
		console.error('usage: local-repro.demo.script.ts <run-id>');
		return 2;
	}

	const repo = process.env.LOCAL_REPRO_REPO ?? 'CartagoGit/mcp-vertex';
	const output = process.env.LOCAL_REPRO_OUTPUT ?? 'build/ci';
	const step = process.env.LOCAL_REPRO_STEP;
	const args = [
		'tools/scripts/ci/local-repro.script.ts',
		'--run-id',
		runId,
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
