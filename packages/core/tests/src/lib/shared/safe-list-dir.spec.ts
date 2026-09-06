import { describe, expect, it } from 'vitest';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
	safeListDir,
	safeListDirNames,
	safeListDirRequired,
	safePathExists,
	SafeListDirReadFailed,
	emptySafeListDirResult,
} from '@delendai/core/lib/shared/safe-list-dir';

const scratch = (): string => mkdtempSync(join(tmpdir(), 'mcp-safe-list-'));

describe('safeListDir (no-silent-readdir primitive)', () => {
	it('returns the directory entries when the directory exists and is non-empty', async () => {
		const dir = scratch();
		writeFileSync(join(dir, 'a.md'), 'a');
		writeFileSync(join(dir, 'b.md'), 'b');
		const result = await safeListDir(dir);
		expect(result.readFailed).toBe(false);
		expect(result.reason).toBeUndefined();
		expect(result.error).toBeUndefined();
		expect(result.entries.map((e) => e.name).sort()).toEqual([
			'a.md',
			'b.md',
		]);
	});

	it('returns the empty shape (not readFailed) when the directory is empty', async () => {
		const dir = scratch();
		const result = await safeListDir(dir);
		expect(result.entries).toEqual([]);
		expect(result.readFailed).toBe(false);
		expect(result.reason).toBe('directory-empty');
	});

	it('returns the directory-does-not-exist reason (not readFailed) when the path is missing', async () => {
		const dir = join(scratch(), 'missing');
		const result = await safeListDir(dir);
		expect(result.entries).toEqual([]);
		expect(result.readFailed).toBe(false);
		expect(result.reason).toBe('directory-does-not-exist');
		expect(result.error).toBeUndefined();
	});

	it('rejects relative paths with a clear error', async () => {
		await expect(safeListDir('relative/path')).rejects.toThrow(
			/absolute path/,
		);
	});

	it('returns readFailed=true with the original error preserved on EACCES', async () => {
		// EACCES is platform-specific. We skip when the runner is
		// root (the kernel never returns EACCES for owner-runnable
		// dirs) so the assertion is portable.
		if (process.getuid?.() === 0) return;
		const dir = scratch();
		const locked = join(dir, 'locked');
		mkdirSync(locked);
		// Strip permissions AFTER creating — `mkdirSync` with
		// `mode: 0o000` would fail under the `recursive: false`
		// default when the directory already exists.
		const { chmodSync } = await import('node:fs');
		chmodSync(locked, 0o000);
		try {
			const result = await safeListDir(locked);
			expect(result.entries).toEqual([]);
			expect(result.readFailed).toBe(true);
			expect(result.reason).toBe('read-failed');
			expect((result.error as NodeJS.ErrnoException).code).toBe('EACCES');
		} finally {
			// restore so the tmp scratch dir can be cleaned up
			chmodSync(locked, 0o755);
		}
	});
});

describe('safeListDirNames (string convenience)', () => {
	it('returns just the names when the directory exists', async () => {
		const dir = scratch();
		writeFileSync(join(dir, 'x.md'), 'x');
		const { names, result } = await safeListDirNames(dir);
		expect(names).toEqual(['x.md']);
		expect(result.readFailed).toBe(false);
	});
});

describe('emptySafeListDirResult (test helper)', () => {
	it('returns a result with the chosen reason and readFailed flag', () => {
		const missing = emptySafeListDirResult('directory-does-not-exist');
		expect(missing.readFailed).toBe(false);
		expect(missing.reason).toBe('directory-does-not-exist');

		const failed = emptySafeListDirResult('read-failed', new Error('boom'));
		expect(failed.readFailed).toBe(true);
		expect(failed.reason).toBe('read-failed');
		expect(failed.error).toBeInstanceOf(Error);
	});
});

describe('safePathExists (companion probe)', () => {
	it('returns exists=true with kind=file for a regular file', async () => {
		const dir = scratch();
		const file = join(dir, 'a');
		writeFileSync(file, 'x');
		expect(await safePathExists(file)).toEqual({
			exists: true,
			kind: 'file',
		});
	});

	it('returns exists=true with kind=directory for a directory', async () => {
		const dir = scratch();
		expect(await safePathExists(dir)).toEqual({
			exists: true,
			kind: 'directory',
		});
	});

	it('returns exists=false with reason=path-does-not-exist for a missing path', async () => {
		const dir = join(scratch(), 'gone');
		expect(await safePathExists(dir)).toEqual({
			exists: false,
			reason: 'path-does-not-exist',
		});
	});

	it('rejects relative paths', async () => {
		await expect(safePathExists('relative')).rejects.toThrow(
			/absolute path/,
		);
	});
});

describe('safeListDirRequired (fail-closed variant)', () => {
	it('returns the entries when the directory exists and is non-empty', async () => {
		const dir = scratch();
		writeFileSync(join(dir, 'a.md'), 'a');
		const result = await safeListDirRequired(dir);
		expect(result.map((e) => e.name).sort()).toEqual(['a.md']);
	});

	it('returns an empty array when the directory does not exist (ENOENT is legitimate)', async () => {
		const result = await safeListDirRequired(join(scratch(), 'gone'));
		expect(result).toEqual([]);
	});

	it('returns an empty array when the directory exists but is empty', async () => {
		const result = await safeListDirRequired(scratch());
		expect(result).toEqual([]);
	});

	it('throws SafeListDirReadFailed on EACCES, preserving the original cause', async () => {
		if (process.getuid?.() === 0) return;
		const dir = scratch();
		const locked = join(dir, 'locked');
		mkdirSync(locked);
		const { chmodSync } = await import('node:fs');
		chmodSync(locked, 0o000);
		let caught: unknown;
		try {
			await safeListDirRequired(locked);
			expect.fail('expected SafeListDirReadFailed');
		} catch (error) {
			caught = error;
		} finally {
			chmodSync(locked, 0o755);
		}
		expect(caught).toBeInstanceOf(SafeListDirReadFailed);
		// The `as` cast narrows the type at compile time but the
		// runtime symbol must come from the same import as the
		// `instanceof` check above (vitest's source transform
		// re-binds type-only imports).
		const typed = caught as InstanceType<typeof SafeListDirReadFailed>;
		expect(typed.absDir).toBe(locked);
		expect((typed.cause as NodeJS.ErrnoException).code).toBe('EACCES');
	});
});
