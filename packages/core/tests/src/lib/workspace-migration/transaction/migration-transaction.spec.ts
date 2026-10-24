import {
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
	runMigrationTransaction,
	type IBackup,
	type ITransactionPhases,
} from '@delendai/core/lib/workspace-migration/transaction/migration-transaction';
import { readManifestFromDisk } from '@delendai/core/lib/workspace-migration/transaction/migration-manifest';
import {
	readPersistedBackups,
	rollback,
} from '@delendai/core/lib/workspace-migration/transaction/rollback';

const roots: string[] = [];

const makeWorkspace = (): string => {
	const root = mkdtempSync(join(tmpdir(), 'delendai-s6-'));
	roots.push(root);
	return root;
};

const treeHash = (root: string): string => {
	const digest = createHash('sha256');
	const visit = (dir: string, prefix = ''): void => {
		const entries = require('node:fs')
			.readdirSync(dir, { withFileTypes: true })
			.sort((a: { name: string }, b: { name: string }) =>
				a.name.localeCompare(b.name),
			);
		for (const entry of entries) {
			const rel = prefix === '' ? entry.name : `${prefix}/${entry.name}`;
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
});
