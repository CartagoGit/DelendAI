#!/usr/bin/env bun

import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';

interface ICheck {
	readonly label: string;
	readonly args: readonly string[];
}

const checks: readonly ICheck[] = [
	{
		label: 'remote-provider-core tests',
		args: [
			'run',
			'--cwd',
			'plugins/remote-provider-core',
			'test',
			'--',
			'tests/diagnostics.spec.ts',
			'tests/diagnostics-e2e.spec.ts',
		],
	},
	{
		label: 'github diagnostics tests',
		args: [
			'run',
			'--cwd',
			'plugins/github',
			'test',
			'--',
			'tests/diagnostics.spec.ts',
		],
	},
	{
		label: 'gitlab diagnostics tests',
		args: [
			'run',
			'--cwd',
			'plugins/gitlab',
			'test',
			'--',
			'tests/diagnostics.spec.ts',
		],
	},
	{
		label: 'remote-provider-core typecheck',
		args: ['run', '--cwd', 'plugins/remote-provider-core', 'typecheck'],
	},
	{
		label: 'github typecheck',
		args: ['run', '--cwd', 'plugins/github', 'typecheck'],
	},
	{
		label: 'gitlab typecheck',
		args: ['run', '--cwd', 'plugins/gitlab', 'typecheck'],
	},
];

const workspaceRoot = resolve(process.cwd());

let failed = false;
for (const check of checks) {
	process.stdout.write(`remote-provider-verify: ${check.label}\n`);
	const result = spawnSync('bun', check.args, {
		cwd: workspaceRoot,
		stdio: 'inherit',
	});
	if (result.error) {
		process.stderr.write(
			`remote-provider-verify: ${check.label} failed: ${result.error.message}\n`,
		);
		failed = true;
		break;
	}
	if ((result.status ?? 1) !== 0) {
		process.stderr.write(
			`remote-provider-verify: ${check.label} exited with ${result.status ?? 1}\n`,
		);
		failed = true;
		break;
	}
}

if (failed) {
	process.exit(1);
}

process.stdout.write('remote-provider-verify: all checks passed\n');
