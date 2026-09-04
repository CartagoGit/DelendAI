/**
 * inherit-host-instructions-options.interface.ts — f00094 S3.
 *
 * Wiring options for `buildInheritHostInstructionsRegistration`. The
 * plugin bootstrap (`plugins/proposals/src/index.ts`) fills these from
 * the resolved core roots; the tool stays free of `process.cwd()` and
 * of any path-resolution policy of its own.
 */
import type { IFileReader } from '@delendai/core/public';

import type { IHostPathLayout } from './swarm-path-layout.interface';
import type { IUserHomeReader } from './host-instructions-inventory.interface';

export interface IInheritHostInstructionsToolOptions {
	readonly namespacePrefix: string;
	readonly workspaceRoot: string;
	/** Reads the three in-repo host files (workspace-bounded). */
	readonly reader: IFileReader;
	/** Absolute proposals dir the emitted proposal is written under. */
	readonly proposalsDirAbs: string;
	/** Absolute per-kind id counter file (shared allocator, f00016 S13). */
	readonly counterPathAbs: string;
	/** Layout the post-write index sync uses so a relocated store stays coherent. */
	readonly layout: Pick<
		IHostPathLayout,
		'proposalsDir' | 'proposalIndexFile'
	>;
	/** Extra host-specific proposal subfolders the sync should also scan. */
	readonly extraFolders?: readonly string[];
	/**
	 * Optional home reader for the `scope: 'all'` user-home scan. When
	 * omitted, `scope: 'all'` degrades to "user-home files not present"
	 * (the scanner never invents a filesystem). Defaults to the real
	 * `createUserHomeReader()` at the composition edge.
	 */
	readonly homeReader?: IUserHomeReader;
}
