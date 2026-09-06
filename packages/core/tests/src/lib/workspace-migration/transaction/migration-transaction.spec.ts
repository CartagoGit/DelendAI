import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import type { IMigration } from '@delendai/core/lib/contracts/interfaces/workspace-migration.interface';
import {
	createDefaultPhases,
	runMigrationTransaction,
	type IPlannedStep,
} from '@delendai/core/lib/workspace-migration/transaction/migration-transaction';
import { hashWorkspaceAt } from '@delendai/core/lib/workspace-migration/transaction/rollback';

const mkMigration = (
	id: string,
	overrides: Partial<IMigration> = {},
): IMigration => ({
	id,
	detect: async ({ workspaceRoot }) => {
		const marker = join(workspaceRoot, 'legacy.txt');
		try {
			const text = await readFile(marker, 'utf8');
			return text.includes('legacy');
		} catch {
			return false;
		}
	},
	plan: async () =>
		[
			{ kind: 'rename', detail: 'docs/legacy -> docs/modern' },
			{
				kind: 'package-change',
				detail: 'package.json|@delendai/core -> @delendai/core',
			},
			{
				kind: 'host-config-change',
				detail: '~/.claude.json|claude|delendai -> delendai',
			},
		] satisfies readonly IPlannedStep[],
	apply: async ({ workspaceRoot }) => {
		await mkdir(join(workspaceRoot, 'docs'), { recursive: true });
		await writeFile(join(workspaceRoot, 'legacy.txt'), 'migrated\n');
		await writeFile(join(workspaceRoot, 'new.txt'), 'new\n');
	},
	...overrides,
});

describe('runMigrationTransaction (b00239 S6)', () => {
	it('executes DISCOVER → PLAN → BACKUP → APPLY → VALIDATE → COMMIT and writes a manifest', async () => {
		const workspaceRoot = await mkdtemp(
			join(tmpdir(), 'delendai-s6-tx-happy-'),
		);
		await writeFile(join(workspaceRoot, 'legacy.txt'), 'legacy\n');
		const order: string[] = [];
		const tx = createDefaultPhases({
			migrations: [mkMigration('v1')],
			commit: async () => {
				order.push('COMMIT');
			},
		});
		const wrapped = {
			...tx,
			discover: async (ctx: { workspaceRoot: string }) => {
				order.push('DISCOVER');
				return tx.discover(ctx);
			},
			plan: async (
				migrations: readonly IMigration[],
				ctx: { workspaceRoot: string },
			) => {
				order.push('PLAN');
				return tx.plan(migrations, ctx);
			},
			backup: async (
				steps: readonly IPlannedStep[],
				ctx: { workspaceRoot: string },
			) => {
				order.push('BACKUP');
				return tx.backup(steps, ctx);
			},
			apply: async (
				steps: readonly IPlannedStep[],
				ctx: { workspaceRoot: string },
			) => {
				order.push('APPLY');
				return tx.apply(steps, ctx);
			},
			validate: async (
				steps: readonly IPlannedStep[],
				ctx: { workspaceRoot: string },
			) => {
				order.push('VALIDATE');
				return tx.validate(steps, ctx);
			},
		};

		const result = await runMigrationTransaction(wrapped, {
			workspaceRoot,
		});
		expect(result.status).toBe('committed');
		expect(order).toEqual([
			'DISCOVER',
			'PLAN',
			'BACKUP',
			'APPLY',
			'VALIDATE',
			'COMMIT',
		]);
		if (result.status === 'committed') {
			expect(result.manifest.migration_id).toBe('v1');
			expect(result.manifest.affected_files).toBeGreaterThan(0);
			expect(result.manifest.validation_outcome).toBe('ok');
			expect(result.manifest.renames).toEqual([
				{ from: 'docs/legacy', to: 'docs/modern' },
			]);
			expect(result.manifest.package_changes).toEqual([
				{
					file: 'package.json',
					before: '@delendai/core',
					after: '@delendai/core',
				},
			]);
			expect(result.manifest.host_config_changes).toEqual([
				{
					file: '~/.claude.json',
					scope: 'claude',
					before: 'delendai',
					after: 'delendai',
				},
			]);
			expect(result.manifestPath).toContain(
				'.delendai/migration-manifests',
			);
		}
	});

	it('rolls back when APPLY fails and restores the workspace hash', async () => {
		const workspaceRoot = await mkdtemp(
			join(tmpdir(), 'delendai-s6-tx-apply-'),
		);
		await mkdir(join(workspaceRoot, 'docs', 'legacy'), { recursive: true });
		await writeFile(join(workspaceRoot, 'legacy.txt'), 'legacy\n');
		await writeFile(join(workspaceRoot, 'docs', 'legacy', 'a.md'), 'A\n');
		const before = await hashWorkspaceAt(workspaceRoot);
		const result = await runMigrationTransaction(
			createDefaultPhases({
				migrations: [
					mkMigration('v1', {
						apply: async ({ workspaceRoot }) => {
							await writeFile(
								join(workspaceRoot, 'legacy.txt'),
								'broken\n',
							);
							await writeFile(
								join(workspaceRoot, 'created.txt'),
								'temp\n',
							);
							throw new Error('apply exploded');
						},
					}),
				],
			}),
			{ workspaceRoot },
		);
		expect(result.status).toBe('rolled-back');
		expect(await hashWorkspaceAt(workspaceRoot)).toBe(before);
		if (result.status !== 'committed') {
			expect(result.reason).toContain('apply: apply exploded');
		}
	});

	it('rolls back when VALIDATE fails and restores the workspace hash', async () => {
		const workspaceRoot = await mkdtemp(
			join(tmpdir(), 'delendai-s6-tx-validate-'),
		);
		await writeFile(join(workspaceRoot, 'legacy.txt'), 'legacy\n');
		const before = await hashWorkspaceAt(workspaceRoot);
		const tx = createDefaultPhases({
			migrations: [
				mkMigration('v1', {
					apply: async ({ workspaceRoot }) => {
						await writeFile(
							join(workspaceRoot, 'legacy.txt'),
							'still legacy\n',
						);
					},
				}),
			],
		});
		const result = await runMigrationTransaction(
			{
				...tx,
				validate: async () => ({
					ok: false,
					reason: 'legacy marker still present',
				}),
			},
			{ workspaceRoot },
		);
		expect(result.status).toBe('rolled-back');
		expect(await hashWorkspaceAt(workspaceRoot)).toBe(before);
		if (result.status !== 'committed') {
			expect(result.reason).toContain(
				'validate: legacy marker still present',
			);
		}
	});

	it('persists the ten required manifest fields', async () => {
		const workspaceRoot = await mkdtemp(
			join(tmpdir(), 'delendai-s6-tx-manifest-'),
		);
		await writeFile(join(workspaceRoot, 'legacy.txt'), 'legacy\n');
		const result = await runMigrationTransaction(
			createDefaultPhases({ migrations: [mkMigration('v1')] }),
			{ workspaceRoot },
		);
		if (result.status !== 'committed')
			throw new Error('expected committed result');
		expect(Object.keys(result.manifest).sort()).toEqual([
			'affected_files',
			'finished_at',
			'host_config_changes',
			'migration_id',
			'migration_version',
			'package_changes',
			'renames',
			'rollback_reason',
			'started_at',
			'validation_outcome',
		]);
	});
});
