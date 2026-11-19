import { mkdir, mkdtemp, readFile, rename, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import {
	createWorkspaceBackup,
	backupSnapshotPathFor,
	hashWorkspaceAt,
	persistBackups,
	readPersistedBackups,
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

	it('keeps a recorded file whose bytes changed since, and a directory it did not record', async () => {
		const workspaceRoot = await mkdtemp(
			join(tmpdir(), 'delendai-x01026-changed-'),
		);
		const backups = await createWorkspaceBackup(workspaceRoot);
		await mkdir(join(workspaceRoot, 'made'));
		await writeFile(join(workspaceRoot, 'made', 'a.txt'), 'ours\n');
		const written = await recordWrittenSince(workspaceRoot, backups);
		expect(written.directories).toEqual(['made']);
		// Someone edits the file we created, and adds a sibling directory.
		await writeFile(
			join(workspaceRoot, 'made', 'a.txt'),
			'edited by them\n',
		);
		await mkdir(join(workspaceRoot, 'theirs'));

		const report = await rollback(
			backups,
			{ workspaceRoot },
			'test',
			undefined,
			written,
		);

		expect(report.removed).toEqual([]);
		expect(report.skipped).toEqual(
			expect.arrayContaining(['made/a.txt', 'theirs', 'made']),
		);
		expect(
			await readFile(join(workspaceRoot, 'made', 'a.txt'), 'utf8'),
		).toBe('edited by them\n');
	});

	it('removes a file the backup recorded as absent, and skips one already gone', async () => {
		const workspaceRoot = await mkdtemp(
			join(tmpdir(), 'delendai-x01026-absent-'),
		);
		await writeFile(join(workspaceRoot, 'there.txt'), 'x\n');
		const report = await rollback(
			[
				{ kind: 'file', path: 'there.txt', contentBase64: null },
				{ kind: 'file', path: 'gone.txt', contentBase64: null },
			],
			{ workspaceRoot },
			'test',
		);
		expect(report.removed).toEqual(['there.txt']);
		expect(report.skipped).toEqual(['gone.txt']);
		expect(report.errors).toEqual([]);
	});

	it('reads back only well-formed persisted backups', async () => {
		const workspaceRoot = await mkdtemp(
			join(tmpdir(), 'delendai-x01026-persist-'),
		);
		const input = { id: 'm', timestamp: 't' };
		expect(await readPersistedBackups(workspaceRoot, input)).toBeNull();
		await persistBackups(workspaceRoot, input, [
			{ kind: 'file', path: 'a.txt', contentBase64: 'eAo=' },
			{ kind: 'file', path: 'b.txt', contentBase64: null },
		]);
		expect(await readPersistedBackups(workspaceRoot, input)).toEqual([
			{ kind: 'file', path: 'a.txt', contentBase64: 'eAo=' },
			{ kind: 'file', path: 'b.txt', contentBase64: null },
		]);
		await writeFile(
			backupSnapshotPathFor(workspaceRoot, input),
			JSON.stringify([
				null,
				{ kind: 'directory', path: 'd' },
				{ kind: 'file', path: 'ok', contentBase64: 'eAo=' },
				{ kind: 'file', path: 'bad', contentBase64: 5 },
				{ kind: 7, path: 'x' },
			]),
		);
		expect(await readPersistedBackups(workspaceRoot, input)).toEqual([
			{ kind: 'directory', path: 'd' },
			{ kind: 'file', path: 'ok', contentBase64: 'eAo=' },
		]);
		await writeFile(backupSnapshotPathFor(workspaceRoot, input), '{}');
		expect(await readPersistedBackups(workspaceRoot, input)).toBeNull();
	});

	it('leaves a recorded directory that still holds something', async () => {
		const workspaceRoot = await mkdtemp(
			join(tmpdir(), 'delendai-x01026-notempty-'),
		);
		const backups = await createWorkspaceBackup(workspaceRoot);
		await mkdir(join(workspaceRoot, 'made'));
		const written = await recordWrittenSince(workspaceRoot, backups);
		await writeFile(join(workspaceRoot, 'made', 'theirs.txt'), 'y\n');
		const report = await rollback(
			backups,
			{ workspaceRoot },
			't',
			undefined,
			written,
		);
		expect(report.skipped).toContain('made');
		expect(report.errors).toEqual([]);
	});
});
