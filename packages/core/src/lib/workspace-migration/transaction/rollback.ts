/**
 * rollback.ts — b00239 S6.
 *
 * S6 needs byte-for-byte rollback verification. The simplest safe
 * implementation is a workspace snapshot of every file plus the set of
 * directories that existed before APPLY, then a restore pass that:
 *
 *  1. rewrites every original file byte-for-byte,
 *  2. removes every file created during APPLY, and
 *  3. prunes every directory that did not exist in the snapshot.
 *
 * That is enough to restore renamed directories too, because a rename is
 * just "missing old files + new files elsewhere" from the rollback's
 * point of view.
 */
import { createHash } from 'node:crypto';
import {
	mkdir,
	readdir,
	readFile,
	rename,
	rm,
	rmdir,
	writeFile,
} from 'node:fs/promises';
import { dirname, join, relative } from 'node:path';

import type { ITxContext } from './migration-transaction';

export type IBackup =
	| {
			readonly kind: 'directory';
			readonly path: string;
	  }
	| {
			readonly kind: 'file';
			readonly path: string;
			readonly contentBase64: string | null;
	  };

export interface IRollbackReport {
	readonly restored: readonly string[];
	readonly removed: readonly string[];
	readonly skipped: readonly string[];
	readonly errors: readonly {
		readonly path: string;
		readonly reason: string;
	}[];
}

export interface IWorkspaceBackupOptions {
	readonly excludePrefixes?: readonly string[];
}

const DEFAULT_EXCLUDES = ['.git', '.delendai/migration-manifests'] as const;

export const createWorkspaceBackup = async (
	workspaceRoot: string,
	options?: IWorkspaceBackupOptions,
): Promise<readonly IBackup[]> => {
	const excludes = options?.excludePrefixes ?? DEFAULT_EXCLUDES;
	const snapshot: IBackup[] = [];
	for (const dir of await scanDirectories(workspaceRoot, '', excludes)) {
		snapshot.push({ kind: 'directory', path: dir });
	}
	for (const file of await scanFiles(workspaceRoot, '', excludes)) {
		const bytes = await readFile(join(workspaceRoot, file));
		snapshot.push({
			kind: 'file',
			path: file,
			contentBase64: bytes.toString('base64'),
		});
	}
	return snapshot;
};

export const rollback = async (
	backups: readonly IBackup[],
	ctx: ITxContext,
	_reason: string,
): Promise<IRollbackReport> => {
	const restored: string[] = [];
	const removed: string[] = [];
	const skipped: string[] = [];
	const errors: { path: string; reason: string }[] = [];
	const expectedFiles = new Map<string, string | null>();
	const expectedDirs = new Set<string>(['']);

	for (const backup of backups) {
		if (backup.kind === 'directory') {
			expectedDirs.add(backup.path);
			continue;
		}
		expectedFiles.set(backup.path, backup.contentBase64);
		for (const dir of ancestorDirectories(backup.path))
			expectedDirs.add(dir);
	}

	for (const current of await scanFiles(ctx.workspaceRoot, '', [])) {
		if (expectedFiles.has(current)) continue;
		try {
			await rm(join(ctx.workspaceRoot, current), { force: false });
			removed.push(current);
		} catch (error) {
			errors.push({
				path: current,
				reason: error instanceof Error ? error.message : String(error),
			});
		}
	}

	for (const [path, contentBase64] of expectedFiles) {
		const absolute = join(ctx.workspaceRoot, path);
		try {
			if (contentBase64 === null) {
				const removedNow = await removeIfExists(absolute);
				if (removedNow) removed.push(path);
				else skipped.push(path);
				continue;
			}
			await atomicWrite(absolute, Buffer.from(contentBase64, 'base64'));
			restored.push(path);
		} catch (error) {
			errors.push({
				path,
				reason: error instanceof Error ? error.message : String(error),
			});
		}
	}

	const dirs = await scanDirectories(ctx.workspaceRoot, '', []);
	for (const dir of [...dirs].sort((a, b) => b.length - a.length)) {
		if (expectedDirs.has(dir)) continue;
		try {
			await rmdir(join(ctx.workspaceRoot, dir));
			removed.push(dir);
		} catch (error) {
			if (
				typeof error === 'object' &&
				error !== null &&
				'code' in error &&
				(error as { code: unknown }).code === 'ENOTEMPTY'
			) {
				skipped.push(dir);
				continue;
			}
			errors.push({
				path: dir,
				reason: error instanceof Error ? error.message : String(error),
			});
		}
	}

	return { restored, removed, skipped, errors };
};

