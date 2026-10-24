/**
 * migration-transaction.ts — b00239 S6.
 */
import { createHash } from 'node:crypto';

import type {
	IMigration,
	IMigrationJournal,
} from '../../contracts/interfaces/workspace-migration.interface';

import {
	buildManifest,
	type IManifestHostConfigChange,
	type IManifestPackageChange,
	type IManifestRename,
	type IMigrationManifest,
	type IValidationReport,
	writeManifest,
} from './migration-manifest';
import {
	createWorkspaceBackup,
	hashFileAt,
	persistBackups,
	readPersistedBackups,
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
	readonly journal?: IMigrationJournal;
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
			const applied =
				input.journal === undefined
					? []
					: await input.journal.read(ctx.workspaceRoot);
			const matched: IMigration[] = [];
			for (const migration of input.migrations) {
				if (applied.includes(migration.id)) continue;
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
		validate: async (): Promise<IValidationReport> => ({
			ok: true,
			reason: 'ok',
		}),
		commit: async (backups, manifest, ctx) => {
			if (input.journal !== undefined) {
				for (const migration of discovered) {
					await input.journal.record(ctx.workspaceRoot, migration.id);
				}
			}
			await fallbackCommit?.(backups, manifest, ctx);
		},
		rollback: async (backups, ctx, reason) =>
			runRollback(backups, ctx, reason),
	};
};

export const runMigrationTransaction = async (
	phases: ITransactionPhases,
	ctx: ITxContext,
): Promise<ITransactionOutcome> => {
	const timestamp = new Date().toISOString();
	const migrations = await phases.discover(ctx);

	if (migrations.length === 0) {
		const manifest = buildManifest({
			id: 'noop',
			timestamp,
			affectedFiles: [],
			hashesBefore: {},
			hashesAfter: {},
			renames: [],
			packageChanges: [],
			hostConfigChanges: [],
			validationResult: { ok: true, reason: 'nothing to migrate' },
		});
		const manifestPath = await writeManifest(ctx.workspaceRoot, manifest);
		return { status: 'committed', manifest, manifestPath };
	}

	const steps = await phases.plan(migrations, ctx);
	const backups = await phases.backup(steps, ctx);
	const manifestId = deriveMigrationId(migrations);
	await persistBackups(
		ctx.workspaceRoot,
		{ id: manifestId, timestamp },
		backups,
	);

	try {
		await phases.apply(steps, ctx);
	} catch (error) {
		const reason = error instanceof Error ? error.message : String(error);
		return rollbackFromFailure({
			phases,
			ctx,
			timestamp,
			migrations,
			steps,
			backups,
			reason: `apply: ${reason}`,
			originalError: reason,
		});
	}

	const validation = await phases.validate(steps, ctx);
	if (!validation.ok) {
		return rollbackFromFailure({
			phases,
			ctx,
			timestamp,
			migrations,
			steps,
			backups,
			reason: `validate: ${validation.reason}`,
			originalError: validation.reason,
		});
	}

	const hashesBefore = hashesBeforeFromBackups(backups);
	const hashesAfter = await hashesAfterFromBackups(
		backups,
		ctx.workspaceRoot,
	);
	const manifest = buildManifest({
		id: manifestId,
		timestamp,
		affectedFiles: deriveAffectedFiles(backups),
		hashesBefore,
		hashesAfter,
		renames: deriveRenames(steps),
		packageChanges: derivePackageChanges(steps, hashesBefore, hashesAfter),
		hostConfigChanges: deriveHostConfigChanges(
			steps,
			hashesBefore,
			hashesAfter,
		),
		validationResult: validation,
	});
	await phases.commit(backups, manifest, ctx);
	const manifestPath = await writeManifest(ctx.workspaceRoot, manifest);
	return { status: 'committed', manifest, manifestPath };
};

