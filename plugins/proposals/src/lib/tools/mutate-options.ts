/**
 * mutate-options.ts — shared options + ports for the `proposals_edit`
 * and `proposals_add_slice` tools.
 *
 * SOLID — extracted from the original `mutate-tools.ts` so each
 * tool's body reads only the options it needs, and so the file
 * mutex / read / write operations can be inverted (the host injects
 * an `IMutateStore` instead of the tools importing `node:fs`).
 *
 * The `IMutateStore` interface is the dependency-inversion hook: the
 * production wiring wraps `withFileMutex` + `readFile` + `writeFileAtomic`
 * in one port; tests can swap a `MemoryMutateStore` that reads
 * from a `Map<string, string>` and writes to itself.
 */
import { readFile } from 'node:fs/promises';

import { withFileMutex, writeFileAtomic } from '@mcp-vertex/core/public';

import type { IHostPathLayout } from '../contracts/interfaces/swarm-path-layout.interface';

/**
 * The minimum surface the mutate tools need from a "store": read a
 * proposal file, write a proposal file, and run a function under
 * the per-path lock.
 *
 * DIP — the tools depend on this interface, not on `node:fs`. The
 * production `RealMutateStore` lives in `mutate-tools.ts` (private)
 * and is constructed by the plugin's `register()`.
 */
export interface IMutateStore {
	read(absPath: string): Promise<string | null>;
	write(absPath: string, content: string): Promise<void>;
	withLock<T>(absPath: string, fn: () => Promise<T>): Promise<T>;
}

export interface IMutateToolOptions {
	readonly namespacePrefix: string;
	readonly workspaceRoot: string;
	readonly indexPathAbs: string;
	/**
	 * x00052: absolute path of the proposals directory. Required so
	 * `join(proposalsDir, entry.file)` stays anchored to the content
	 * root after the index moved under `cacheDir`. Optional for legacy
	 * test fixtures — the `proposal-paths` helper falls back to
	 * `dirname(indexPathAbs)` when absent.
	 */
	readonly proposalsDirAbs?: string;
	readonly layout?: Pick<
		IHostPathLayout,
		'proposalsDir' | 'proposalIndexFile'
	>;
	readonly extraFolders?: readonly string[];
}

/**
 * Production wiring of `IMutateStore` — wraps the durable primitives.
 * Tests that want to inject a fake pass their own `IMutateStore`
 * implementation through `buildProposalsEditRegistration(options, store)`.
 */
export const buildRealMutateStore = async (): Promise<IMutateStore> => ({
	async read(absPath) {
		try {
			return await readFile(absPath, 'utf8');
		} catch {
			return null;
		}
	},
	async write(absPath, content) {
		await writeFileAtomic(absPath, content);
	},
	withLock: (absPath, fn) => withFileMutex(absPath, fn),
});
