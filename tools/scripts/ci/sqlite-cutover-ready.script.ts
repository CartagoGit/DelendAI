#!/usr/bin/env bun

import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
	ProposalsSqliteDriver,
	resolveProposalsDbPaths,
} from '../../../packages/proposals-sqlite/src';
import { PUBLISH_ORDER } from '../../scripts/release/release-plan';

export interface ICutoverStep {
	readonly name: string;
	readonly command: readonly string[];
}

export interface ICutoverRunnerOptions {
	readonly cwd?: string;
	readonly out?: (message: string) => void;
	readonly run?: (step: ICutoverStep, cwd: string) => number;
	readonly pack?: (cwd: string) => number;
	readonly probe?: (cwd: string) => number;
}

export const CUTOVER_STEPS: readonly ICutoverStep[] = [
	{
		name: 'build',
		command: ['bun', 'run', 'build'],
	},
	{
		name: 'pack-smoke',
		command: ['npm', 'pack', '--dry-run'],
	},
	{
		name: 'sqlite-migrations-reconcile',
		command: [
			'bun',
			'test',
			'packages/proposals-sqlite/tests/src/lib/reconciler.spec.ts',
			'packages/proposals-sqlite/tests/src/lib/reconciler-apply-candidate.spec.ts',
			'packages/proposals-sqlite/tests/src/lib/reconciler-runs.spec.ts',
			'packages/proposals-sqlite/tests/src/lib/reconciler-staging.spec.ts',
		],
	},
	{
		name: 'sqlite-cas-idempotency-outbox',
		command: [
			'bun',
			'test',
			'packages/proposals-sqlite/tests/src/lib/repository/digest.spec.ts',
			'packages/proposals-sqlite/tests/src/lib/repository/lifecycle-repo.spec.ts',
			'packages/proposals-sqlite/tests/src/lib/repository/mutation-commands-repo.spec.ts',
			'packages/proposals-sqlite/tests/src/lib/repository/outbox-repo.spec.ts',
			'packages/proposals-sqlite/tests/src/lib/repository/plans-repo.spec.ts',
			'packages/proposals-sqlite/tests/src/lib/repository/proposals-repo.spec.ts',
			'packages/proposals-sqlite/tests/src/lib/repository/quarantine-repo.spec.ts',
			'packages/proposals-sqlite/tests/src/lib/repository/slices-repo.spec.ts',
		],
	},
	{
		name: 'sqlite-digest-rebuild',
		command: [
			'bun',
			'test',
			'packages/proposals-sqlite/tests/e2e/digest-property.spec.ts',
			'packages/proposals-sqlite/tests/e2e/digest-rebuild.spec.ts',
		],
	},
];

const runPackSmoke = (cwd: string): number => {
	for (const relativeDir of PUBLISH_ORDER) {
		const packageDir = join(cwd, relativeDir);
		const manifestPath = join(packageDir, 'package.json');
		if (!existsSync(manifestPath)) continue;
		const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as {
			private?: boolean;
			files?: unknown;
		};
		if (manifest.private === true || !Array.isArray(manifest.files))
			continue;
		const result = spawnSync('npm', ['pack', '--dry-run'], {
			cwd: packageDir,
			stdio: 'inherit',
		});
		if (result.error !== undefined || result.status !== 0)
			return result.status ?? 1;
	}
	return 0;
};

const defaultOut = (message: string): void => {
	process.stdout.write(`${message}\n`);
};

const runCommand = (step: ICutoverStep, cwd: string): number => {
	const result = spawnSync(step.command[0] as string, step.command.slice(1), {
		cwd,
		stdio: 'inherit',
		env: { ...process.env, DELENDAI_STORAGE_MODE: 'sql-only' },
	});
	return result.error === undefined ? (result.status ?? 1) : 1;
};

export const verifySqliteRuntime = (cwd: string): number => {
	const storageMode = process.env.DELENDAI_STORAGE_MODE ?? 'sql-only';
	if (storageMode !== 'sql-only') {
		console.error(
			`sqlite-cutover-ready: legacy operational fallback is forbidden in sql-only; got ${storageMode}`,
		);
		return 1;
	}

	const root = mkdtempSync(join(tmpdir(), 'delendai-sqlite-cutover-'));
	const paths = resolveProposalsDbPaths(root);
	const sourceCommit =
		spawnSync('git', ['rev-parse', 'HEAD'], {
			cwd,
			encoding: 'utf8',
		}).stdout?.trim() ?? 'unknown';
	const driver = new ProposalsSqliteDriver({ path: paths.databasePath });
	try {
		const integrity = driver.handle
			.query<{ readonly integrity_check: string }, []>(
				'PRAGMA integrity_check;',
			)
			.all();
		const foreignKeys = driver.handle
			.query('PRAGMA foreign_key_check;')
			.all();
		const integrityOk =
			integrity.length === 1 && integrity[0]?.integrity_check === 'ok';
		console.log(
			JSON.stringify({
				commit: sourceCommit,
				dbPath: paths.databasePath,
				storageMode,
				integrityCheck: integrity,
				foreignKeyCheck: foreignKeys,
				schemaVersion: driver.schemaVersion,
			}),
		);
		if (!integrityOk || foreignKeys.length !== 0) {
			console.error(
				'sqlite-cutover-ready: SQLite integrity checks failed',
			);
			return 1;
		}
		return 0;
	} finally {
		driver.close();
		rmSync(root, { recursive: true, force: true });
	}
};

export const main = (
	argv: readonly string[] = [],
	options: ICutoverRunnerOptions = {},
): number => {
	const cwd = options.cwd ?? process.cwd();
	const out = options.out ?? defaultOut;
	const execute = options.run ?? runCommand;
	const pack = options.pack ?? runPackSmoke;
	const probe = options.probe ?? verifySqliteRuntime;
	for (const step of CUTOVER_STEPS) {
		out(`▶ ${step.name}: ${step.command.join(' ')}`);
		const exitCode =
			step.name === 'pack-smoke' ? pack(cwd) : execute(step, cwd);
		if (exitCode !== 0) {
			console.error(
				`sqlite-cutover-ready: ${step.name} failed (${exitCode})`,
			);
			return exitCode;
		}
	}
	out('▶ sqlite-runtime-integrity: sql-only runtime probe');
	const probeExitCode = probe(cwd);
	if (probeExitCode !== 0) return probeExitCode;
	out(`sqlite-cutover-ready: all ${CUTOVER_STEPS.length + 1} checks passed`);
	return argv.includes('--dry-run') ? 0 : 0;
};

if (import.meta.main) process.exit(main(process.argv.slice(2)));
