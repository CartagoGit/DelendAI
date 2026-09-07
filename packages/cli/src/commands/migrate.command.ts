import type { IMigrationRunResult } from '@delendai/core/public';
import {
	DEFAULT_MIGRATIONS,
	createFileSystemJournal,
} from '@delendai/core/public';
import { runPendingMigrations } from '@delendai/core/public';
import {
	readLatestManifestFromDisk,
	type IStoredMigrationManifest,
} from '@delendai/core/public';
import {
	createDefaultPhases,
	rollbackLatestMigration,
	runMigrationTransaction,
	type ITransactionOutcome,
} from '@delendai/core/public';

import { EXIT_CODE } from '../contracts/constants/exit-code.constant';
import type {
	ICliCommand,
	ICliCommandResult,
} from '../contracts/interfaces/cli-command.interface';
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
}

const subcommand = (args: readonly string[]): string | undefined => args[0];

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
		usage: 'migrate [status|--dry-run|run|rollback]  [--workspace=<path>]',
		async run(args, ctx): Promise<ICliCommandResult> {
			const workspaceRoot = ctx.globals.workspace;
			if (hasFlag(args, 'dry-run') || subcommand(args) === 'dry-run') {
				return data(await resolved.dryRun(workspaceRoot));
			}

			const sub = subcommand(args);
			if (sub === undefined || sub === 'status') {
				const [applied, latestManifest] = await Promise.all([
					resolved.readJournal(workspaceRoot),
					resolved.readLatestManifest(workspaceRoot),
				]);
				return data({ workspaceRoot, applied, latestManifest });
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