export const hashFileAt = async (absolutePath: string): Promise<string> => {
	const bytes = await readFile(absolutePath);
	return createHash('sha256').update(bytes).digest('hex');
};

export const hashWorkspaceAt = async (
	workspaceRoot: string,
): Promise<string> => {
	const hash = createHash('sha256');
	const files = await scanFiles(workspaceRoot, '', DEFAULT_EXCLUDES);
	for (const file of files.sort()) {
		hash.update(file);
		hash.update(await readFile(join(workspaceRoot, file)));
	}
	return hash.digest('hex');
};

const ancestorDirectories = (relativePath: string): readonly string[] => {
	const parts = relativePath.split('/');
	const dirs: string[] = [];
	for (let index = 1; index < parts.length; index += 1) {
		dirs.push(parts.slice(0, index).join('/'));
	}
	return dirs;
};

const shouldExclude = (
	relativePath: string,
	excludes: readonly string[],
): boolean =>
	excludes.some(
		(prefix) =>
			relativePath === prefix || relativePath.startsWith(`${prefix}/`),
	);

const scanDirectories = async (
	workspaceRoot: string,
	relativeRoot: string,
	excludes: readonly string[],
): Promise<string[]> => {
	const absoluteRoot =
		relativeRoot === '' ? workspaceRoot : join(workspaceRoot, relativeRoot);
	const entries = await readdir(absoluteRoot, { withFileTypes: true });
	const dirs: string[] = [];
	for (const entry of entries) {
		const next = normalizeRelative(
			relativeRoot === '' ? entry.name : `${relativeRoot}/${entry.name}`,
		);
		if (shouldExclude(next, excludes)) continue;
		if (!entry.isDirectory()) continue;
		dirs.push(next);
		dirs.push(...(await scanDirectories(workspaceRoot, next, excludes)));
	}
	return dirs;
};

const scanFiles = async (
	workspaceRoot: string,
	relativeRoot: string,
	excludes: readonly string[],
): Promise<string[]> => {
	const absoluteRoot =
		relativeRoot === '' ? workspaceRoot : join(workspaceRoot, relativeRoot);
	const entries = await readdir(absoluteRoot, { withFileTypes: true });
	const files: string[] = [];
	for (const entry of entries) {
		const next = normalizeRelative(
			relativeRoot === '' ? entry.name : `${relativeRoot}/${entry.name}`,
		);
		if (shouldExclude(next, excludes)) continue;
		if (entry.isDirectory()) {
			files.push(...(await scanFiles(workspaceRoot, next, excludes)));
			continue;
		}
		if (entry.isFile()) files.push(next);
	}
	return files;
};

const normalizeRelative = (value: string): string =>
	relative('', value).replaceAll('\\', '/');

const removeIfExists = async (absolutePath: string): Promise<boolean> => {
	try {
		await rm(absolutePath, { force: false });
		return true;
	} catch (error) {
		if (
			typeof error === 'object' &&
			error !== null &&
			'code' in error &&
			(error as { code: unknown }).code === 'ENOENT'
		) {
			return false;
		}
		throw error;
	}
};

let monotonicCounter = 0;

const atomicWrite = async (
	absolutePath: string,
	content: Buffer,
): Promise<void> => {
	await mkdir(dirname(absolutePath), { recursive: true });
	const tmp = `${absolutePath}.rollback-tmp-${process.pid}-${monotonicCounter++}-${Date.now()}`;
	try {
		await writeFile(tmp, content);
		await rename(tmp, absolutePath);
	} catch (error) {
		await rm(tmp, { force: true }).catch(() => undefined);
		throw error;
	}
};
