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
			// r00050's property, end to end and across a restart: the
			// repository specs prove the receipt store, this proves the
			// three real lifecycle verbs use it.
			'packages/proposals-sqlite/tests/e2e/mutation-commands-idempotency.spec.ts',
			// r00048's property, on the path the product takes. The
			// helper's own spec runs two calls on ONE handle, which that
			// handle serialises — it proves the SQL and nothing about a
			// race. This one opens SEPARATE `ProposalsSqliteDriver`
			// connections and drives all three real verbs through them,
			// which is the only arrangement in which a caller can hold a
			// genuinely stale revision.
			'packages/proposals-sqlite/tests/e2e/lifecycle-cas-race.spec.ts',
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

/**
 * The properties a real cutover decision depends on, and which this gate
 * does NOT yet verify.
 *
 * This list exists because the gate was reporting
 * "sqlite-cutover-ready: all N checks passed" while none of these held.
 * A green job named `sqlite-cutover-ready` reads as permission to flip
 * the authority switch; what the steps above actually prove is that the
 * FOUNDATIONS do not regress — migrations, repos, reconcile, digest
 * rebuild, packaging. Those are worth gating, and they stay green.
 *
 * Readiness is a separate question, and the honest answer is "no". Every
 * entry names the proposal that closes it. Delete an entry only when the
 * gate itself proves the property; removing one to get a greener report
 * re-creates exactly the false promise this list was added to kill.
 */
export interface IOutstandingProperty {
	readonly property: string;
	readonly proposal: string;
}

export const OUTSTANDING_CUTOVER_PROPERTIES: readonly IOutstandingProperty[] = [
	{
		// Half of this property is already true: reads go through the SQL
		// index reader with a JSON fallback (f00535). The exporter half is
		// blocked on a fact worth writing down rather than re-discovering:
		// the `proposals` table has no column for `track`, `date`,
		// `extras` or `archived`, and the legacy index's semantic payload
		// carries all four. Verified against every migration, not against
		// the prose. So the exporter cannot regenerate INDEX.json
		// faithfully today; it needs a migration that stores those fields
		// first, or the index shape has to shrink to what SQL knows.
		property:
			'operational reads served from SQLite, and a LegacyIndexExporter regenerating INDEX.json from SQL (blocked: `proposals` stores no track/date/extras/archived)',
		proposal: 'r00049',
	},
	{
		property:
			'staging promotion fenced against a stale generation, tombstone semantics for entities that vanish from source, and a genuinely incremental reconcile',
		proposal: 'r00055',
	},
	{
		property:
			'a real storage-mode switch (shadow / sql-primary-compare / sql-only) with no silent legacy fallback when the database is missing or corrupt',
		proposal: 'r00056',
	},
	{
		property:
			'outbox crash/restart end-to-end: two workers, no double effect, in-flight leases reclaimed',
		proposal: 'f00514',
	},
];

export const reportOutstandingProperties = (
	out: (message: string) => void,
): void => {
	out('');
	out(
		`sqlite cutover readiness: NOT READY — ${String(OUTSTANDING_CUTOVER_PROPERTIES.length)} propert${
			OUTSTANDING_CUTOVER_PROPERTIES.length === 1 ? 'y' : 'ies'
		} this gate does not verify:`,
	);
	for (const entry of OUTSTANDING_CUTOVER_PROPERTIES) {
		out(`  - [${entry.proposal}] ${entry.property}`);
	}
	out(
		'The checks above are foundation regression coverage. They are NOT permission to enable sql-primary-compare or sql-only.',
	);
};

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
	// NOTE ON WHAT THIS PROVES. It opens a FRESH temp database and checks
	// that migrations produce a structurally sound schema: integrity_check
	// clean, no foreign-key violations, schema version reported. That is a
	// real migration check and it has caught real breakage.
	//
	// It is NOT a cutover check, and it used to be dressed up as one. The
	// previous version also asserted `DELENDAI_STORAGE_MODE === 'sql-only'`
	// — an env var `runCommand` sets itself two functions up, so the
	// assertion could not fail and proved nothing. `sql-only` is not
	// implemented anywhere yet (see r00056 in
	// OUTSTANDING_CUTOVER_PROPERTIES); a check that appears to verify it
	// is worse than no check.
	const storageMode = process.env.DELENDAI_STORAGE_MODE ?? '(unset)';

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
	out('▶ sqlite-schema-integrity: fresh-database migration probe');
	const probeExitCode = probe(cwd);
	if (probeExitCode !== 0) return probeExitCode;
	out(
		`sqlite foundations: all ${String(CUTOVER_STEPS.length + 1)} checks passed`,
	);
	reportOutstandingProperties(out);
	// `--assert-ready` is the mode for anything that wants to ask "may we
	// cut over?" and act on the answer. While any property is outstanding
	// the answer is no, and it exits non-zero so the answer cannot be
	// misread as consent. The default mode stays green: the foundation
	// checks passing is genuine information worth keeping in CI.
	if (argv.includes('--assert-ready')) {
		console.error(
			`sqlite-cutover-ready: refusing to certify readiness — ${String(OUTSTANDING_CUTOVER_PROPERTIES.length)} outstanding propert${
				OUTSTANDING_CUTOVER_PROPERTIES.length === 1 ? 'y' : 'ies'
			}.`,
		);
		return 1;
	}
	return 0;
};

if (import.meta.main) process.exit(main(process.argv.slice(2)));
