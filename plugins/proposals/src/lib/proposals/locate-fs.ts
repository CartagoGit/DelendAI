/**
 * locate-fs.ts — the filesystem port for `locate.ts`.
 *
 * SOLID — Dependency Inversion. `locateByIndex` / `locateByScan` /
 * `locateProposal` previously imported `readFile` / `readdir` from
 * `node:fs/promises` directly, which made them impossible to unit-
 * test without touching the real filesystem. With `IProposalFs`, the
 * three locators take the port as an optional argument (default
 * wiring uses the real fs); tests inject a `MemoryProposalFs` that
 * reads from a `Map<string, string>` and lists from a `string[]`.
 *
 * Production wiring:
 *
 *   const fs = buildNodeProposalFs();
 *   await locateByIndex(indexPathAbs, id, fs);
 *
 * Test wiring:
 *
 *   const fs: IProposalFs = {
 *     read: async (p) => store.get(p) ?? null,
 *     list: async (p) => store.get(p) ?? [],
 *   };
 *   await locateByIndex(indexPathAbs, id, fs);
 */

export interface IProposalFs {
	/** Read a file as UTF-8. Returns `null` on ENOENT or read error. */
	read(absPath: string): Promise<string | null>;
	/** List a directory's entries. Returns `[]` on ENOENT or read error. */
	list(absPath: string): Promise<readonly string[]>;
}

/**
 * Production wiring of `IProposalFs` over `node:fs/promises`. Kept
 * in this file so the locator module can be tested without the
 * node:fs dep (and so a future host can swap to a `Bun.file` or
 * `Deno.openSync` wiring without editing `locate.ts`).
 */
export const buildNodeProposalFs = (): IProposalFs => {
	// Lazy import to keep this contract file free of `node:` deps at
	// module-evaluation time. Tests that never call this factory pay
	// zero import cost.
	type FsMod = typeof import('node:fs/promises');
	let mod: FsMod | null = null;
	const load = (): FsMod => {
		if (mod === null) {
			// eslint-disable-next-line @typescript-eslint/no-require-imports
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
				return await load().readdir(absPath);
			} catch {
				return [];
			}
		},
	};
};

/** Default port for the locators. The first call wires the real fs;
 *  tests can pass a fake port through the 3rd argument. */
export const DEFAULT_PROPOSAL_FS: IProposalFs = buildNodeProposalFs();
