import { homedir } from 'node:os';

import type { IMigrationRunResult } from '@delendai/core/cli';
import {
	DEFAULT_MIGRATIONS,
	createFileSystemJournal,
} from '@delendai/core/cli';
import {
	applyGlobalConfig,
	createFileSystemHostConfigIO,
	defaultHostConfigs,
	planGlobalConfig,
	runPendingMigrations,
	scanLegacyIdentity,
} from '@delendai/core/cli';
import {
	readLatestManifestFromDisk,
	type IStoredMigrationManifest,
} from '@delendai/core/cli';
import {
	createDefaultPhases,
	rollbackLatestMigration,
	runMigrationTransaction,
	type ITransactionOutcome,
} from '@delendai/core/cli';

import { EXIT_CODE } from '../contracts/constants/exit-code.constant';
import type {
	ICliCommand,
	ICliCommandResult,
} from '../contracts/interfaces/cli-command.interface';
import type { IResidualReport } from '../contracts/interfaces/residual-report.interface';
import { data, hasFlag } from '../lib/helpers/cli-command.helper';

export interface IMigrateCommandDeps {
	readonly readJournal?: (
		workspaceRoot: string,
	) => Promise<readonly string[]>;
	readonly dryRun?: (workspaceRoot: string) => Promise<IMigrationRunResult>;
	readonly runTransaction?: (
		workspaceRoot: string,
	) => Promise<ITransactionOutcome>;
	readonly readLatestManifest?: (
		workspaceRoot: string,
	) => Promise<IStoredMigrationManifest | null>;
	readonly rollbackLatest?: (
		workspaceRoot: string,
		manifest: IStoredMigrationManifest,
	) => Promise<unknown>;
	/**
	 * The user-level host configs (`~/.claude.json`, `~/.codex/config.toml`):
	 * what migrating them would change, and migrating them.
	 */
	readonly planHost?: (workspaceRoot: string) => Promise<unknown>;
	readonly applyHost?: (workspaceRoot: string) => Promise<unknown>;
	/** The legacy spellings still live in the workspace's files. */
	readonly scanResidual?: (workspaceRoot: string) => Promise<IResidualReport>;
}

/** How many residual hits `migrate status` lists; the count covers all. */
const RESIDUAL_HITS_LISTED = 20;

/** Directories the residual scan never reads: installed or regenerable. */
const RESIDUAL_SCAN_EXCLUDES = ['.git', 'node_modules', '.cache'] as const;

const subcommand = (args: readonly string[]): string | undefined => args[0];

/**
 * The host-scope configs, read for this workspace's entries only. They
 * live in the user's home and list every project the user opened, so
 * they are migrated only when asked for (`migrate host`), never by
 * `migrate run`.
 */
const hostScope = (workspaceRoot: string) => ({
	workspaceRoot,
	hostConfigs: defaultHostConfigs(process.env.HOME ?? homedir()),
	io: createFileSystemHostConfigIO(),
});

const defaultDeps = (): Required<IMigrateCommandDeps> => {
	const journal = createFileSystemJournal();
	return {
		readJournal: journal.read,
		dryRun: async (workspaceRoot) =>
			runPendingMigrations({
				migrations: DEFAULT_MIGRATIONS,
				journal,
				ctx: { workspaceRoot, dryRun: true },
			}),
		runTransaction: async (workspaceRoot) =>
			runMigrationTransaction(
				createDefaultPhases({
					migrations: DEFAULT_MIGRATIONS,
					journal,
				}),
				{ workspaceRoot },
			),
		readLatestManifest: readLatestManifestFromDisk,
		planHost: async (workspaceRoot) =>
			planGlobalConfig(hostScope(workspaceRoot)),
		applyHost: async (workspaceRoot) =>
			applyGlobalConfig(hostScope(workspaceRoot)),
		scanResidual: async (workspaceRoot) => {
			const scanned = await scanLegacyIdentity(workspaceRoot, {
				excludePrefixes: RESIDUAL_SCAN_EXCLUDES,
			});
			return {
				live: scanned.liveHits.length,
				hits: scanned.liveHits
					.slice(0, RESIDUAL_HITS_LISTED)
					.map((hit) => ({
						file: hit.file,
						line: hit.line,
						spelling: hit.spelling,
					})),
			};
		},
		rollbackLatest: async (workspaceRoot, stored) =>
			rollbackLatestMigration(
				{ workspaceRoot },
				stored.manifest,
				'manual rollback',
			),
	};
};

const resultCodeForRun = (
	outcome: ITransactionOutcome,
): ICliCommandResult['code'] =>
	outcome.status === 'committed'
		? EXIT_CODE.OK
		: outcome.status === 'rolled-back'
			? EXIT_CODE.VALIDATION
			: EXIT_CODE.RUNTIME;

export const createMigrateCommand = (
	deps: IMigrateCommandDeps = {},
): ICliCommand => {
	const resolved = { ...defaultDeps(), ...deps };
	return {
		name: 'migrate',
		summary:
			'Run the transactional rebrand migration with explicit backup, validation, and rollback.',
		usage: 'migrate [status|--dry-run|run|rollback|host [--dry-run]]  [--workspace=<path>]',
		async run(args, ctx): Promise<ICliCommandResult> {
			const workspaceRoot = ctx.globals.workspace;
			if (subcommand(args) === 'host') {
				// This workspace's entries in the user-level configs, and
				// no other project's: planned with --dry-run, else applied.
				return data(
					hasFlag(args, 'dry-run')
						? { plan: await resolved.planHost(workspaceRoot) }
						: await resolved.applyHost(workspaceRoot),
				);
			}
			if (hasFlag(args, 'dry-run') || subcommand(args) === 'dry-run') {
				return data(await resolved.dryRun(workspaceRoot));
			}

			const sub = subcommand(args);
			if (sub === undefined || sub === 'status') {
				// A leftover the migrators do not own is reported, never
				// silent: the old name in a live file is something to fix.
				const [applied, latestManifest, residual] = await Promise.all([
					resolved.readJournal(workspaceRoot),
					resolved.readLatestManifest(workspaceRoot),
					resolved.scanResidual(workspaceRoot),
				]);
				return data({
					workspaceRoot,
					applied,
					latestManifest,
					residual,
				});
			}

			if (sub === 'run') {
				const outcome = await resolved.runTransaction(workspaceRoot);
				return { ...data(outcome), code: resultCodeForRun(outcome) };
			}

			if (sub === 'rollback') {
				const latestManifest =
					await resolved.readLatestManifest(workspaceRoot);
				if (latestManifest === null) {
					return {
						code: EXIT_CODE.NOT_FOUND,
						error: 'no recorded migration manifest found for rollback',
					};
				}
				return data(
					await resolved.rollbackLatest(
						workspaceRoot,
						latestManifest,
					),
					EXIT_CODE.VALIDATION,
				);
			}

			return {
				code: EXIT_CODE.USAGE,
				error: `unknown migrate subcommand: ${String(sub)}`,
			};
		},
	};
};

export const migrateCommand: ICliCommand = createMigrateCommand();
