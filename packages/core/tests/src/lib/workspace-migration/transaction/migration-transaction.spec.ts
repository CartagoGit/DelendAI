import {
	existsSync,
	mkdirSync,
	mkdtempSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';

import { afterEach, describe, expect, it } from 'vitest';

import type { IMigration } from '@delendai/core/lib/contracts/interfaces/workspace-migration.interface';
import {
	createDefaultPhases,
	createWorkspaceRoutePhases,
	rollbackLatestMigration,
	runMigrationTransaction,
	type IBackup,
	type ITransactionPhases,
} from '@delendai/core/lib/workspace-migration/transaction/migration-transaction';
import { readManifestFromDisk } from '@delendai/core/lib/workspace-migration/transaction/migration-manifest';
import {
	backupScopeExcludes,
	readPersistedBackups,
	rollback,
	recordWrittenSince,
	type IWrittenRecord,
} from '@delendai/core/lib/workspace-migration/transaction/rollback';

const roots: string[] = [];

const makeWorkspace = (): string => {
	const root = mkdtempSync(join(tmpdir(), 'delendai-s6-'));
	roots.push(root);
	return root;
};

/** The workspace as a backup sees it: delendai's records are kept apart. */
const treeHash = (root: string): string => {
	const digest = createHash('sha256');
	const excluded = backupScopeExcludes(root);
	const visit = (dir: string, prefix = ''): void => {
		const entries = require('node:fs')
			.readdirSync(dir, { withFileTypes: true })
			.sort((a: { name: string }, b: { name: string }) =>
				a.name.localeCompare(b.name),
			);
		for (const entry of entries) {
			const rel = prefix === '' ? entry.name : `${prefix}/${entry.name}`;
			if (
				excluded.some(
					(scope) => rel === scope || rel.startsWith(`${scope}/`),
				)
			)
				continue;
			const absolute = join(dir, entry.name);
			if (entry.isDirectory()) {
				visit(absolute, rel);
				continue;
			}
			digest.update(rel);
			digest.update(readFileSync(absolute));
		}
	};
	visit(root);
	return digest.digest('hex');
};

const baseMigration = (apply: (root: string) => Promise<void>): IMigration => ({
	id: 'delendaiToDelendAI:v1',
	detect: async () => true,
	plan: async () => [
		{
			kind: 'rewrite-config-file',
			detail: 'delendai.config.json: 1 string field(s) carry the legacy identity',
		},
	],
	apply: async (ctx) => apply(ctx.workspaceRoot),
});

const backupOf = (root: string): readonly IBackup[] => [
	{
		kind: 'file',
		path: 'delendai.config.json',
		contentBase64: Buffer.from(
			readFileSync(join(root, 'delendai.config.json'), 'utf8'),
			'utf8',
		).toString('base64'),
	},
];

afterEach(() => {
	for (const root of roots.splice(0)) {
		rmSync(root, { recursive: true, force: true });
	}
});

describe('migration transaction (b00239 S6)', () => {
	it('exposes the six phases plus rollback through createDefaultPhases', () => {
		const phases = createDefaultPhases({ migrations: [] });
		expect(typeof phases.discover).toBe('function');
		expect(typeof phases.plan).toBe('function');
		expect(typeof phases.backup).toBe('function');
		expect(typeof phases.apply).toBe('function');
		expect(typeof phases.validate).toBe('function');
		expect(typeof phases.commit).toBe('function');
		expect(typeof phases.rollback).toBe('function');
	});

	it('rolls back to the original tree hash when APPLY fails after mutating', async () => {
		const root = makeWorkspace();
		writeFileSync(join(root, 'delendai.config.json'), '{"name":"old"}\n');
		const before = treeHash(root);

		const phases: ITransactionPhases = {
			discover: async () => [baseMigration(async () => undefined)],
			plan: async () => [
				{
					kind: 'rewrite-config-file',
					detail: 'delendai.config.json: 1 string field(s) carry the legacy identity',
				},
			],
			backup: async () => backupOf(root),
			apply: async () => {
				writeFileSync(
					join(root, 'delendai.config.json'),
					'{"name":"new"}\n',
				);
				throw new Error('boom-apply');
			},
			validate: async () => ({ ok: true, reason: '' }),
			commit: async () => undefined,
			rollback: async (backups, ctx, reason) =>
				rollback(backups, ctx, reason),
		};

		const outcome = await runMigrationTransaction(phases, {
			workspaceRoot: root,
		});
		expect(outcome.status).toBe('rolled-back');
		expect(treeHash(root)).toBe(before);
	});

	it('leaves what the backup did not take alone, and keeps the failed attempt on record', async () => {
		const root = makeWorkspace();
		writeFileSync(join(root, 'delendai.config.json'), '{"name":"old"}\n');
		mkdirSync(join(root, '.git'), { recursive: true });
		writeFileSync(join(root, '.git/config'), '[core]\n\tbare = false\n');
		const gitBefore = readFileSync(join(root, '.git/config'));

		let written: IWrittenRecord | undefined;
		let taken: readonly IBackup[] = [];
		const outcome = await runMigrationTransaction(
			{
				discover: async () => [baseMigration(async () => undefined)],
				plan: async () => [],
				backup: async () => {
					taken = backupOf(root);
					return taken;
				},
				apply: async () => {
					writeFileSync(
						join(root, 'stray.txt'),
						'made by the attempt\n',
					);
					written = await recordWrittenSince(root, taken);
					throw new Error('boom-apply');
				},
				validate: async () => ({ ok: true, reason: '' }),
				commit: async () => undefined,
				rollback: async (backups, ctx, reason) =>
					rollback(backups, ctx, reason, undefined, written),
			},
			{ workspaceRoot: root },
		);

		expect(outcome.status).toBe('rolled-back');
		expect(readFileSync(join(root, '.git/config')).equals(gitBefore)).toBe(
			true,
		);
		expect(existsSync(join(root, 'stray.txt'))).toBe(false);
		if (outcome.status === 'committed') throw new Error('unreachable');
		const recorded = await readManifestFromDisk(outcome.manifestPath);
		expect(recorded?.validationResult).toEqual({
			ok: false,
			reason: 'apply: boom-apply',
		});
	});

	it('rolls back to the original tree hash when VALIDATE fails after apply', async () => {
		const root = makeWorkspace();
		writeFileSync(join(root, 'delendai.config.json'), '{"name":"old"}\n');
		const before = treeHash(root);

		const phases: ITransactionPhases = {
			discover: async () => [baseMigration(async () => undefined)],
			plan: async () => [
				{
					kind: 'rewrite-config-file',
					detail: 'delendai.config.json: 1 string field(s) carry the legacy identity',
				},
			],
			backup: async () => backupOf(root),
			apply: async () => {
				writeFileSync(
					join(root, 'delendai.config.json'),
					'{"name":"new"}\n',
				);
			},
			validate: async () => ({ ok: false, reason: 'boom-validate' }),
			commit: async () => undefined,
			rollback: async (backups, ctx, reason) =>
				rollback(backups, ctx, reason),
		};

		const outcome = await runMigrationTransaction(phases, {
			workspaceRoot: root,
		});
		expect(outcome.status).toBe('rolled-back');
		expect(treeHash(root)).toBe(before);
	});

	it('writes the 10-field manifest and persists the backup snapshot on success', async () => {
		const root = makeWorkspace();
		mkdirSync(join(root, '.delendai'), { recursive: true });
		writeFileSync(join(root, 'delendai.config.json'), '{"name":"old"}\n');

		const phases = createDefaultPhases({
			migrations: [
				baseMigration(async (workspaceRoot) => {
					writeFileSync(
						join(workspaceRoot, 'delendai.config.json'),
						'{"name":"new"}\n',
					);
				}),
			],
		});

		const outcome = await runMigrationTransaction(phases, {
			workspaceRoot: root,
		});
		expect(outcome.status).toBe('committed');
		if (outcome.status !== 'committed') return;

		const parsed = await readManifestFromDisk(outcome.manifestPath);
		expect(parsed).not.toBeNull();
		expect(Object.keys(parsed ?? {}).sort()).toEqual([
			'affectedFiles',
			'hashesAfter',
			'hashesBefore',
			'hostConfigChanges',
			'id',
			'packageChanges',
			'renames',
			'timestamp',
			'validationResult',
			'version',
		]);

		const persisted = await readPersistedBackups(root, outcome.manifest);
		expect(persisted).not.toBeNull();
		expect(persisted?.some((entry) => entry.kind === 'file')).toBe(true);
		expect(
			persisted?.some(
				(entry) =>
					entry.kind === 'file' &&
					entry.path === 'delendai.config.json',
			),
		).toBe(true);
	});

	it('default phases remove what the attempt created and keep a file another process wrote after', async () => {
		const root = makeWorkspace();
		writeFileSync(join(root, 'delendai.config.json'), '{"name":"old"}\n');
		const phases = createDefaultPhases({
			migrations: [
				baseMigration(async (workspace) => {
					mkdirSync(join(workspace, 'made'));
					writeFileSync(join(workspace, 'made', 'new.txt'), 'ours\n');
					writeFileSync(
						join(workspace, 'delendai.config.json'),
						'{"name":"new"}\n',
					);
				}),
			],
		});

		const outcome = await runMigrationTransaction(
			{
				...phases,
				// Between the apply and the rollback, somebody else writes.
				validate: async () => {
					writeFileSync(join(root, 'bystander.md'), 'not ours\n');
					return { ok: false, reason: 'forced' };
				},
			},
			{ workspaceRoot: root },
		);

		expect(outcome.status).toBe('rolled-back');
		expect(existsSync(join(root, 'made'))).toBe(false);
		expect(readFileSync(join(root, 'delendai.config.json'), 'utf8')).toBe(
			'{"name":"old"}\n',
		);
		expect(readFileSync(join(root, 'bystander.md'), 'utf8')).toBe(
			'not ours\n',
		);
	});

	it('reads renames, package and host-config changes into the manifest', async () => {
		const root = makeWorkspace();
		mkdirSync(join(root, '.vscode'));
		writeFileSync(join(root, 'package.json'), '{"name":"old"}\n');
		writeFileSync(join(root, '.vscode/mcp.json'), '{"a":1}\n');
		const migration: IMigration = {
			id: 'steps:v1',
			detect: async () => true,
			plan: async () => [
				{ kind: 'rename', detail: 'x: old/dir → new/dir' },
				{ kind: 'rename', detail: 'not a pair' },
				{ kind: 'manifest-changed', detail: 'package.json' },
				{ kind: 'rewrite-host-config', detail: '.vscode/mcp.json' },
			],
			apply: async (ctx) => {
				writeFileSync(
					join(ctx.workspaceRoot, 'package.json'),
					'{"name":"new"}\n',
				);
				writeFileSync(
					join(ctx.workspaceRoot, '.vscode/mcp.json'),
					'{"a":2}\n',
				);
			},
		};
		const outcome = await runMigrationTransaction(
			createDefaultPhases({ migrations: [migration] }),
			{ workspaceRoot: root },
		);
		expect(outcome.status).toBe('committed');
		if (outcome.status !== 'committed') return;
		expect(outcome.manifest.renames).toEqual([
			{ from: 'old/dir', to: 'new/dir' },
		]);
		expect(outcome.manifest.packageChanges).toHaveLength(1);
		expect(outcome.manifest.packageChanges[0]?.from).not.toBe(
			outcome.manifest.packageChanges[0]?.to,
		);
		expect(outcome.manifest.hostConfigChanges[0]?.file).toBe(
			'.vscode/mcp.json',
		);
		expect(outcome.manifest.affectedFiles).toEqual([
			'.vscode/mcp.json',
			'package.json',
		]);
	});

	it('records one-shot migrations in the journal, skips applied ones, and never records a standing check', async () => {
		const root = makeWorkspace();
		writeFileSync(join(root, 'delendai.config.json'), '{}\n');
		const recorded: string[] = [];
		const journal = {
			read: async () => ['done:v1'],
			record: async (_root: string, id: string) => {
				recorded.push(id);
			},
		};
		const make = (id: string, convergent?: boolean): IMigration => ({
			id,
			...(convergent === undefined ? {} : { convergent }),
			detect: async () => true,
			plan: async () => [],
			apply: async () => undefined,
		});
		let committed = 0;
		const outcome = await runMigrationTransaction(
			createDefaultPhases({
				migrations: [
					make('done:v1'),
					make('new:v1'),
					make('check:v1', true),
				],
				journal,
				commit: async () => {
					committed += 1;
				},
			}),
			{ workspaceRoot: root },
		);
		expect(outcome.status).toBe('committed');
		expect(recorded).toEqual(['new:v1']);
		expect(committed).toBe(1);
	});

	it('reports rollback-failed when the rollback itself throws', async () => {
		const root = makeWorkspace();
		writeFileSync(join(root, 'delendai.config.json'), '{}\n');
		const phases = createDefaultPhases({
			migrations: [
				baseMigration(async () => {
					throw new Error('boom');
				}),
			],
		});
		const outcome = await runMigrationTransaction(
			{
				...phases,
				rollback: async () => {
					throw new Error('disk gone');
				},
			},
			{ workspaceRoot: root },
		);
		expect(outcome.status).toBe('rollback-failed');
		if (outcome.status !== 'rollback-failed') return;
		expect(outcome.rollbackErrors[0]?.reason).toBe('disk gone');
	});

	it('rolls the latest migration back from its persisted backup, leaving files it cannot prove ours', async () => {
		const root = makeWorkspace();
		writeFileSync(join(root, 'delendai.config.json'), '{"name":"old"}\n');
		const outcome = await runMigrationTransaction(
			createDefaultPhases({
				migrations: [
					baseMigration(async (workspace) => {
						writeFileSync(
							join(workspace, 'delendai.config.json'),
							'{"name":"new"}\n',
						);
						writeFileSync(join(workspace, 'created.txt'), 'x\n');
					}),
				],
			}),
			{ workspaceRoot: root },
		);
		expect(outcome.status).toBe('committed');
		const report = await rollbackLatestMigration(
			{ workspaceRoot: root },
			outcome.manifest,
			'undo',
		);
		expect(report.restored).toContain('delendai.config.json');
		expect(readFileSync(join(root, 'delendai.config.json'), 'utf8')).toBe(
			'{"name":"old"}\n',
		);
		expect(report.skipped).toContain('created.txt');
		expect(existsSync(join(root, 'created.txt'))).toBe(true);

		await expect(
			rollbackLatestMigration(
				{ workspaceRoot: root },
				{ id: 'never-ran', timestamp: 'now' },
				'undo',
			),
		).rejects.toThrow(/missing persisted backup/);
	});

	it('route phases find nothing to do in a workspace that never adopted delendai', async () => {
		const root = makeWorkspace();
		const phases = createWorkspaceRoutePhases({
			migrations: [],
			journal: { read: async () => [], record: async () => undefined },
		});
		expect(await phases.discover({ workspaceRoot: root })).toEqual([]);
		expect(await phases.plan([], { workspaceRoot: root })).toEqual([]);
		await phases.apply([], { workspaceRoot: root });
	});
});
