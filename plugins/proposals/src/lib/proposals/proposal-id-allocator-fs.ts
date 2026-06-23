/**
 * proposal-id-allocator-fs.ts — filesystem port for
 * `proposal-id-allocator.ts`.
 *
 * SOLID — Dependency Inversion. The allocator used to import
 * `readFile` and `readdir` from `node:fs/promises` directly, which
 * made the race-safe id-allocation logic impossible to unit-test
 * without touching the real proposals tree. With `IAllocatorFs`,
 * the two helpers take the port as an optional argument; default
 * wiring uses the real fs; tests inject a fake.
 *
 * Mirrors the patterns of `locate-fs.ts` and `index-reader-fs.ts`:
 * a single async read/list surface, lazy `require` of the `node:fs`
 * module so the contract file is fs-free at evaluation time.
 *
 * Production wiring:
 *
 *   const fs = buildNodeAllocatorFs();
 *   await seedFromDisk(proposalsDirAbs, fs);
 *
 * Test wiring:
 *
 *   const fs: IAllocatorFs = {
 *     read: async (p) => store.get(p) ?? null,
 *     list: async (p) => store.get(p) ?? [],
 *   };
 *   await seedFromDisk(proposalsDirAbs, fs);
 */

export interface IAllocatorFs {
	/** Read a file as UTF-8. Returns `null` on ENOENT or read error. */
	read(absPath: string): Promise<string | null>;
	/**
	 * List a directory's entries. Each entry carries the name and a
	 * `isFile` flag so the caller can filter without a second
	 * `stat` round-trip.
	 */
	list(
		absPath: string,
	): Promise<readonly { name: string; isFile: boolean }[]>;
}

export const buildNodeAllocatorFs = (): IAllocatorFs => {
	type FsMod = typeof import('node:fs/promises');
	let mod: FsMod | null = null;
	const load = (): FsMod => {
		if (mod === null) {
			mod = require('node:fs/promises') as FsMod;
		}
		return mod;
	};
	return {
		async read(absPath) {
			try {
				return await load().readFile(absPath, 'utf8');
			} catch {
				return null;
			}
		},
		async list(absPath) {
			try {
				const dirents = await load().readdir(absPath, {
					withFileTypes: true,
				});
				return dirents.map((d) => ({
					name: d.name,
					isFile: d.isFile(),
				}));
			} catch {
				return [];
			}
		},
	};
};

export const DEFAULT_ALLOCATOR_FS: IAllocatorFs = buildNodeAllocatorFs();
