/**
 * index-reader-fs.ts — filesystem port for `index-reader.ts`.
 *
 * SOLID — Dependency Inversion. The three readers in `index-reader.ts`
 * (`readJsonOrNull`, `readTextOrNull`, `readProposalIndex`) used to
 * import `readFile` from `node:fs/promises` directly, which made
 * them impossible to unit-test without touching the real
 * filesystem. With `IIndexFs`, the readers take the port as an
 * optional argument; default wiring uses the real fs; tests inject
 * a fake.
 *
 * Mirrors the `IProposalFs` pattern from `locate-fs.ts`: the same
 * shape (async + `null` on failure) so callers can reuse the same
 * fake reader across both modules if they want.
 *
 * Production wiring:
 *
 *   const fs = buildNodeIndexFs();
 *   await readJsonOrNull('/abs/path', fs);
 *
 * Test wiring:
 *
 *   const fs: IIndexFs = {
 *     read: async (p) => store.get(p) ?? null,
 *   };
 *   await readJsonOrNull('/abs/path', fs);
 */

export interface IIndexFs {
	/** Read a file as UTF-8. Returns `null` on ENOENT or read error. */
	read(absPath: string): Promise<string | null>;
}

/**
 * Production wiring of `IIndexFs` over `node:fs/promises`. Kept
 * in this file so the reader module can be tested without the
 * `node:fs` dep.
 */
export const buildNodeIndexFs = (): IIndexFs => {
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
	};
};

/** Default port for the index readers. Tests can pass a fake
 *  through the optional 2nd argument of each reader. */
export const DEFAULT_INDEX_FS: IIndexFs = buildNodeIndexFs();
