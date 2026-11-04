import { mkdir, mkdtemp, readFile, rename, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import {
	createWorkspaceBackup,
	hashWorkspaceAt,
	recordWrittenSince,
	rollback,
} from '@delendai/core/lib/workspace-migration/transaction/rollback';

describe('rollback (b00239 S6)', () => {
	it('restores file bytes, directory renames, and removes newly created files', async () => {
		const workspaceRoot = await mkdtemp(
			join(tmpdir(), 'delendai-s6-rollback-'),
		);
		await mkdir(join(workspaceRoot, 'docs', 'legacy'), { recursive: true });
		await writeFile(
			join(workspaceRoot, 'docs', 'legacy', 'note.md'),
			'legacy\n',
		);
		await writeFile(
			join(workspaceRoot, 'config.json'),
			'{"name":"legacy"}\n',
		);
		const before = await hashWorkspaceAt(workspaceRoot);
		const backups = await createWorkspaceBackup(workspaceRoot);

		await rename(
			join(workspaceRoot, 'docs', 'legacy'),
			join(workspaceRoot, 'docs', 'modern'),
		);
		await writeFile(
			join(workspaceRoot, 'config.json'),
			'{"name":"modern"}\n',
		);
		await writeFile(
			join(workspaceRoot, 'new.txt'),
			'created during apply\n',
		);

		const written = await recordWrittenSince(workspaceRoot, backups);
		const report = await rollback(
			backups,
			{ workspaceRoot },
			'forced test rollback',
			undefined,
			written,
		);
		const after = await hashWorkspaceAt(workspaceRoot);

		expect(report.errors).toEqual([]);
		expect(after).toBe(before);
		expect(await readFile(join(workspaceRoot, 'config.json'), 'utf8')).toBe(
			'{"name":"legacy"}\n',
		);
		expect(
			await readFile(
				join(workspaceRoot, 'docs', 'legacy', 'note.md'),
				'utf8',
			),
		).toBe('legacy\n');
	});

	it('leaves a file another process wrote after the backup', async () => {
		const workspaceRoot = await mkdtemp(
			join(tmpdir(), 'delendai-x01026-rollback-'),
		);
		await writeFile(join(workspaceRoot, 'config.json'), 'before\n');
		const backups = await createWorkspaceBackup(workspaceRoot);

		await writeFile(join(workspaceRoot, 'config.json'), 'after\n');
		await writeFile(
			join(workspaceRoot, 'created.txt'),
			'by the migration\n',
		);
		const written = await recordWrittenSince(workspaceRoot, backups);
		// Another process, after the transaction's own writes were recorded.
		await mkdir(join(workspaceRoot, 'theirs'));
		await writeFile(join(workspaceRoot, 'theirs', 'note.md'), 'not ours\n');

		const report = await rollback(
			backups,
			{ workspaceRoot },
			'forced test rollback',
			undefined,
			written,
		);

		expect(report.errors).toEqual([]);
		expect(report.removed).toEqual(['created.txt']);
		expect(await readFile(join(workspaceRoot, 'config.json'), 'utf8')).toBe(
			'before\n',
		);
		expect(
			await readFile(join(workspaceRoot, 'theirs', 'note.md'), 'utf8'),
		).toBe('not ours\n');
	});

	it('deletes nothing it has no record of', async () => {
		const workspaceRoot = await mkdtemp(
			join(tmpdir(), 'delendai-x01026-norecord-'),
		);
		const backups = await createWorkspaceBackup(workspaceRoot);
		await writeFile(join(workspaceRoot, 'unknown.txt'), 'x\n');

		const report = await rollback(backups, { workspaceRoot }, 'test');

		expect(report.removed).toEqual([]);
		expect(await readFile(join(workspaceRoot, 'unknown.txt'), 'utf8')).toBe(
			'x\n',
		);
	});
});
