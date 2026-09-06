/**
 * migration-transaction.ts — b00239 S6.
 */
import type { IMigration } from '../../contracts/interfaces/workspace-migration.interface';

import {
	buildManifest,
	validationOutcomeFromReport,
	writeManifest,
	type IValidationReport,
	type IMigrationManifest,
	type IManifestHostConfigChange,
	type IManifestPackageChange,
	type IManifestRename,
} from './migration-manifest';
import {
	createWorkspaceBackup,
	rollback as runRollback,
	type IBackup,
	type IRollbackReport,
} from './rollback';

export interface ITxContext {
	readonly workspaceRoot: string;
}

export interface IPlannedStep {
	readonly kind: string;
	readonly detail: string;
	readonly migrationId?: string | undefined;
}

export type { IBackup };

export interface ITransactionPhases {
	readonly discover: (ctx: ITxContext) => Promise<readonly IMigration[]>;
	readonly plan: (
		migrations: readonly IMigration[],
		ctx: ITxContext,
	) => Promise<readonly IPlannedStep[]>;
	readonly backup: (
		steps: readonly IPlannedStep[],
		ctx: ITxContext,
	) => Promise<readonly IBackup[]>;
	readonly apply: (
		steps: readonly IPlannedStep[],
		ctx: ITxContext,
	) => Promise<void>;
	readonly validate: (
		steps: readonly IPlannedStep[],
		ctx: ITxContext,
	) => Promise<IValidationReport>;
	readonly commit: (
		backups: readonly IBackup[],
		manifest: IMigrationManifest,
		ctx: ITxContext,
	) => Promise<void>;
	readonly rollback: (
		backups: readonly IBackup[],
		ctx: ITxContext,
		reason: string,
	) => Promise<IRollbackReport>;
}

export type ITransactionOutcome =
	| {
			readonly status: 'committed';
			readonly manifest: IMigrationManifest;
			readonly manifestPath: string;
	  }
	| {
			readonly status: 'rolled-back';
			readonly manifest: IMigrationManifest;
			readonly reason: string;
			readonly rollbackErrors?: readonly {
				readonly path: string;
				readonly reason: string;
			}[];
	  }
	| {
			readonly status: 'rollback-failed';
			readonly manifest: IMigrationManifest;
			readonly reason: string;
			readonly rollbackErrors: readonly {
				readonly path: string;
				readonly reason: string;
			}[];
	  };

export const createDefaultPhases = (input: {
	readonly migrations: readonly IMigration[];
	readonly commit?: (
		backups: readonly IBackup[],
		manifest: IMigrationManifest,
		ctx: ITxContext,
	) => Promise<void>;
}): ITransactionPhases => {
	let discovered: readonly IMigration[] = [];
	const fallbackCommit = input.commit;
	return {
		discover: async (ctx) => {
			const matched: IMigration[] = [];
			for (const migration of input.migrations) {
				if (
					await migration.detect({
						workspaceRoot: ctx.workspaceRoot,
						dryRun: true,
					})
				) {
					matched.push(migration);
				}
			}
			discovered = matched;
			return matched;
		},
		plan: async (migrations, ctx) => {
			const all: IPlannedStep[] = [];
			for (const migration of migrations) {
				const steps = await migration.plan({
					workspaceRoot: ctx.workspaceRoot,
					dryRun: true,
				});
				for (const step of steps) {
					all.push({
						kind: step.kind,
						detail: step.detail,
						migrationId: migration.id,
					});
				}
			}
			return all;
		},
		backup: async (_steps, ctx) => createWorkspaceBackup(ctx.workspaceRoot),
		apply: async (_steps, ctx) => {
			for (const migration of discovered) {
				await migration.apply({
					workspaceRoot: ctx.workspaceRoot,
					dryRun: false,
				});
			}
		},
		validate: async (_steps, ctx): Promise<IValidationReport> => {
			for (const migration of discovered) {
				const stillNeeded = await migration.detect({
					workspaceRoot: ctx.workspaceRoot,
					dryRun: false,
				});
				if (stillNeeded) {
					return {
						ok: false,
						reason: `migration ${migration.id} still detects legacy state`,
					};
				}
			}
			return { ok: true, reason: 'ok' };
		},
		commit: fallbackCommit ?? (async () => undefined),
		rollback: async (backups, ctx, reason) => {
			return runRollback(backups, ctx, reason);
		},
	};
};

