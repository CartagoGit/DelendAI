import { describe, expect, it } from 'vitest';

import type { ICliCommandContext } from '../contracts/interfaces/cli-command.interface';
import { createMigrateCommand, MIGRATE_EXIT_CODE } from './migrate.command';

const mkCtx = (cwd: string): ICliCommandContext => ({
	cwd,
	globals: {
		workspace: cwd,
		json: false,
		format: 'text',
		lang: 'en',
		noColor: true,
		plugins: [],
	},
	request: async <TOut>() => undefined as unknown as TOut,
	listTools: async () => [],
	close: async () => {},
});

describe('migrate command (b00239 S6)', () => {
	it('maps status and dry-run to explicit success / nothing-to-do exit codes', async () => {
		const cmd = createMigrateCommand({
			status: async (workspaceRoot) => ({
				action: 'status',
				acted: false,
				workspaceRoot,
				migrations: [{ id: 'v1', needed: false }],
			}),
			dryRun: async (workspaceRoot) => ({
				action: 'dry-run',
				acted: true,
				workspaceRoot,
				migrations: [
					{
						id: 'v1',
						needed: true,
						steps: [{ kind: 'rename', detail: 'a -> b' }],
					},
				],
			}),
			run: async () => {
				throw new Error('not used');
			},
			rollback: async () => ({ status: 'failed', reason: 'not used' }),
		});

		const status = await cmd.run(
			['migrate', 'status'],
			mkCtx('/workspace'),
		);
		expect(status.code).toBe(MIGRATE_EXIT_CODE.NOTHING_TO_DO);

		const dryRun = await cmd.run(
			['migrate', '--dry-run'],
			mkCtx('/workspace'),
		);
		expect(dryRun.code).toBe(MIGRATE_EXIT_CODE.OK);
	});

	it('maps run outcomes to OK / ROLLED_BACK / FAILED', async () => {
		const cmd = createMigrateCommand({
			status: async (workspaceRoot) => ({
				action: 'status',
				acted: false,
				workspaceRoot,
				migrations: [],
			}),
			dryRun: async (workspaceRoot) => ({
				action: 'dry-run',
				acted: false,
				workspaceRoot,
				migrations: [],
			}),
			run: async (workspaceRoot) => ({
				status: 'committed',
				manifestPath: `${workspaceRoot}/.delendai/migration-manifests/v1.json`,
				manifest: {
					migration_id: 'v1',
					migration_version: 1,
					started_at: 's',
					finished_at: 'f',
					affected_files: 1,
					renames: [],
					package_changes: [],
					host_config_changes: [],
					validation_outcome: 'ok',
					rollback_reason: null,
				},
			}),
			rollback: async () => ({ status: 'failed', reason: 'not used' }),
		});

		expect(
			(await cmd.run(['migrate', 'run'], mkCtx('/workspace'))).code,
		).toBe(MIGRATE_EXIT_CODE.OK);

		const rolledBack = createMigrateCommand({
			status: cmd.run.bind(cmd) as never,
			dryRun: cmd.run.bind(cmd) as never,
			run: async () => ({
				status: 'rolled-back',
				reason: 'validate: failed',
				rollbackErrors: [],
				manifest: {
					migration_id: 'v1',
					migration_version: 1,
					started_at: 's',
					finished_at: 'f',
					affected_files: 1,
					renames: [],
					package_changes: [],
					host_config_changes: [],
					validation_outcome: 'failed: x',
					rollback_reason: 'validate: failed',
				},
			}),
			rollback: async () => ({ status: 'failed', reason: 'not used' }),
		});
		expect(
			(await rolledBack.run(['migrate', 'run'], mkCtx('/workspace')))
				.code,
		).toBe(MIGRATE_EXIT_CODE.ROLLED_BACK);
	});

	it('supports the rollback subcommand and returns the rollback exit code on success', async () => {
		const cmd = createMigrateCommand({
			status: async (workspaceRoot) => ({
				action: 'status',
				acted: false,
				workspaceRoot,
				migrations: [],
			}),
			dryRun: async (workspaceRoot) => ({
				action: 'dry-run',
				acted: false,
				workspaceRoot,
				migrations: [],
			}),
			run: async () => {
				throw new Error('not used');
			},
			rollback: async () => ({
				status: 'rolled-back',
				detail: 'restored latest backup',
			}),
		});
		const result = await cmd.run(
			['migrate', 'rollback'],
			mkCtx('/workspace'),
		);
		expect(result.code).toBe(MIGRATE_EXIT_CODE.ROLLED_BACK);
	});

	it('rejects unknown migrate subcommands with USAGE', async () => {
		const cmd = createMigrateCommand({
			status: async (workspaceRoot) => ({
				action: 'status',
				acted: false,
				workspaceRoot,
				migrations: [],
			}),
			dryRun: async (workspaceRoot) => ({
				action: 'dry-run',
				acted: false,
				workspaceRoot,
				migrations: [],
			}),
			run: async () => {
				throw new Error('not used');
			},
			rollback: async () => ({ status: 'failed', reason: 'not used' }),
		});
		const result = await cmd.run(
			['migrate', 'explode'],
			mkCtx('/workspace'),
		);
		expect(result.code).toBe(2);
		expect(result.error).toContain('unknown migrate subcommand');
	});
});
