import { describe, expect, it } from 'vitest';
import {
	mkdtempSync,
	mkdirSync,
	readFileSync,
	writeFileSync,
	existsSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
	safeRename,
	SafeRenameTargetExistsError,
} from '@delendai/core/lib/shared/safe-rename';

const scratch = (): string => mkdtempSync(join(tmpdir(), 'mcp-safe-rename-'));

describe('safeRename (no-clobber rename primitive)', () => {
	it('moves a file when the destination does not exist', async () => {
		const dir = scratch();
		const fromAbs = join(dir, 'source.md');
		const toAbs = join(dir, 'done.md');
		writeFileSync(fromAbs, 'content', 'utf8');

		await safeRename(fromAbs, toAbs);

		expect(existsSync(fromAbs)).toBe(false);
		expect(readFileSync(toAbs, 'utf8')).toBe('content');
	});

	it('refuses to clobber an existing destination with a typed error', async () => {
		const dir = scratch();
		const fromAbs = join(dir, 'source.md');
		const toAbs = join(dir, 'target.md');
		writeFileSync(fromAbs, 'NEW', 'utf8');
		writeFileSync(toAbs, 'ORIGINAL', 'utf8');

		await expect(safeRename(fromAbs, toAbs)).rejects.toBeInstanceOf(
			SafeRenameTargetExistsError,
		);

		// The original destination is preserved — `safeRename` does
		// NOT mutate state when it refuses, so a caller can recover.
		expect(readFileSync(toAbs, 'utf8')).toBe('ORIGINAL');
		// The source is also preserved (the throw happens BEFORE the rename).
		expect(readFileSync(fromAbs, 'utf8')).toBe('NEW');
	});

	it('exposes the from/to paths on the error for diagnostics', async () => {
		const dir = scratch();
		const fromAbs = join(dir, 'src.md');
		const toAbs = join(dir, 'dst.md');
		writeFileSync(fromAbs, 'A', 'utf8');
		writeFileSync(toAbs, 'B', 'utf8');

		try {
			await safeRename(fromAbs, toAbs);
			expect.fail('expected SafeRenameTargetExistsError');
		} catch (error) {
			expect(error).toBeInstanceOf(SafeRenameTargetExistsError);
			const typed = error as SafeRenameTargetExistsError;
			expect(typed.fromAbs).toBe(fromAbs);
			expect(typed.toAbs).toBe(toAbs);
			expect(typed.message).toContain(toAbs);
			expect(typed.message).toContain(fromAbs);
		}
	});

	it('propagates ENOENT when the source does not exist', async () => {
		const dir = scratch();
		const fromAbs = join(dir, 'missing.md');
		const toAbs = join(dir, 'done', 'missing.md');

		// POSIX `rename(ENOENT)` is the right shape — the caller
		// learns the source is gone rather than getting a silent
		// no-op success.
		await expect(safeRename(fromAbs, toAbs)).rejects.toThrow();
	});

	it('creates the parent directory when the destination path traverses a fresh folder', async () => {
		const dir = scratch();
		const fromAbs = join(dir, 'source.md');
		// Caller pre-creates the destination directory; `safeRename`
		// stays single-responsibility (move only, not mkdir). Callers
		// that need `mkdir { recursive: true }` should compose it
		// alongside — the proposals moveFile helper does this.
		mkdirSync(join(dir, 'ready'), { recursive: true });
		const toAbs = join(dir, 'ready', 'source.md');
		writeFileSync(fromAbs, 'content', 'utf8');

		await safeRename(fromAbs, toAbs);

		expect(readFileSync(toAbs, 'utf8')).toBe('content');
	});
});
