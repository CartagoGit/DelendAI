/**
 * io-real.ts — production IBridgeIo backed by node:fs.
 *
 * Deliberately a thin re-export of the alias IO so the same
 * permissions contract applies to both surfaces: ENOENT is the only
 * "soft" error, everything else propagates so the manager can
 * diagnose `unreadable` rather than guessing. A bridge that silently
 * succeeds against an unwritable directory is a bridge that lies.
 */

import { chmod, mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

import { createNodeAliasIo } from '../alias/io-real';
import type { IBridgeIo } from '../../contracts/interfaces/bridge.interface';

export { createNodeAliasIo };

/**
 * The production IO adapter for the bridge installer. Wraps every
 * call in a try/catch returning the in-band "soft" failure mode
 * (ENOENT → `false` for `exists`, `undefined` for `read`) but
 * propagates real errors so the manager can distinguish "no file
 * here" from "permissions problem".
 */
export const createNodeBridgeIo = (): IBridgeIo => {
	const aliasIo = createNodeAliasIo();
	return {
		join: (...parts) => join(...parts),
		exists: aliasIo.exists,
		read: aliasIo.read,
		write: async (path, contents) => {
			// Make sure the parent directory exists; the installer writes
			// several files into a brand-new directory.
			await mkdir(dirname(path), { recursive: true });
			await writeFile(path, contents, 'utf8');
		},
		remove: aliasIo.remove,
		makeExecutable: async (path) => {
			if (process.platform !== 'win32') {
				try {
					await chmod(path, 0o755);
				} catch {
					// Filesystem (FAT in WSL) rejects chmod. The shim is
					// still callable via `node <path>`.
				}
			}
		},
		// legacyNames is optional; we only set it when a per-name override
		// is needed (e.g. tests, fork of the installer).
	};
};
