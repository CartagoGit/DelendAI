/**
 * legacy-migration.service.spec.ts — b00239 S2.
 *
 * The properties that make this engine safe to run before every server
 * start, in order of how badly each one fails if it is wrong:
 *
 *  - it must cost almost nothing and say nothing when there is nothing to
 *    migrate, because that is the case for every project forever after the
 *    transition, and a check that talks on the happy path gets disabled;
 *  - it must not record a migration that did not finish, because that
 *    makes a half-migrated workspace permanent;
 *  - it must stop at the first failure rather than stack the next
 *    migration on top of an unfinished one.
 */
import { describe, expect, it, vi } from 'vitest';

import {
	ensureWorkspaceMigrated,
	runPendingMigrations,
	type IMigration,
	type IMigrationJournal,
} from '@delendai/core/lib/workspace-migration/legacy-migration.service';

const ROOT = '/workspace';

const journalOver = (applied: string[] = []): IMigrationJournal => ({
	read: async () => applied,
	record: async (_root, id) => {
		applied.push(id);
	},
});

const migration = (
	id: string,
	overrides: Partial<IMigration> = {},
): IMigration => ({
	id,
	detect: async () => true,
	plan: async () => [{ kind: 'rename', detail: `${id} would rename` }],
	apply: async () => undefined,
	...overrides,
});

describe('runPendingMigrations', () => {
	it('costs one probe and reports not-needed when nothing matches', async () => {
		// The common case after the transition, and the one that must stay
		// silent: `plan` is the expensive half and must not be reached.
		const plan = vi.fn();
		const apply = vi.fn();
		const result = await runPendingMigrations({
			migrations: [
				migration('v1', { detect: async () => false, plan, apply }),
			],
			journal: journalOver(),
			ctx: { workspaceRoot: ROOT, dryRun: false },
		});
		expect(result.acted).toBe(false);
		expect(result.outcomes).toEqual([{ status: 'not-needed' }]);
		expect(plan).not.toHaveBeenCalled();
		expect(apply).not.toHaveBeenCalled();
	});

	it('skips a migration already recorded, without probing for it', async () => {
		const detect = vi.fn(async () => true);
		const result = await runPendingMigrations({
			migrations: [migration('v1', { detect })],
			journal: journalOver(['v1']),
			ctx: { workspaceRoot: ROOT, dryRun: false },
		});
		expect(detect).not.toHaveBeenCalled();
		expect(result.acted).toBe(false);
	});

	it('applies a pending migration and records it afterwards', async () => {
		const order: string[] = [];
		const applied: string[] = [];
		const journal: IMigrationJournal = {
			read: async () => applied,
			record: async (_root, id) => {
				order.push(`record:${id}`);
				applied.push(id);
			},
		};
		const result = await runPendingMigrations({
			migrations: [
				migration('v1', {
					apply: async () => {
						order.push('apply:v1');
					},
				}),
			],
			journal,
			ctx: { workspaceRoot: ROOT, dryRun: false },
		});
		expect(result.outcomes).toEqual([{ status: 'migrated', id: 'v1' }]);
		// Order matters: recording first would mark a crashed migration
		// as done and make the damage permanent.
		expect(order).toEqual(['apply:v1', 'record:v1']);
	});

	it('does NOT record a migration whose apply threw', async () => {
		const applied: string[] = [];
		const result = await runPendingMigrations({
			migrations: [
				migration('v1', {
					apply: async () => {
						throw new Error('disk full');
					},
				}),
			],
			journal: journalOver(applied),
			ctx: { workspaceRoot: ROOT, dryRun: false },
		});
		expect(result.outcomes[0]).toMatchObject({
			status: 'failed',
			id: 'v1',
		});
		expect(applied).toEqual([]);
	});

	it('stops at the first failure instead of stacking the next migration', async () => {
		// Running v2 over a workspace where v1 did not finish is how a
		// half-migrated tree ends up recorded as complete.
		const second = vi.fn(async () => undefined);
		const result = await runPendingMigrations({
			migrations: [
				migration('v1', {
					apply: async () => {
						throw new Error('interrupted');
					},
				}),
				migration('v2', { apply: second }),
			],
			journal: journalOver(),
			ctx: { workspaceRoot: ROOT, dryRun: false },
		});
		expect(second).not.toHaveBeenCalled();
		expect(result.outcomes).toHaveLength(1);
	});

	it('runs migrations in declaration order, not alphabetically', async () => {
		// Declaration order IS the dependency statement; an alphabetical
		// accident is not.
		const order: string[] = [];
		await runPendingMigrations({
			migrations: [
				migration('zeta', {
					apply: async () => {
						order.push('zeta');
					},
				}),
				migration('alpha', {
					apply: async () => {
						order.push('alpha');
					},
				}),
			],
			journal: journalOver(),
			ctx: { workspaceRoot: ROOT, dryRun: false },
		});
		expect(order).toEqual(['zeta', 'alpha']);
	});

	it('is idempotent: a second run over the same journal does nothing', async () => {
		const applied: string[] = [];
		const journal = journalOver(applied);
		const apply = vi.fn(async () => undefined);
		const ctx = { workspaceRoot: ROOT, dryRun: false };
		await runPendingMigrations({
			migrations: [migration('v1', { apply })],
			journal,
			ctx,
		});
		const second = await runPendingMigrations({
			migrations: [migration('v1', { apply })],
			journal,
			ctx,
		});
		expect(apply).toHaveBeenCalledTimes(1);
		expect(second.acted).toBe(false);
	});
});

describe('dry run', () => {
	it('plans without applying or recording', async () => {
		const applied: string[] = [];
		const apply = vi.fn();
		const result = await runPendingMigrations({
			migrations: [migration('v1', { apply })],
			journal: journalOver(applied),
			ctx: { workspaceRoot: ROOT, dryRun: true },
		});
		expect(apply).not.toHaveBeenCalled();
		expect(applied).toEqual([]);
		expect(result.outcomes[0]).toMatchObject({
			status: 'planned',
			id: 'v1',
		});
	});
});

describe('ensureWorkspaceMigrated', () => {
	it('reports nothing when there was nothing to do', async () => {
		// The guard runs on every start of every project. Silence on the
		// happy path is the feature.
		const report = vi.fn();
		await ensureWorkspaceMigrated({
			migrations: [migration('v1', { detect: async () => false })],
			journal: journalOver(),
			workspaceRoot: ROOT,
			report,
		});
		expect(report).not.toHaveBeenCalled();
	});

	it('reports once when a migration ran', async () => {
		const report = vi.fn();
		await ensureWorkspaceMigrated({
			migrations: [migration('v1')],
			journal: journalOver(),
			workspaceRoot: ROOT,
			report,
		});
		expect(report).toHaveBeenCalledTimes(1);
	});
});