interface IRollbackFailureInput {
	readonly phases: ITransactionPhases;
	readonly ctx: ITxContext;
	readonly timestamp: string;
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
		id: deriveMigrationId(input.migrations),
		timestamp: input.timestamp,
		affectedFiles: deriveAffectedFiles(input.backups),
		hashesBefore: hashesBeforeFromBackups(input.backups),
		hashesAfter: {},
		renames: deriveRenames(input.steps),
		packageChanges: [],
		hostConfigChanges: [],
		validationResult: { ok: false, reason: input.originalError },
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

const deriveAffectedFiles = (
	backups: readonly IBackup[],
): readonly string[] => {
	const seen = new Set<string>();
	for (const backup of backups) {
		if (backup.kind !== 'file') continue;
		seen.add(backup.path);
	}
	return [...seen].sort();
};

const deriveMigrationId = (migrations: readonly IMigration[]): string =>
	migrations.map((migration) => migration.id).join(',');

const deriveRenames = (
	steps: readonly IPlannedStep[],
): readonly IManifestRename[] => {
	const renames: IManifestRename[] = [];
	for (const step of steps) {
		if (step.kind !== 'rename') continue;
		const detail = step.detail.includes(': ')
			? (step.detail.split(': ')[1] ?? '')
			: step.detail;
		const parts = detail.split('→').map((part) => part.trim());
		if (parts.length !== 2) continue;
		renames.push({ from: parts[0] ?? '', to: parts[1] ?? '' });
	}
	return renames;
};

const derivePackageChanges = (
	steps: readonly IPlannedStep[],
	hashesBefore: Readonly<Record<string, string>>,
	hashesAfter: Readonly<Record<string, string>>,
): readonly IManifestPackageChange[] =>
	steps.flatMap((step) => {
		if (step.kind !== 'manifest-changed') return [];
		return [
			{
				name: 'package.json',
				from: hashesBefore['package.json'] ?? '__absent__',
				to: hashesAfter['package.json'] ?? '__absent__',
			},
		];
	});

const deriveHostConfigChanges = (
	steps: readonly IPlannedStep[],
	hashesBefore: Readonly<Record<string, string>>,
	hashesAfter: Readonly<Record<string, string>>,
): readonly IManifestHostConfigChange[] =>
	steps.flatMap((step) => {
		if (step.kind !== 'rewrite-host-config') return [];
		return [
			{
				file: '.vscode/mcp.json',
				before: hashesBefore['.vscode/mcp.json'] ?? '__absent__',
				after: hashesAfter['.vscode/mcp.json'] ?? '__absent__',
			},
		];
	});

const hashBytes = (contentBase64: string): string =>
	createHash('sha256')
		.update(Buffer.from(contentBase64, 'base64'))
		.digest('hex');

const hashesBeforeFromBackups = (
	backups: readonly IBackup[],
): Readonly<Record<string, string>> =>
	Object.fromEntries(
		backups
			.filter(
				(backup): backup is Extract<IBackup, { kind: 'file' }> =>
					backup.kind === 'file',
			)
			.map((backup) => [
				backup.path,
				backup.contentBase64 === null
					? '__absent__'
					: hashBytes(backup.contentBase64),
			]),
	);

const hashesAfterFromBackups = async (
	backups: readonly IBackup[],
	workspaceRoot: string,
): Promise<Readonly<Record<string, string>>> => {
	const pairs: Array<readonly [string, string]> = [];
	for (const backup of backups) {
		if (backup.kind !== 'file') continue;
		const absolute = `${workspaceRoot}/${backup.path}`;
		try {
			pairs.push([backup.path, await hashFileAt(absolute)]);
		} catch (error) {
			if (
				typeof error === 'object' &&
				error !== null &&
				'code' in error &&
				(error as { code: unknown }).code === 'ENOENT'
			) {
				pairs.push([backup.path, '__absent__']);
				continue;
			}
			throw error;
		}
	}
	return Object.fromEntries(pairs);
};

export const rollbackLatestMigration = async (
	ctx: ITxContext,
	manifest: Pick<IMigrationManifest, 'id' | 'timestamp'>,
	reason: string,
): Promise<IRollbackReport> => {
	const backups = await readPersistedBackups(ctx.workspaceRoot, manifest);
	if (backups === null) {
		throw new Error(`missing persisted backup for ${manifest.id}`);
	}
	return runRollback(backups, ctx, reason);
};
