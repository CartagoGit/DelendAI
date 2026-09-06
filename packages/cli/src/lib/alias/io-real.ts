/**
 * io-real.ts — production IAliasIo backed by node:fs.
 *
 * b00239 S3: the previous `fakeIo` stub in alias.command.ts
 * returned `false` from `exists`, `undefined` from `read`, and
 * was a no-op for `write` / `remove`. That made the alias
 * subcommand claim `created` without ever writing to disk.
 *
 * This module is the production adapter. Tests construct an
 * `IAliasIo` directly via the alias-manager tests; production
 * code calls `createNodeAliasIo()`.
 *
 * The adapter deliberately wraps every call in a try/catch
 * (returning `false` / `undefined` / no-throw respectively)
 * because the alias-manager treats "could not be read" as
 * `unreadable` and "could not be written" as a recoverable
 * error. The alias is a convenience, not a contract; a
 * filesystem hiccup must never be fatal.
 */

import { chmod, mkdir, readFile, unlink, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

import type { IAliasIo } from '../../contracts/interfaces/alias.interface';

export const createNodeAliasIo = (): IAliasIo => ({
	join: (...parts: readonly string[]) => join(...parts),

	exists: async (path: string): Promise<boolean> => {
		try {
			const { stat } = await import('node:fs/promises');
			await stat(path);
			return true;
		} catch {
			return false;
		}
	},

	read: async (path: string): Promise<string | undefined> => {
		try {
			return await readFile(path, 'utf8');
		} catch {
			return undefined;
		}
	},

	write: async (path: string, contents: string): Promise<void> => {
		// Make sure the parent directory exists; bin dirs do, but
		// a future caller may target a custom binDir.
		await mkdir(dirname(path), { recursive: true });
		await writeFile(path, contents, 'utf8');
		// POSIX: make executable. Windows: no-op (chmod is a no-op
		// there, and the shim is run via PATHEXT extension lookup).
		if (process.platform !== 'win32') {
			try {
				await chmod(path, 0o755);
			} catch {
				// Some filesystems (e.g. FAT mounts in WSL) reject
				// chmod. The shim is still runnable via `node path`.
			}
		}
	},

	remove: async (path: string): Promise<void> => {
		try {
			await unlink(path);
		} catch (error) {
			// ENOENT is success. Everything else is swallowed: the
			// alias-manager already verified the file is ours.
			const code = (error as NodeJS.ErrnoException).code;
			if (code !== 'ENOENT') {
				// Re-throw so the manager's try/catch surfaces a real
				// failure rather than silently succeeding.
				throw error;
			}
		}
	},

	makeExecutable: async (path: string): Promise<void> => {
		if (process.platform !== 'win32') {
			try {
				await chmod(path, 0o755);
			} catch {
				// Already handled in `write`; swallow here too so
				// callers can invoke it independently without surprises.
			}
		}
	},
});
