/**
 * Public surface of `@mcp-vertex/git`. The default export (in
 * `../index.ts`) is the loadable `IMcpPlugin`; this barrel exposes the
 * git helpers + tool builder for programmatic reuse.
 */
export { default } from '../index';

export {
	createGitRunner,
	checkRepo,
	parseStatus,
	parseLog,
	parseBlamePorcelain,
	parseWorktreeList,
	gitStatus,
	gitChanged,
	gitDiffStat,
	gitLog,
	gitBlame,
	gitShow,
	gitWorktreeList,
} from '../lib/git';
export type {
	IGitRunner,
	IGitRunResult,
	IRepoCheck,
	IGitStatus,
	IGitStatusEntry,
	IGitCommit,
	IGitBlameLine,
	IGitBlameResult,
	IGitShowDetail,
	IGitShowResult,
	IGitWorktreeEntry,
} from '../lib/git';
export { buildGitToolRegistrations } from '../lib/tools';
export type { IGitToolOptions } from '../lib/tools';

// --- generated tool-output types (N23, see scripts/generate-tool-types.ts) ---
export type * from '../generated/tool-outputs';
