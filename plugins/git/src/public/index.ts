/**
 * Public surface of `@cartago-git/mcp-git`. The default export (in
 * `../index.ts`) is the loadable `IMcpPlugin`; this barrel exposes the
 * git helpers + tool builder for programmatic reuse.
 */
export { default } from '../index';

export {
	createGitRunner,
	checkRepo,
	parseStatus,
	parseLog,
	gitStatus,
	gitChanged,
	gitDiffStat,
	gitLog,
} from '../lib/git';
export type {
	IGitRunner,
	IGitRunResult,
	IRepoCheck,
	IGitStatus,
	IGitStatusEntry,
	IGitCommit,
} from '../lib/git';
export { buildGitToolRegistrations } from '../lib/tools';
export type { IGitToolOptions } from '../lib/tools';

// --- generated tool-output types (N23, see scripts/generate-tool-types.ts) ---
export type * from '../generated/tool-outputs';
