/**
 * migrate.command.ts — `delendai migrate status|--dry-run|run|rollback`.
 *
 * S6 exposes the transactional migration as an explicit CLI surface.
 * The automatic guard from S2 remains the default path; this command is
 * the diagnosable, operator-visible wrapper with explicit planning and
 * rollback status.
 */
import { EXIT_CODE } from '../contracts/constants/exit-code.constant';
import type {
	ICliCommand,
	ICliCommandResult,
} from '../contracts/interfaces/cli-command.interface';
import type { IMigrationPlanStep } from '@delendai/core/lib/contracts/interfaces/workspace-migration.interface';
import { DEFAULT_MIGRATIONS } from '@delendai/core/lib/workspace-migration/migration-registry';
import {
	createDefaultPhases,
	runMigrationTransaction,
	type ITransactionOutcome,
} from '@delendai/core/lib/workspace-migration/transaction/migration-transaction';
import { data } from '../lib/helpers/cli-command.helper';

export const MIGRATE_EXIT_CODE = {
	OK: EXIT_CODE.OK,
	NOTHING_TO_DO: EXIT_CODE.NOT_FOUND,
	FAILED: EXIT_CODE.RUNTIME,
	ROLLED_BACK: EXIT_CODE.VALIDATION,
} as const;

export interface IMigrateStatus {
	readonly action: 'status' | 'dry-run';
	readonly acted: boolean;
	readonly workspaceRoot: string;
	readonly migrations: readonly {
		readonly id: string;
		readonly needed: boolean;
		readonly steps?: readonly IMigrationPlanStep[];
	}[];
}

export interface IMigrateCommandHandlers {
	readonly status: (workspaceRoot: string) => Promise<IMigrateStatus>;
	readonly dryRun: (workspaceRoot: string) => Promise<IMigrateStatus>;
	readonly run: (workspaceRoot: string) => Promise<ITransactionOutcome>;
	readonly rollback: (workspaceRoot: string) => Promise<
		| {
				readonly status: 'rolled-back';
				readonly detail?: string | undefined;
		  }
		| { readonly status: 'failed'; readonly reason: string }
	>;
}

const subcommand = (args: readonly string[]): string | undefined => {
	const rest = args.slice(1);
	if (rest[0] === '--dry-run') return '--dry-run';
	return rest[0];
};

const buildStatus = async (
	workspaceRoot: string,
	includeSteps: boolean,
): Promise<IMigrateStatus> => {
	const migrations: Array<IMigrateStatus['migrations'][number]> = [];
	for (const migration of DEFAULT_MIGRATIONS) {
		const needed = await migration.detect({ workspaceRoot, dryRun: true });
		const base = { id: migration.id, needed };
		if (!includeSteps || !needed) {
			migrations.push(base);
			continue;
		}
		migrations.push({
			...base,
			steps: await migration.plan({ workspaceRoot, dryRun: true }),
		});
	}
	return {
		action: includeSteps ? 'dry-run' : 'status',
		acted: migrations.some((migration) => migration.needed),
		workspaceRoot,
		migrations,
	};
};

const defaultHandlers = (): IMigrateCommandHandlers => ({
	status: async (workspaceRoot) => buildStatus(workspaceRoot, false),
	dryRun: async (workspaceRoot) => buildStatus(workspaceRoot, true),
	run: async (workspaceRoot) =>
		runMigrationTransaction(
			createDefaultPhases({ migrations: DEFAULT_MIGRATIONS }),
			{ workspaceRoot },
		),
	rollback: async () => ({
		status: 'failed',
		reason: 'no persisted transactional backup is available after COMMIT; rerun `delendai migrate run` to create a new transaction',
	}),
});

const resultCodeForStatus = (
	status: IMigrateStatus,
): ICliCommandResult['code'] =>
	status.acted ? MIGRATE_EXIT_CODE.OK : MIGRATE_EXIT_CODE.NOTHING_TO_DO;

const resultCodeForRun = (
	outcome: ITransactionOutcome,
): ICliCommandResult['code'] => {
	if (outcome.status === 'committed') return MIGRATE_EXIT_CODE.OK;
	if (outcome.status === 'rolled-back') return MIGRATE_EXIT_CODE.ROLLED_BACK;
	return MIGRATE_EXIT_CODE.FAILED;
};

export const createMigrateCommand = (
	handlers: IMigrateCommandHandlers = defaultHandlers(),
): ICliCommand => ({
	name: 'migrate',
	summary:
		'Run the transactional rebrand migration with explicit backup, validation, and rollback.',
	usage: 'migrate [status|--dry-run|run|rollback]  [--workspace=<path>]',
	async run(args, ctx): Promise<ICliCommandResult> {
		const workspaceRoot = ctx.globals.workspace;
		const sub = subcommand(args);
		if (sub === undefined || sub === 'status') {
			const status = await handlers.status(workspaceRoot);
			return { ...data(status), code: resultCodeForStatus(status) };
		}
		if (sub === '--dry-run') {
			const status = await handlers.dryRun(workspaceRoot);
			return { ...data(status), code: resultCodeForStatus(status) };
		}
		if (sub === 'run') {
			const outcome = await handlers.run(workspaceRoot);
			return { ...data(outcome), code: resultCodeForRun(outcome) };
		}
		if (sub === 'rollback') {
			const outcome = await handlers.rollback(workspaceRoot);
			const code: ICliCommandResult['code'] =
				outcome.status === 'rolled-back'
					? MIGRATE_EXIT_CODE.ROLLED_BACK
					: MIGRATE_EXIT_CODE.FAILED;
			return { ...data(outcome), code };
		}
		return {
			code: EXIT_CODE.USAGE,
			error: `unknown migrate subcommand: ${String(sub)}`,
		};
	},
});

export const migrateCommand: ICliCommand = createMigrateCommand();