export const runMigrationTransaction = async (
	phases: ITransactionPhases,
	ctx: ITxContext,
): Promise<ITransactionOutcome> => {
	const startedAt = new Date().toISOString();

	const migrations = await phases.discover(ctx);
	if (migrations.length === 0) {
		const manifest = buildManifest({
			migration_id: 'noop',
			started_at: startedAt,
			finished_at: startedAt,
			affected_files: 0,
			renames: [],
			package_changes: [],
			host_config_changes: [],
			validation_outcome: 'ok',
			rollback_reason: null,
		});
		const manifestPath = await writeManifest(ctx.workspaceRoot, manifest);
		return { status: 'committed', manifest, manifestPath };
	}

	const steps = await phases.plan(migrations, ctx);
	const backups = await phases.backup(steps, ctx);

	try {
		await phases.apply(steps, ctx);
	} catch (error) {
		const reason = error instanceof Error ? error.message : String(error);
		return await rollbackFromFailure({
			phases,
			ctx,
			startedAt,
			migrations,
			steps,
			backups,
			reason: `apply: ${reason}`,
			originalError: reason,
		});
	}

	const validation = await phases.validate(steps, ctx);
	if (!validation.ok) {
		return await rollbackFromFailure({
			phases,
			ctx,
			startedAt,
			migrations,
			steps,
			backups,
			reason: `validate: ${validation.reason}`,
			originalError: validation.reason,
		});
	}

	const manifest = buildManifest({
		migration_id: deriveMigrationId(migrations),
		started_at: startedAt,
		finished_at: new Date().toISOString(),
		affected_files: deriveAffectedFiles(backups),
		renames: deriveRenames(steps),
		package_changes: derivePackageChanges(steps),
		host_config_changes: deriveHostConfigChanges(steps),
		validation_outcome: validationOutcomeFromReport(validation),
		rollback_reason: null,
	});
	await phases.commit(backups, manifest, ctx);
	const manifestPath = await writeManifest(ctx.workspaceRoot, manifest);
	return { status: 'committed', manifest, manifestPath };
};

interface IRollbackFailureInput {
	readonly phases: ITransactionPhases;
	readonly ctx: ITxContext;
	readonly startedAt: string;
	readonly migrations: readonly IMigration[];
	readonly steps: readonly IPlannedStep[];
	readonly backups: readonly IBackup[];
	readonly reason: string;
	readonly originalError: string;
}

const rollbackFromFailure = async (
	input: IRollbackFailureInput,
): Promise<ITransactionOutcome> => {
	const rollbackReport = await input.phases
		.rollback(input.backups, input.ctx, input.reason)
		.catch((fatal) => ({
			restored: [],
			removed: [],
			skipped: [],
			errors: [
				{
					path: '<rollback>',
					reason:
						fatal instanceof Error ? fatal.message : String(fatal),
				},
			],
		}));

	const manifest = buildManifest({
		migration_id: deriveMigrationId(input.migrations),
		started_at: input.startedAt,
		finished_at: new Date().toISOString(),
		affected_files: deriveAffectedFiles(input.backups),
		renames: deriveRenames(input.steps),
		package_changes: derivePackageChanges(input.steps),
		host_config_changes: deriveHostConfigChanges(input.steps),
		validation_outcome: `failed: ${input.originalError}`,
		rollback_reason: input.reason,
	});

	if (rollbackReport.errors.length > 0) {
		return {
			status: 'rollback-failed',
			manifest,
			reason: input.reason,
			rollbackErrors: rollbackReport.errors,
		};
	}
	return {
		status: 'rolled-back',
		manifest,
		reason: input.reason,
		rollbackErrors: rollbackReport.errors,
	};
};

const deriveAffectedFiles = (backups: readonly IBackup[]): number => {
	const seen = new Set<string>();
	for (const backup of backups) {
		if (backup.kind !== 'file') continue;
		seen.add(backup.path);
	}
	return seen.size;
};

const deriveMigrationId = (migrations: readonly IMigration[]): string =>
	migrations.map((migration) => migration.id).join(',');

const deriveRenames = (
	steps: readonly IPlannedStep[],
): readonly IManifestRename[] => {
	const renames: IManifestRename[] = [];
	for (const step of steps) {
		if (step.kind !== 'rename') continue;
		const parts = step.detail.split('->').map((part) => part.trim());
		if (parts.length !== 2) continue;
		renames.push({ from: parts[0] ?? '', to: parts[1] ?? '' });
	}
	return renames;
};

const derivePackageChanges = (
	steps: readonly IPlannedStep[],
): readonly IManifestPackageChange[] => {
	const changes: IManifestPackageChange[] = [];
	for (const step of steps) {
		if (step.kind !== 'package-change') continue;
		const [file, change] = step.detail.split('|');
		const [before, after] = (change ?? '')
			.split('->')
			.map((part) => part.trim());
		if (file === undefined || before === undefined || after === undefined)
			continue;
		changes.push({ file: file.trim(), before, after });
	}
	return changes;
};

const deriveHostConfigChanges = (
	steps: readonly IPlannedStep[],
): readonly IManifestHostConfigChange[] => {
	const changes: IManifestHostConfigChange[] = [];
	for (const step of steps) {
		if (step.kind !== 'host-config-change') continue;
		const [file, scope, change] = step.detail.split('|');
		const [before, after] = (change ?? '')
			.split('->')
			.map((part) => part.trim());
		if (
			file === undefined ||
			scope === undefined ||
			before === undefined ||
			after === undefined
		) {
			continue;
		}
		changes.push({ file: file.trim(), scope: scope.trim(), before, after });
	}
	return changes;
};
